const viewport = document.getElementById('viewport')
const world = document.getElementById('world')
const edgesSvg = document.getElementById('edges')
const nodesEl = document.getElementById('nodes')
const nodeToolbar = document.getElementById('node-toolbar')
const boardNameEl = document.getElementById('board-name')
const zoomLabel = document.getElementById('zoom-label')
const boardGrid = document.getElementById('board-grid')
const welcomeEl = document.getElementById('welcome')
const rectsEl = document.getElementById('rects')

// Cores dos nós (identidade Takeat primeiro)
const COLORS = [
	{ bg: '#e11d2e', fg: '#ffffff' },
	{ bg: '#1d1d21', fg: '#f0f0f2' },
	{ bg: '#f5f5f7', fg: '#1d1d21' },
	{ bg: '#fbbf24', fg: '#211a03' },
	{ bg: '#34d668', fg: '#03210e' },
	{ bg: '#8b5cf6', fg: '#ffffff' },
]

const BOARDS_KEY = 'takeatmap-boards'
const WELCOME_KEY = 'takeatmap-welcomed'
const EDGE_GRAB = 8 // px de borda do nó que viram alça de redimensionar

// ---------- estado ----------

let boards = [] // [{id, name, updatedAt, nodes, edges}]
let board = null // quadro aberto (referência a um item de boards)
const cam = { s: 1, ox: 0, oy: 0 }
let selectedId = null
let editingId = null
const nodeEls = new Map()

const uid = () => crypto.randomUUID().slice(0, 8)

function newBoardData(name) {
	return {
		id: uid(),
		name: name || 'Meu mapa',
		updatedAt: Date.now(),
		nodes: [{ id: uid(), x: 0, y: 0, text: 'Tema central', color: 0 }],
		edges: [],
		rects: [],
	}
}

// ---------- persistência (coleção de quadros) ----------

let saveTimer
function persist() {
	clearTimeout(saveTimer)
	saveTimer = setTimeout(() => {
		try {
			localStorage.setItem(BOARDS_KEY, JSON.stringify(boards))
		} catch {}
	}, 300)
}

function touch() {
	if (board) board.updatedAt = Date.now()
	persist()
}

function loadBoards() {
	try {
		const raw = localStorage.getItem(BOARDS_KEY)
		if (raw) {
			const data = JSON.parse(raw)
			if (Array.isArray(data)) boards = data.filter((b) => b && Array.isArray(b.nodes))
		}
	} catch {}
	// migra o quadro único da versão anterior pra coleção
	try {
		const legacy = localStorage.getItem('takeatmap-board')
		if (legacy) {
			const data = JSON.parse(legacy)
			if (data && Array.isArray(data.nodes) && data.nodes.length) {
				boards.unshift({
					id: uid(),
					name: data.name || 'Meu mapa',
					updatedAt: Date.now(),
					nodes: data.nodes,
					edges: data.edges || [],
				})
			}
			localStorage.removeItem('takeatmap-board')
			persist()
		}
	} catch {}
}

// ---------- galeria ----------

function fmtDate(ts) {
	const d = new Date(ts)
	const today = new Date()
	if (d.toDateString() === today.toDateString()) {
		return `hoje às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
	}
	return d.toLocaleDateString('pt-BR')
}

function showGallery() {
	endEdit()
	selectedId = null
	board = null
	document.body.classList.add('in-gallery')
	renderGallery()
}

function renderGallery() {
	boardGrid.innerHTML = ''

	const novo = document.createElement('button')
	novo.className = 'bcard new'
	novo.innerHTML = '<span class="plus">+</span><span>Novo mapa</span>'
	novo.addEventListener('click', () => {
		const b = newBoardData()
		boards.unshift(b)
		persist()
		openBoardById(b.id)
	})
	boardGrid.appendChild(novo)

	const sorted = [...boards].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
	for (const b of sorted) {
		const card = document.createElement('button')
		card.className = 'bcard'
		const name = document.createElement('div')
		name.className = 'bname'
		name.textContent = b.name || 'Sem nome'
		const meta = document.createElement('div')
		meta.className = 'bmeta'
		meta.textContent = `${b.nodes.length} ${b.nodes.length === 1 ? 'ideia' : 'ideias'} · ${fmtDate(b.updatedAt || Date.now())}`
		const dots = document.createElement('div')
		dots.className = 'bdots'
		for (const n of b.nodes.slice(0, 8)) {
			const i = document.createElement('i')
			i.style.background = (COLORS[n.color] || COLORS[0]).bg
			dots.appendChild(i)
		}
		const del = document.createElement('span')
		del.className = 'bdel'
		del.title = 'Apagar mapa'
		del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
		del.addEventListener('click', (e) => {
			e.stopPropagation()
			if (!confirm(`Apagar o mapa "${b.name}"? Isso não tem volta.`)) return
			boards = boards.filter((x) => x.id !== b.id)
			persist()
			renderGallery()
		})
		card.append(name, meta, dots, del)
		card.addEventListener('click', () => openBoardById(b.id))
		boardGrid.appendChild(card)
	}
}

function openBoardById(id) {
	const b = boards.find((x) => x.id === id)
	if (!b) return
	board = b
	if (!Array.isArray(board.rects)) board.rects = []
	selectedId = null
	selectedRectId = null
	editingId = null
	document.body.classList.remove('in-gallery')
	boardNameEl.value = board.name
	renderAll()
	requestAnimationFrame(() => {
		fitView()
		maybeWelcome()
	})
}

// ---------- boas-vindas ----------

function maybeWelcome() {
	if (localStorage.getItem(WELCOME_KEY)) return
	welcomeEl.classList.add('show')
}

document.getElementById('welcome-go').addEventListener('click', () => {
	welcomeEl.classList.remove('show')
	localStorage.setItem(WELCOME_KEY, '1')
})

document.getElementById('btn-help').addEventListener('click', () => {
	welcomeEl.classList.add('show')
})

// ---------- câmera ----------

function applyTransform() {
	world.style.transform = `translate(${cam.ox}px, ${cam.oy}px) scale(${cam.s})`
	viewport.style.backgroundSize = `${26 * cam.s}px ${26 * cam.s}px`
	viewport.style.backgroundPosition = `${cam.ox}px ${cam.oy}px`
	zoomLabel.textContent = `${Math.round(cam.s * 100)}%`
	positionToolbar()
}

const screenToWorld = (px, py) => ({ x: (px - cam.ox) / cam.s, y: (py - cam.oy) / cam.s })

function zoomAt(px, py, factor) {
	const before = screenToWorld(px, py)
	cam.s = Math.min(2.5, Math.max(0.15, cam.s * factor))
	cam.ox = px - before.x * cam.s
	cam.oy = py - before.y * cam.s
	applyTransform()
}

function fitView() {
	if (!board || !board.nodes.length) return
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const n of board.nodes) {
		const el = nodeEls.get(n.id)
		const w = el ? el.offsetWidth : 160
		const h = el ? el.offsetHeight : 44
		minX = Math.min(minX, n.x)
		minY = Math.min(minY, n.y)
		maxX = Math.max(maxX, n.x + w)
		maxY = Math.max(maxY, n.y + h)
	}
	for (const r of board.rects || []) {
		minX = Math.min(minX, r.x)
		minY = Math.min(minY, r.y)
		maxX = Math.max(maxX, r.x + r.w)
		maxY = Math.max(maxY, r.y + r.h)
	}
	const vw = viewport.clientWidth
	const vh = viewport.clientHeight
	const pad = 90
	// nunca passa de 100%: enquadrar poucos nós não deve dar zoom gigante
	cam.s = Math.min(1, Math.max(0.15, Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2))))
	cam.ox = (vw - (maxX + minX) * cam.s) / 2
	cam.oy = (vh - (maxY + minY) * cam.s) / 2
	applyTransform()
}

// ---------- render ----------

function renderAll() {
	nodesEl.innerHTML = ''
	nodeEls.clear()
	if (!board) return
	for (const n of board.nodes) nodesEl.appendChild(buildNodeEl(n))
	renderRects()
	renderEdges()
	updateSelection()
}

function buildNodeEl(n) {
	const el = document.createElement('div')
	el.className = 'node'
	el.dataset.id = n.id
	const color = COLORS[n.color] || COLORS[0]
	el.style.background = color.bg
	el.style.color = color.fg
	el.style.left = `${n.x}px`
	el.style.top = `${n.y}px`
	if (n.w) {
		el.style.width = `${n.w}px`
		el.style.maxWidth = 'none'
	}
	const txt = document.createElement('div')
	txt.className = 'txt'
	txt.textContent = n.text
	el.appendChild(txt)
	// bolinhas de conexão: arrastar de uma delas cria uma ligação
	for (const side of ['l', 'r', 't', 'b']) {
		const h = document.createElement('div')
		h.className = `hdl ${side}`
		h.title = 'Arraste até outro nó pra conectar'
		h.addEventListener('pointerdown', (e) => {
			e.stopPropagation()
			if (editingId === n.id) return
			selectedId = n.id
			selectedRectId = null
			refreshRectSelection()
			updateSelection()
			connectState = { from: n.id, side }
			viewport.setPointerCapture(e.pointerId)
		})
		el.appendChild(h)
	}
	nodeEls.set(n.id, el)
	return el
}

function sidePoint(n, el, side) {
	const w = el.offsetWidth
	const h = el.offsetHeight
	if (side === 'l') return { x: n.x, y: n.y + h / 2 }
	if (side === 'r') return { x: n.x + w, y: n.y + h / 2 }
	if (side === 't') return { x: n.x + w / 2, y: n.y }
	return { x: n.x + w / 2, y: n.y + h }
}

function renderEdges() {
	edgesSvg.innerHTML = ''
	if (!board) return
	for (const e of board.edges) {
		const a = nodeEls.get(e.from)
		const b = nodeEls.get(e.to)
		const na = getNode(e.from)
		const nb = getNode(e.to)
		if (!a || !b || !na || !nb) continue
		const ax = na.x + a.offsetWidth / 2
		const ay = na.y + a.offsetHeight / 2
		const bx = nb.x + b.offsetWidth / 2
		const by = nb.y + b.offsetHeight / 2
		const dx = Math.max(40, Math.abs(bx - ax) * 0.45)
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
		path.setAttribute('d', `M ${ax} ${ay} C ${ax + (bx >= ax ? dx : -dx)} ${ay}, ${bx + (bx >= ax ? -dx : dx)} ${by}, ${bx} ${by}`)
		if (e.from === selectedId || e.to === selectedId) path.classList.add('sel')
		edgesSvg.appendChild(path)
	}
}

function updateSelection() {
	for (const [id, el] of nodeEls) el.classList.toggle('selected', id === selectedId)
	renderEdges()
	positionToolbar()
}

// ---------- retângulos de área ----------

const getRect = (id) => (board ? (board.rects || []).find((r) => r.id === id) : null)

function refreshRectSelection() {
	for (const el of rectsEl.children) {
		el.classList.toggle('selected', el.dataset.id === selectedRectId)
	}
}

function renderRects() {
	rectsEl.innerHTML = ''
	if (!board) return
	for (const r of board.rects || []) rectsEl.appendChild(buildRectEl(r))
}

function buildRectEl(r) {
	const el = document.createElement('div')
	el.className = 'rect' + (r.id === selectedRectId ? ' selected' : '')
	el.dataset.id = r.id
	el.style.left = `${r.x}px`
	el.style.top = `${r.y}px`
	el.style.width = `${r.w}px`
	el.style.height = `${r.h}px`

	const tag = document.createElement('div')
	tag.className = 'rtag'
	tag.textContent = r.label || 'Área'
	tag.title = 'Arraste pra mover a área (leva os nós juntos) · duplo clique renomeia'
	tag.addEventListener('pointerdown', (e) => {
		e.stopPropagation()
		if (tag.isContentEditable) return
		const now = performance.now()
		if (lastRectTap.id === r.id && now - lastRectTap.t < 400) {
			lastRectTap = { id: null, t: 0 }
			startRectRename(r, tag)
			return
		}
		lastRectTap = { id: r.id, t: now }
		selectedRectId = r.id
		selectedId = null
		updateSelection()
		refreshRectSelection()
		// mover a área carrega os nós cujo centro está dentro dela
		const members = board.nodes
			.filter((n) => {
				const nel = nodeEls.get(n.id)
				const w = nel ? nel.offsetWidth : 120
				const h = nel ? nel.offsetHeight : 40
				const cx = n.x + w / 2
				const cy = n.y + h / 2
				return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
			})
			.map((n) => ({ id: n.id, ox: n.x, oy: n.y }))
		rectMoveState = { id: r.id, startX: e.clientX, startY: e.clientY, ox: r.x, oy: r.y, members }
		viewport.setPointerCapture(e.pointerId)
	})
	el.appendChild(tag)

	const grip = document.createElement('div')
	grip.className = 'rgrip'
	grip.title = 'Redimensionar área'
	grip.addEventListener('pointerdown', (e) => {
		e.stopPropagation()
		selectedRectId = r.id
		refreshRectSelection()
		rectResizeState = { id: r.id, startX: e.clientX, startY: e.clientY, ow: r.w, oh: r.h }
		viewport.setPointerCapture(e.pointerId)
	})
	el.appendChild(grip)
	return el
}

function startRectRename(r, tag) {
	rectMoveState = null
	tag.contentEditable = 'true'
	tag.spellcheck = false
	tag.focus()
	const range = document.createRange()
	range.selectNodeContents(tag)
	const sel = window.getSelection()
	sel.removeAllRanges()
	sel.addRange(range)
	const done = () => {
		tag.contentEditable = 'false'
		r.label = tag.textContent.trim() || 'Área'
		tag.textContent = r.label
		touch()
	}
	tag.addEventListener('blur', done, { once: true })
	tag.addEventListener('keydown', function onKey(e) {
		e.stopPropagation() // Tab/Delete do canvas não devem agir aqui
		if (e.key === 'Enter' || e.key === 'Escape') {
			e.preventDefault()
			tag.removeEventListener('keydown', onKey)
			tag.blur()
		}
	})
}

function deleteRect(id) {
	if (!board) return
	board.rects = (board.rects || []).filter((r) => r.id !== id)
	if (selectedRectId === id) selectedRectId = null
	renderRects()
	touch()
}

// ---------- toolbar flutuante ----------

function buildToolbar() {
	nodeToolbar.innerHTML = ''

	const child = document.createElement('button')
	child.className = 'child-btn'
	child.textContent = '+ filho'
	child.title = 'Criar nó filho (Tab)'
	child.addEventListener('pointerdown', (e) => e.stopPropagation())
	child.addEventListener('click', () => {
		if (selectedId) addChildOf(selectedId)
	})
	nodeToolbar.appendChild(child)

	const sep = document.createElement('div')
	sep.className = 'tsep'
	nodeToolbar.appendChild(sep)

	COLORS.forEach((c, i) => {
		const dot = document.createElement('button')
		dot.className = 'dot'
		dot.style.background = c.bg
		dot.title = 'Cor do nó'
		dot.addEventListener('pointerdown', (e) => e.stopPropagation())
		dot.addEventListener('click', () => {
			const n = getNode(selectedId)
			if (!n) return
			n.color = i
			const el = nodeEls.get(n.id)
			el.style.background = c.bg
			el.style.color = c.fg
			touch()
		})
		nodeToolbar.appendChild(dot)
	})

	const sep2 = document.createElement('div')
	sep2.className = 'tsep'
	nodeToolbar.appendChild(sep2)

	const del = document.createElement('button')
	del.className = 'del'
	del.title = 'Apagar nó (Delete)'
	del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
	del.addEventListener('pointerdown', (e) => e.stopPropagation())
	del.addEventListener('click', () => deleteNode(selectedId))
	nodeToolbar.appendChild(del)
}

function positionToolbar() {
	const n = getNode(selectedId)
	const el = selectedId && nodeEls.get(selectedId)
	if (!n || !el || editingId === selectedId) {
		nodeToolbar.style.display = 'none'
		return
	}
	nodeToolbar.style.display = 'flex'
	const sx = n.x * cam.s + cam.ox
	const sy = n.y * cam.s + cam.oy
	const w = el.offsetWidth * cam.s
	nodeToolbar.style.left = `${Math.round(sx + w / 2 - nodeToolbar.offsetWidth / 2)}px`
	nodeToolbar.style.top = `${Math.round(sy - nodeToolbar.offsetHeight - 12)}px`
}

// ---------- operações ----------

const getNode = (id) => (board ? board.nodes.find((n) => n.id === id) : null)

function addNode(x, y, text, color, parentId) {
	if (!board) return null
	const n = { id: uid(), x: Math.round(x), y: Math.round(y), text: text || 'Nova ideia', color: color ?? 1 }
	board.nodes.push(n)
	nodesEl.appendChild(buildNodeEl(n))
	if (parentId) board.edges.push({ from: parentId, to: n.id })
	selectedId = n.id
	updateSelection()
	touch()
	return n
}

function deleteNode(id) {
	if (!id || !board) return
	endEdit()
	board.nodes = board.nodes.filter((n) => n.id !== id)
	board.edges = board.edges.filter((e) => e.from !== id && e.to !== id)
	const el = nodeEls.get(id)
	if (el) el.remove()
	nodeEls.delete(id)
	if (selectedId === id) selectedId = null
	updateSelection()
	touch()
}

function toggleEdge(a, b) {
	if (a === b || !board) return
	const idx = board.edges.findIndex(
		(e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)
	)
	if (idx >= 0) board.edges.splice(idx, 1)
	else board.edges.push({ from: a, to: b })
	renderEdges()
	touch()
}

function childCount(parentId) {
	return board.edges.filter((e) => e.from === parentId).length
}

function addChildOf(parentId) {
	const p = getNode(parentId)
	const pel = nodeEls.get(parentId)
	if (!p || !pel) return
	const siblings = childCount(parentId)
	const n = addNode(
		p.x + pel.offsetWidth + 90,
		p.y + siblings * 64 - 8,
		'Nova ideia',
		p.color === 0 ? 1 : p.color,
		parentId
	)
	if (n) startEdit(n.id, true)
}

function addSiblingOf(id) {
	const parentEdge = board.edges.find((e) => e.to === id)
	if (parentEdge) {
		addChildOf(parentEdge.from)
		return
	}
	const n0 = getNode(id)
	const el = nodeEls.get(id)
	if (!n0 || !el) return
	const n = addNode(n0.x, n0.y + el.offsetHeight + 26, 'Nova ideia', n0.color)
	if (n) startEdit(n.id, true)
}

// ---------- edição de texto ----------

function startEdit(id, selectAll) {
	const el = nodeEls.get(id)
	const n = getNode(id)
	if (!el || !n) return
	endEdit()
	editingId = id
	selectedId = id
	el.classList.add('editing')
	const txt = el.querySelector('.txt')
	txt.contentEditable = 'true'
	txt.spellcheck = false
	txt.focus()
	if (selectAll) {
		const range = document.createRange()
		range.selectNodeContents(txt)
		const sel = window.getSelection()
		sel.removeAllRanges()
		sel.addRange(range)
	}
	updateSelection()
}

function endEdit() {
	if (!editingId) return
	const el = nodeEls.get(editingId)
	const n = getNode(editingId)
	if (el && n) {
		const txt = el.querySelector('.txt')
		txt.contentEditable = 'false'
		n.text = txt.textContent.trim() || 'Ideia'
		txt.textContent = n.text
		el.classList.remove('editing')
	}
	editingId = null
	renderEdges()
	positionToolbar()
	touch()
}

// ---------- interações de ponteiro ----------

let panState = null
let dragState = null
let resizeState = null
let connectState = null
let previewPath = null
let rectDrawState = null
let rectMoveState = null
let rectResizeState = null
let selectedRectId = null
let toolMode = 'select'
let lastTap = { id: null, t: 0 }
let lastRectTap = { id: null, t: 0 }

// alça de redimensionar: cursor muda perto das bordas laterais do nó
function edgeAt(el, clientX) {
	const rect = el.getBoundingClientRect()
	if (clientX - rect.left <= EDGE_GRAB) return 'l'
	if (rect.right - clientX <= EDGE_GRAB) return 'r'
	return null
}

nodesEl.addEventListener('mousemove', (e) => {
	const el = e.target.closest('.node')
	if (!el || el.classList.contains('editing')) return
	el.style.cursor = edgeAt(el, e.clientX) ? 'ew-resize' : ''
})

viewport.addEventListener('pointerdown', (e) => {
	if (!board) return
	const nodeEl = e.target.closest('.node')
	if (nodeEl) {
		const id = nodeEl.dataset.id
		if (e.ctrlKey && selectedId && selectedId !== id) {
			toggleEdge(selectedId, id)
			return
		}
		if (editingId && editingId !== id) endEdit()
		if (editingId === id) return

		// duplo clique manual: a captura de ponteiro do arrasto engole o
		// evento dblclick nativo, então detectamos na mão
		const now = performance.now()
		if (lastTap.id === id && now - lastTap.t < 400) {
			lastTap = { id: null, t: 0 }
			selectedId = id
			startEdit(id, false)
			return
		}
		lastTap = { id, t: now }

		selectedId = id
		updateSelection()

		selectedRectId = null
		refreshRectSelection()
		const edge = edgeAt(nodeEl, e.clientX)
		const n = getNode(id)
		if (edge) {
			resizeState = { id, edge, startX: e.clientX, ow: nodeEl.offsetWidth, ox: n.x }
		} else {
			dragState = { id, startX: e.clientX, startY: e.clientY, ox: n.x, oy: n.y, moved: false }
		}
		viewport.setPointerCapture(e.pointerId)
		return
	}
	if (e.target.closest('#node-toolbar') || e.target.closest('#zoombar')) return
	// fundo: desenhar retângulo (modo retângulo) ou pan + desseleciona
	if (editingId) endEdit()
	selectedId = null
	selectedRectId = null
	updateSelection()
	refreshRectSelection()
	if (toolMode === 'rect') {
		const vr = viewport.getBoundingClientRect()
		const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
		const tmp = document.createElement('div')
		tmp.className = 'rect selected'
		tmp.style.left = `${p.x}px`
		tmp.style.top = `${p.y}px`
		rectsEl.appendChild(tmp)
		rectDrawState = { x0: p.x, y0: p.y, el: tmp }
		viewport.setPointerCapture(e.pointerId)
		return
	}
	panState = { startX: e.clientX, startY: e.clientY, ox: cam.ox, oy: cam.oy }
	viewport.classList.add('panning')
	viewport.setPointerCapture(e.pointerId)
})

viewport.addEventListener('pointermove', (e) => {
	if (connectState) {
		const vr = viewport.getBoundingClientRect()
		const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
		const n = getNode(connectState.from)
		const el = nodeEls.get(connectState.from)
		if (!n || !el) return
		const a = sidePoint(n, el, connectState.side)
		const dx = Math.max(40, Math.abs(p.x - a.x) * 0.45)
		if (!previewPath) {
			previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			previewPath.classList.add('preview')
			edgesSvg.appendChild(previewPath)
		}
		previewPath.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + (p.x >= a.x ? dx : -dx)} ${a.y}, ${p.x + (p.x >= a.x ? -dx : dx)} ${p.y}, ${p.x} ${p.y}`)
		return
	}
	if (rectDrawState) {
		const vr = viewport.getBoundingClientRect()
		const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
		const x = Math.min(rectDrawState.x0, p.x)
		const y = Math.min(rectDrawState.y0, p.y)
		rectDrawState.el.style.left = `${x}px`
		rectDrawState.el.style.top = `${y}px`
		rectDrawState.el.style.width = `${Math.abs(p.x - rectDrawState.x0)}px`
		rectDrawState.el.style.height = `${Math.abs(p.y - rectDrawState.y0)}px`
		return
	}
	if (rectMoveState) {
		const r = getRect(rectMoveState.id)
		const el = rectsEl.querySelector(`[data-id="${rectMoveState.id}"]`)
		if (!r || !el) return
		const dx = (e.clientX - rectMoveState.startX) / cam.s
		const dy = (e.clientY - rectMoveState.startY) / cam.s
		r.x = Math.round(rectMoveState.ox + dx)
		r.y = Math.round(rectMoveState.oy + dy)
		el.style.left = `${r.x}px`
		el.style.top = `${r.y}px`
		for (const m of rectMoveState.members) {
			const n = getNode(m.id)
			const nel = nodeEls.get(m.id)
			if (!n || !nel) continue
			n.x = Math.round(m.ox + dx)
			n.y = Math.round(m.oy + dy)
			nel.style.left = `${n.x}px`
			nel.style.top = `${n.y}px`
		}
		renderEdges()
		positionToolbar()
		return
	}
	if (rectResizeState) {
		const r = getRect(rectResizeState.id)
		const el = rectsEl.querySelector(`[data-id="${rectResizeState.id}"]`)
		if (!r || !el) return
		r.w = Math.max(80, Math.round(rectResizeState.ow + (e.clientX - rectResizeState.startX) / cam.s))
		r.h = Math.max(50, Math.round(rectResizeState.oh + (e.clientY - rectResizeState.startY) / cam.s))
		el.style.width = `${r.w}px`
		el.style.height = `${r.h}px`
		return
	}
	if (resizeState) {
		const n = getNode(resizeState.id)
		const el = nodeEls.get(resizeState.id)
		if (!n || !el) return
		const dx = (e.clientX - resizeState.startX) / cam.s
		let w
		if (resizeState.edge === 'r') {
			w = Math.min(560, Math.max(70, Math.round(resizeState.ow + dx)))
		} else {
			w = Math.min(560, Math.max(70, Math.round(resizeState.ow - dx)))
			n.x = resizeState.ox + (resizeState.ow - w)
			el.style.left = `${n.x}px`
		}
		n.w = w
		el.style.width = `${w}px`
		el.style.maxWidth = 'none'
		renderEdges()
		positionToolbar()
		return
	}
	if (dragState) {
		const dx = (e.clientX - dragState.startX) / cam.s
		const dy = (e.clientY - dragState.startY) / cam.s
		if (Math.abs(dx) + Math.abs(dy) > 1) {
			dragState.moved = true
			lastTap = { id: null, t: 0 } // arrastar não conta como clique
		}
		const n = getNode(dragState.id)
		if (!n) return
		n.x = Math.round(dragState.ox + dx)
		n.y = Math.round(dragState.oy + dy)
		const el = nodeEls.get(n.id)
		el.style.left = `${n.x}px`
		el.style.top = `${n.y}px`
		renderEdges()
		positionToolbar()
		return
	}
	if (panState) {
		cam.ox = panState.ox + (e.clientX - panState.startX)
		cam.oy = panState.oy + (e.clientY - panState.startY)
		applyTransform()
	}
})

viewport.addEventListener('pointerup', (e) => {
	if (connectState) {
		const from = connectState.from
		connectState = null
		if (previewPath) {
			previewPath.remove()
			previewPath = null
		}
		const target = document.elementFromPoint(e.clientX, e.clientY)
		const nodeEl = target && target.closest ? target.closest('.node') : null
		if (nodeEl && nodeEl.dataset.id !== from) {
			// soltou em cima de outro nó: conecta (se ainda não existir)
			const to = nodeEl.dataset.id
			const exists = board.edges.some(
				(ed) => (ed.from === from && ed.to === to) || (ed.from === to && ed.to === from)
			)
			if (!exists) {
				board.edges.push({ from, to })
				renderEdges()
				touch()
			}
		} else if (!nodeEl && target && target.closest && !target.closest('#topbar') && !target.closest('#node-toolbar') && !target.closest('#zoombar')) {
			// soltou no vazio: cria um nó novo já conectado
			const vr = viewport.getBoundingClientRect()
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const src = getNode(from)
			const nn = addNode(p.x - 60, p.y - 18, 'Nova ideia', src && src.color === 0 ? 1 : (src ? src.color : 1), from)
			if (nn) startEdit(nn.id, true)
		}
		return
	}
	if (rectDrawState) {
		const el = rectDrawState.el
		const x = parseFloat(el.style.left) || 0
		const y = parseFloat(el.style.top) || 0
		const w = parseFloat(el.style.width) || 0
		const h = parseFloat(el.style.height) || 0
		el.remove()
		rectDrawState = null
		setToolMode('select')
		if (w >= 40 && h >= 40) {
			const r = { id: uid(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), label: 'Área' }
			board.rects = board.rects || []
			board.rects.push(r)
			selectedRectId = r.id
			renderRects()
			touch()
		}
		return
	}
	if (rectMoveState || rectResizeState) {
		rectMoveState = null
		rectResizeState = null
		touch()
		return
	}
	if ((dragState && dragState.moved) || resizeState) touch()
	dragState = null
	resizeState = null
	panState = null
	viewport.classList.remove('panning')
})

viewport.addEventListener('dblclick', (e) => {
	if (!board) return
	if (e.target.closest('.node') || e.target.closest('#node-toolbar') || e.target.closest('#zoombar')) return
	const rect = viewport.getBoundingClientRect()
	const p = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
	const n = addNode(p.x - 60, p.y - 20)
	if (n) startEdit(n.id, true)
})

viewport.addEventListener('wheel', (e) => {
	if (!board) return
	e.preventDefault()
	const rect = viewport.getBoundingClientRect()
	zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12)
}, { passive: false })

// ---------- teclado ----------

addEventListener('keydown', (e) => {
	if (!board) return
	if (e.target === boardNameEl) {
		if (e.key === 'Enter') boardNameEl.blur()
		return
	}
	if (welcomeEl.classList.contains('show')) {
		if (e.key === 'Escape' || e.key === 'Enter') {
			welcomeEl.classList.remove('show')
			localStorage.setItem(WELCOME_KEY, '1')
		}
		return
	}
	if (editingId) {
		if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
			e.preventDefault()
			const wasEditing = editingId
			endEdit()
			selectedId = wasEditing
			updateSelection()
		}
		if (e.key === 'Tab') {
			e.preventDefault()
			const wasEditing = editingId
			endEdit()
			addChildOf(wasEditing)
		}
		return
	}
	if (!selectedId) {
		if (selectedRectId && (e.key === 'Delete' || e.key === 'Backspace')) {
			e.preventDefault()
			deleteRect(selectedRectId)
		} else if (e.key === 'Escape') {
			selectedRectId = null
			refreshRectSelection()
			setToolMode('select')
		}
		return
	}
	if (e.key === 'Tab') {
		e.preventDefault()
		addChildOf(selectedId)
	} else if (e.key === 'Enter') {
		e.preventDefault()
		addSiblingOf(selectedId)
	} else if (e.key === 'Delete' || e.key === 'Backspace') {
		e.preventDefault()
		deleteNode(selectedId)
	} else if (e.key === 'F2') {
		e.preventDefault()
		startEdit(selectedId, false)
	} else if (e.key === 'Escape') {
		selectedId = null
		updateSelection()
	}
})

// ---------- botões ----------

document.getElementById('btn-add').addEventListener('click', () => {
	if (!board) return
	const rect = viewport.getBoundingClientRect()
	const p = screenToWorld(rect.width / 2, rect.height / 2)
	const n = addNode(p.x - 60, p.y - 20)
	if (n) startEdit(n.id, true)
})
document.getElementById('btn-fit').addEventListener('click', fitView)

const btnRect = document.getElementById('btn-rect')
function setToolMode(mode) {
	toolMode = mode
	btnRect.classList.toggle('active', mode === 'rect')
	viewport.classList.toggle('rect-mode', mode === 'rect')
}
btnRect.addEventListener('click', () => {
	if (!board) return
	setToolMode(toolMode === 'rect' ? 'select' : 'rect')
})
document.getElementById('btn-boards').addEventListener('click', showGallery)
document.getElementById('btn-open').addEventListener('click', async () => {
	const data = await window.takeatmap.openBoard()
	if (!data || !Array.isArray(data.nodes)) return
	const b = {
		id: uid(),
		name: data.name || 'Mapa importado',
		updatedAt: Date.now(),
		nodes: data.nodes,
		edges: data.edges || [],
		rects: Array.isArray(data.rects) ? data.rects : [],
	}
	boards.unshift(b)
	persist()
	openBoardById(b.id)
})
document.getElementById('btn-save').addEventListener('click', () => {
	if (!board) return
	window.takeatmap.saveBoard({ name: board.name, nodes: board.nodes, edges: board.edges, rects: board.rects || [] }, board.name)
})
document.getElementById('btn-back').addEventListener('click', () => {
	window.takeatmap.backToLauncher()
})
document.getElementById('zoom-in').addEventListener('click', () => {
	zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1.2)
})
document.getElementById('zoom-out').addEventListener('click', () => {
	zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1 / 1.2)
})
zoomLabel.addEventListener('click', () => {
	zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1 / cam.s)
})
boardNameEl.addEventListener('input', () => {
	if (!board) return
	board.name = boardNameEl.value.trim() || 'Meu mapa'
	touch()
})

// ---------- boot ----------

buildToolbar()
loadBoards()
showGallery()
