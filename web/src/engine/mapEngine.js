// Motor do quadro: câmera, nós, conexões, áreas, caneta e imagens.
//
// É JavaScript puro de propósito. Arrastar e desenhar precisam responder a
// 60 quadros por segundo mexendo direto nos elementos; passar cada
// movimento do mouse pelo React só adicionaria atraso. O React cuida da
// casca (login, galeria, barra de ferramentas, presença) e monta este
// motor dentro de uma div.

export const NODE_COLORS = [
	{ bg: '#e11d2e', fg: '#ffffff' },
	{ bg: '#1d1d21', fg: '#f0f0f2' },
	{ bg: '#f5f5f7', fg: '#1d1d21' },
	{ bg: '#fbbf24', fg: '#211a03' },
	{ bg: '#34d668', fg: '#03210e' },
	{ bg: '#8b5cf6', fg: '#ffffff' },
]

export const INK_COLORS = ['#ffffff', '#ff5a5a', '#fbbf24', '#34d668', '#8b5cf6']

const uid = () => crypto.randomUUID().slice(0, 8)
const clamp = (v, a, b) => (a > b ? v : Math.min(b, Math.max(a, v)))
const EDGE_GRAB = 8

// ---------- suavização da caneta ----------

function simplify(points, tol) {
	if (points.length < 3) return points
	const segDist = (p, a, b) => {
		let x = a.x
		let y = a.y
		let dx = b.x - x
		let dy = b.y - y
		if (dx || dy) {
			const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
			if (t > 1) {
				x = b.x
				y = b.y
			} else if (t > 0) {
				x += dx * t
				y += dy * t
			}
		}
		dx = p.x - x
		dy = p.y - y
		return dx * dx + dy * dy
	}
	const tol2 = tol * tol
	const keep = new Array(points.length).fill(false)
	keep[0] = true
	keep[points.length - 1] = true
	const stack = [[0, points.length - 1]]
	while (stack.length) {
		const [first, last] = stack.pop()
		let maxD = 0
		let idx = 0
		for (let i = first + 1; i < last; i++) {
			const d = segDist(points[i], points[first], points[last])
			if (d > maxD) {
				idx = i
				maxD = d
			}
		}
		if (maxD > tol2) {
			keep[idx] = true
			stack.push([first, idx], [idx, last])
		}
	}
	const out = points.filter((_, i) => keep[i])
	return out.length >= 2 ? out : points
}

function smoothPath(points) {
	if (points.length < 2) return ''
	if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
	let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] || points[i]
		const p1 = points[i]
		const p2 = points[i + 1]
		const p3 = points[i + 2] || p2
		const c1x = p1.x + (p2.x - p0.x) / 6
		const c1y = p1.y + (p2.y - p0.y) / 6
		const c2x = p2.x - (p3.x - p1.x) / 6
		const c2y = p2.y - (p3.y - p1.y) / 6
		d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
	}
	return d
}

/**
 * Cria o motor dentro de um elemento.
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {object} opts.board estado inicial (nodes, edges, rects, strokes, images)
 * @param {(board:object)=>void} opts.onChange chamado quando algo muda (para salvar)
 * @param {(file:File)=>Promise<{ref:string,src:string}>} opts.uploadImage
 * @param {(ref:string)=>Promise<string|null>} opts.resolveImage
 * @param {(pt:{x:number,y:number})=>void} [opts.onPointerMove] posição do mouse no quadro (presença)
 */
export function createMapEngine({ container, board, onChange, uploadImage, resolveImage, onPointerMove }) {
	container.innerHTML = `
		<div class="mp-viewport">
			<div class="mp-world">
				<div class="mp-rects"></div>
				<div class="mp-images"></div>
				<svg class="mp-edges"></svg>
				<svg class="mp-ink"></svg>
				<div class="mp-nodes"></div>
			</div>
			<div class="mp-peers"></div>
			<div class="mp-imggrip"></div>
			<div class="mp-nodebar"></div>
			<div class="mp-drop">Solte a imagem pra adicionar ao quadro</div>
		</div>`

	const viewport = container.querySelector('.mp-viewport')
	const world = container.querySelector('.mp-world')
	const rectsEl = container.querySelector('.mp-rects')
	const imagesEl = container.querySelector('.mp-images')
	const edgesSvg = container.querySelector('.mp-edges')
	const inkSvg = container.querySelector('.mp-ink')
	const nodesEl = container.querySelector('.mp-nodes')
	const peersEl = container.querySelector('.mp-peers')
	const imgGrip = container.querySelector('.mp-imggrip')
	const nodeBar = container.querySelector('.mp-nodebar')
	const dropEl = container.querySelector('.mp-drop')

	for (const k of ['nodes', 'edges', 'rects', 'strokes', 'images']) {
		if (!Array.isArray(board[k])) board[k] = []
	}

	const cam = { s: 1, ox: 0, oy: 0 }
	const nodeEls = new Map()
	let tool = 'select'
	let inkColor = INK_COLORS[0]
	let selNode = null
	let selRect = null
	let selImage = null
	let selStroke = null
	let editing = null

	let pan = null
	let drag = null
	let resize = null
	let connect = null
	let previewPath = null
	let rectDraw = null
	let rectMove = null
	let rectResize = null
	let imgDrag = null
	let imgResize = null
	let pen = null
	let lastTap = { id: null, t: 0 }
	let lastRectTap = { id: null, t: 0 }
	let destroyed = false

	const getNode = (id) => board.nodes.find((n) => n.id === id)
	const getRect = (id) => board.rects.find((r) => r.id === id)
	const getImage = (id) => board.images.find((i) => i.id === id)

	let saveTimer = null
	function changed() {
		clearTimeout(saveTimer)
		saveTimer = setTimeout(() => onChange && onChange(board), 400)
	}

	// ---------- câmera ----------

	function applyTransform() {
		world.style.transform = `translate(${cam.ox}px, ${cam.oy}px) scale(${cam.s})`
		viewport.style.backgroundSize = `${26 * cam.s}px ${26 * cam.s}px`
		viewport.style.backgroundPosition = `${cam.ox}px ${cam.oy}px`
		positionNodeBar()
		positionImgGrip()
		renderPeers()
		if (onZoom) onZoom(cam.s)
	}

	let onZoom = null
	const screenToWorld = (px, py) => ({ x: (px - cam.ox) / cam.s, y: (py - cam.oy) / cam.s })

	function zoomAt(px, py, factor) {
		const before = screenToWorld(px, py)
		cam.s = Math.min(2.5, Math.max(0.15, cam.s * factor))
		cam.ox = px - before.x * cam.s
		cam.oy = py - before.y * cam.s
		applyTransform()
	}

	function fitView() {
		const all = []
		for (const n of board.nodes) {
			const el = nodeEls.get(n.id)
			all.push([n.x, n.y, n.x + (el ? el.offsetWidth : 160), n.y + (el ? el.offsetHeight : 44)])
		}
		for (const r of board.rects) all.push([r.x, r.y, r.x + r.w, r.y + r.h])
		for (const im of board.images) {
			const el = imagesEl.querySelector(`[data-id="${im.id}"]`)
			all.push([im.x, im.y, im.x + im.w, im.y + (el ? el.offsetHeight : im.w * 0.6)])
		}
		if (!all.length) {
			cam.s = 1
			cam.ox = viewport.clientWidth / 2
			cam.oy = viewport.clientHeight / 2
			applyTransform()
			return
		}
		const minX = Math.min(...all.map((a) => a[0]))
		const minY = Math.min(...all.map((a) => a[1]))
		const maxX = Math.max(...all.map((a) => a[2]))
		const maxY = Math.max(...all.map((a) => a[3]))
		const vw = viewport.clientWidth
		const vh = viewport.clientHeight
		const pad = 90
		cam.s = Math.min(1, Math.max(0.15, Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2))))
		cam.ox = (vw - (maxX + minX) * cam.s) / 2
		cam.oy = (vh - (maxY + minY) * cam.s) / 2
		applyTransform()
	}

	// ---------- nós ----------

	function buildNodeEl(n) {
		const el = document.createElement('div')
		el.className = 'mp-node'
		el.dataset.id = n.id
		const color = NODE_COLORS[n.color] || NODE_COLORS[0]
		el.style.background = color.bg
		el.style.color = color.fg
		el.style.left = `${n.x}px`
		el.style.top = `${n.y}px`
		if (n.w) {
			el.style.width = `${n.w}px`
			el.style.maxWidth = 'none'
		}
		const txt = document.createElement('div')
		txt.className = 'mp-txt'
		txt.textContent = n.text
		el.appendChild(txt)
		for (const side of ['l', 'r', 't', 'b']) {
			const h = document.createElement('div')
			h.className = `mp-hdl ${side}`
			h.title = 'Arraste até outro nó pra conectar'
			h.addEventListener('pointerdown', (e) => {
				e.stopPropagation()
				if (editing === n.id) return
				selNode = n.id
				selRect = selImage = selStroke = null
				refreshSelection()
				connect = { from: n.id, side }
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

	function addNode(x, y, text, color, parentId) {
		const n = { id: uid(), x: Math.round(x), y: Math.round(y), text: text || 'Nova ideia', color: color ?? 1 }
		board.nodes.push(n)
		nodesEl.appendChild(buildNodeEl(n))
		if (parentId) board.edges.push({ from: parentId, to: n.id })
		selNode = n.id
		selRect = selImage = selStroke = null
		refreshSelection()
		changed()
		return n
	}

	function deleteNode(id) {
		endEdit()
		board.nodes = board.nodes.filter((n) => n.id !== id)
		board.edges = board.edges.filter((e) => e.from !== id && e.to !== id)
		nodeEls.get(id)?.remove()
		nodeEls.delete(id)
		if (selNode === id) selNode = null
		refreshSelection()
		changed()
	}

	function addChildOf(parentId) {
		const p = getNode(parentId)
		const pel = nodeEls.get(parentId)
		if (!p || !pel) return
		const siblings = board.edges.filter((e) => e.from === parentId).length
		const n = addNode(p.x + pel.offsetWidth + 90, p.y + siblings * 64 - 8, 'Nova ideia', p.color === 0 ? 1 : p.color, parentId)
		startEdit(n.id, true)
	}

	function addSiblingOf(id) {
		const parentEdge = board.edges.find((e) => e.to === id)
		if (parentEdge) return addChildOf(parentEdge.from)
		const n0 = getNode(id)
		const el = nodeEls.get(id)
		if (!n0 || !el) return
		const n = addNode(n0.x, n0.y + el.offsetHeight + 26, 'Nova ideia', n0.color)
		startEdit(n.id, true)
	}

	function startEdit(id, selectAll) {
		const el = nodeEls.get(id)
		const n = getNode(id)
		if (!el || !n) return
		endEdit()
		editing = id
		selNode = id
		el.classList.add('editing')
		const txt = el.querySelector('.mp-txt')
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
		refreshSelection()
	}

	function endEdit() {
		if (!editing) return
		const el = nodeEls.get(editing)
		const n = getNode(editing)
		if (el && n) {
			const txt = el.querySelector('.mp-txt')
			txt.contentEditable = 'false'
			n.text = txt.textContent.trim() || 'Ideia'
			txt.textContent = n.text
			el.classList.remove('editing')
		}
		editing = null
		renderEdges()
		positionNodeBar()
		changed()
	}

	// ---------- áreas ----------

	function renderRects() {
		rectsEl.innerHTML = ''
		for (const r of board.rects) rectsEl.appendChild(buildRectEl(r))
	}

	function buildRectEl(r) {
		const el = document.createElement('div')
		el.className = 'mp-rect' + (r.id === selRect ? ' selected' : '')
		el.dataset.id = r.id
		el.style.left = `${r.x}px`
		el.style.top = `${r.y}px`
		el.style.width = `${r.w}px`
		el.style.height = `${r.h}px`

		const tag = document.createElement('div')
		tag.className = 'mp-rtag'
		tag.textContent = r.label || 'Área'
		tag.title = 'Arraste pra mover a área com os nós · duplo clique renomeia'
		tag.addEventListener('pointerdown', (e) => {
			e.stopPropagation()
			if (tag.isContentEditable) return
			const now = performance.now()
			if (lastRectTap.id === r.id && now - lastRectTap.t < 400) {
				lastRectTap = { id: null, t: 0 }
				renameRect(r, tag)
				return
			}
			lastRectTap = { id: r.id, t: now }
			selRect = r.id
			selNode = selImage = selStroke = null
			refreshSelection()
			const members = board.nodes
				.filter((n) => {
					const nel = nodeEls.get(n.id)
					const cx = n.x + (nel ? nel.offsetWidth : 120) / 2
					const cy = n.y + (nel ? nel.offsetHeight : 40) / 2
					return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
				})
				.map((n) => ({ id: n.id, ox: n.x, oy: n.y }))
			rectMove = { id: r.id, startX: e.clientX, startY: e.clientY, ox: r.x, oy: r.y, members }
			viewport.setPointerCapture(e.pointerId)
		})
		el.appendChild(tag)

		const grip = document.createElement('div')
		grip.className = 'mp-rgrip'
		grip.addEventListener('pointerdown', (e) => {
			e.stopPropagation()
			selRect = r.id
			refreshSelection()
			rectResize = { id: r.id, startX: e.clientX, startY: e.clientY, ow: r.w, oh: r.h }
			viewport.setPointerCapture(e.pointerId)
		})
		el.appendChild(grip)
		return el
	}

	function renameRect(r, tag) {
		rectMove = null
		tag.contentEditable = 'true'
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
			changed()
		}
		tag.addEventListener('blur', done, { once: true })
		tag.addEventListener('keydown', function onKey(e) {
			e.stopPropagation()
			if (e.key === 'Enter' || e.key === 'Escape') {
				e.preventDefault()
				tag.removeEventListener('keydown', onKey)
				tag.blur()
			}
		})
	}

	// ---------- imagens ----------

	async function renderImages() {
		imagesEl.innerHTML = ''
		for (const im of board.images) {
			const el = document.createElement('img')
			el.className = 'mp-img' + (im.id === selImage ? ' selected' : '')
			el.dataset.id = im.id
			el.style.left = `${im.x}px`
			el.style.top = `${im.y}px`
			el.style.width = `${im.w}px`
			el.draggable = false
			imagesEl.appendChild(el)
			const src = await resolveImage(im.ref)
			if (src) el.src = src
		}
		positionImgGrip()
	}

	function positionImgGrip() {
		const im = getImage(selImage)
		const el = im && imagesEl.querySelector(`[data-id="${im.id}"]`)
		if (!im || !el) {
			imgGrip.classList.remove('show')
			return
		}
		imgGrip.classList.add('show')
		imgGrip.style.left = `${(im.x + el.offsetWidth) * cam.s + cam.ox - 8}px`
		imgGrip.style.top = `${(im.y + el.offsetHeight) * cam.s + cam.oy - 8}px`
	}

	async function addImageFile(file, worldPt) {
		if (!file || !file.type.startsWith('image/')) return
		const { ref, src } = await uploadImage(file)
		const probe = new Image()
		probe.onload = () => {
			const w = Math.min(420, probe.naturalWidth)
			const h = w * (probe.naturalHeight / probe.naturalWidth)
			board.images.push({
				id: uid(),
				x: Math.round(worldPt.x - w / 2),
				y: Math.round(worldPt.y - h / 2),
				w: Math.round(w),
				ref,
			})
			renderImages()
			changed()
		}
		probe.src = src
	}

	// ---------- traços ----------

	function renderInk() {
		inkSvg.innerHTML = ''
		for (const s of board.strokes) {
			const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			hit.setAttribute('d', s.d)
			hit.classList.add('mp-hit')
			hit.dataset.id = s.id
			inkSvg.appendChild(hit)
			const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			p.setAttribute('d', s.d)
			p.setAttribute('stroke', s.color)
			p.setAttribute('stroke-width', String(s.w || 3))
			if (s.id === selStroke) p.classList.add('sel')
			p.style.pointerEvents = 'none'
			inkSvg.appendChild(p)
		}
	}

	// ---------- conexões ----------

	function renderEdges() {
		edgesSvg.innerHTML = ''
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
			if (e.from === selNode || e.to === selNode) path.classList.add('sel')
			edgesSvg.appendChild(path)
		}
	}

	// ---------- seleção e barra do nó ----------

	function refreshSelection() {
		for (const [id, el] of nodeEls) el.classList.toggle('selected', id === selNode)
		for (const el of rectsEl.children) el.classList.toggle('selected', el.dataset.id === selRect)
		for (const el of imagesEl.children) el.classList.toggle('selected', el.dataset.id === selImage)
		renderEdges()
		renderInk()
		positionNodeBar()
		positionImgGrip()
	}

	function buildNodeBar() {
		nodeBar.innerHTML = ''
		const child = document.createElement('button')
		child.className = 'mp-childbtn'
		child.textContent = '+ filho'
		child.title = 'Criar nó filho (Tab)'
		child.addEventListener('pointerdown', (e) => e.stopPropagation())
		child.addEventListener('click', () => selNode && addChildOf(selNode))
		nodeBar.appendChild(child)

		const sep = document.createElement('div')
		sep.className = 'mp-tsep'
		nodeBar.appendChild(sep)

		NODE_COLORS.forEach((c, i) => {
			const dot = document.createElement('button')
			dot.className = 'mp-dot'
			dot.style.background = c.bg
			dot.addEventListener('pointerdown', (e) => e.stopPropagation())
			dot.addEventListener('click', () => {
				const n = getNode(selNode)
				if (!n) return
				n.color = i
				const el = nodeEls.get(n.id)
				el.style.background = c.bg
				el.style.color = c.fg
				changed()
			})
			nodeBar.appendChild(dot)
		})

		const sep2 = document.createElement('div')
		sep2.className = 'mp-tsep'
		nodeBar.appendChild(sep2)

		const del = document.createElement('button')
		del.className = 'mp-del'
		del.title = 'Apagar nó (Delete)'
		del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
		del.addEventListener('pointerdown', (e) => e.stopPropagation())
		del.addEventListener('click', () => selNode && deleteNode(selNode))
		nodeBar.appendChild(del)
	}

	function positionNodeBar() {
		const n = getNode(selNode)
		const el = selNode && nodeEls.get(selNode)
		if (!n || !el || editing === selNode) {
			nodeBar.style.display = 'none'
			return
		}
		nodeBar.style.display = 'flex'
		nodeBar.style.left = `${Math.round(n.x * cam.s + cam.ox + (el.offsetWidth * cam.s) / 2 - nodeBar.offsetWidth / 2)}px`
		nodeBar.style.top = `${Math.round(n.y * cam.s + cam.oy - nodeBar.offsetHeight - 12)}px`
	}

	// ---------- presença ----------

	let peers = []
	function setPeers(list) {
		peers = list || []
		renderPeers()
	}

	function renderPeers() {
		peersEl.innerHTML = ''
		for (const p of peers) {
			if (typeof p.x !== 'number' || typeof p.y !== 'number') continue
			const el = document.createElement('div')
			el.className = 'mp-peer'
			el.style.transform = `translate(${p.x * cam.s + cam.ox}px, ${p.y * cam.s + cam.oy}px)`
			el.innerHTML = `
				<svg viewBox="0 0 24 24" style="fill:${p.color}"><path d="M5 3l14 8-6.5 1.8L9 19z"/></svg>
				<span style="background:${p.color}">${p.name}</span>`
			peersEl.appendChild(el)
		}
	}

	// ---------- ponteiro ----------

	function edgeAt(el, clientX) {
		const rect = el.getBoundingClientRect()
		if (clientX - rect.left <= EDGE_GRAB) return 'l'
		if (rect.right - clientX <= EDGE_GRAB) return 'r'
		return null
	}

	nodesEl.addEventListener('mousemove', (e) => {
		const el = e.target.closest('.mp-node')
		if (!el || el.classList.contains('editing')) return
		el.style.cursor = edgeAt(el, e.clientX) ? 'ew-resize' : ''
	})

	viewport.addEventListener('pointerdown', (e) => {
		if (tool === 'pen') {
			const vr = viewport.getBoundingClientRect()
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			el.setAttribute('stroke', inkColor)
			el.setAttribute('stroke-width', '3')
			el.style.pointerEvents = 'none'
			inkSvg.appendChild(el)
			pen = { pts: [p], el }
			viewport.setPointerCapture(e.pointerId)
			return
		}

		if (e.target === imgGrip) {
			const im = getImage(selImage)
			if (im) {
				imgResize = { id: im.id, startX: e.clientX, ow: im.w }
				viewport.setPointerCapture(e.pointerId)
			}
			return
		}

		const imgEl = e.target.closest('.mp-img')
		if (imgEl) {
			const im = getImage(imgEl.dataset.id)
			if (im) {
				if (editing) endEdit()
				selImage = im.id
				selNode = selRect = selStroke = null
				refreshSelection()
				imgDrag = { id: im.id, startX: e.clientX, startY: e.clientY, ox: im.x, oy: im.y }
				viewport.setPointerCapture(e.pointerId)
			}
			return
		}

		if (e.target.classList?.contains('mp-hit')) {
			selStroke = e.target.dataset.id
			selNode = selRect = selImage = null
			refreshSelection()
			return
		}

		const nodeEl = e.target.closest('.mp-node')
		if (nodeEl) {
			const id = nodeEl.dataset.id
			if (e.ctrlKey && selNode && selNode !== id) {
				const idx = board.edges.findIndex((x) => (x.from === selNode && x.to === id) || (x.from === id && x.to === selNode))
				if (idx >= 0) board.edges.splice(idx, 1)
				else board.edges.push({ from: selNode, to: id })
				renderEdges()
				changed()
				return
			}
			if (editing && editing !== id) endEdit()
			if (editing === id) return
			const now = performance.now()
			if (lastTap.id === id && now - lastTap.t < 400) {
				lastTap = { id: null, t: 0 }
				selNode = id
				startEdit(id, false)
				return
			}
			lastTap = { id, t: now }
			selNode = id
			selRect = selImage = selStroke = null
			refreshSelection()
			const edge = edgeAt(nodeEl, e.clientX)
			const n = getNode(id)
			if (edge) resize = { id, edge, startX: e.clientX, ow: nodeEl.offsetWidth, ox: n.x }
			else drag = { id, startX: e.clientX, startY: e.clientY, ox: n.x, oy: n.y, moved: false }
			viewport.setPointerCapture(e.pointerId)
			return
		}

		if (editing) endEdit()
		selNode = selRect = selImage = selStroke = null
		refreshSelection()

		if (tool === 'rect') {
			const vr = viewport.getBoundingClientRect()
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const tmp = document.createElement('div')
			tmp.className = 'mp-rect selected'
			tmp.style.left = `${p.x}px`
			tmp.style.top = `${p.y}px`
			rectsEl.appendChild(tmp)
			rectDraw = { x0: p.x, y0: p.y, el: tmp }
			viewport.setPointerCapture(e.pointerId)
			return
		}

		pan = { startX: e.clientX, startY: e.clientY, ox: cam.ox, oy: cam.oy }
		viewport.classList.add('panning')
		viewport.setPointerCapture(e.pointerId)
	})

	viewport.addEventListener('pointermove', (e) => {
		const vr = viewport.getBoundingClientRect()
		if (onPointerMove) {
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			onPointerMove(p)
		}

		if (pen) {
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const last = pen.pts[pen.pts.length - 1]
			if ((p.x - last.x) ** 2 + (p.y - last.y) ** 2 < 4) return
			pen.pts.push(p)
			pen.el.setAttribute('d', pen.pts.map((q, i) => `${i ? 'L' : 'M'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' '))
			return
		}
		if (imgDrag) {
			const im = getImage(imgDrag.id)
			const el = imagesEl.querySelector(`[data-id="${imgDrag.id}"]`)
			if (!im || !el) return
			im.x = Math.round(imgDrag.ox + (e.clientX - imgDrag.startX) / cam.s)
			im.y = Math.round(imgDrag.oy + (e.clientY - imgDrag.startY) / cam.s)
			el.style.left = `${im.x}px`
			el.style.top = `${im.y}px`
			positionImgGrip()
			return
		}
		if (imgResize) {
			const im = getImage(imgResize.id)
			const el = imagesEl.querySelector(`[data-id="${imgResize.id}"]`)
			if (!im || !el) return
			im.w = Math.min(2000, Math.max(60, Math.round(imgResize.ow + (e.clientX - imgResize.startX) / cam.s)))
			el.style.width = `${im.w}px`
			positionImgGrip()
			return
		}
		if (connect) {
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const n = getNode(connect.from)
			const el = nodeEls.get(connect.from)
			if (!n || !el) return
			const a = sidePoint(n, el, connect.side)
			const dx = Math.max(40, Math.abs(p.x - a.x) * 0.45)
			if (!previewPath) {
				previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
				previewPath.classList.add('preview')
				edgesSvg.appendChild(previewPath)
			}
			previewPath.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + (p.x >= a.x ? dx : -dx)} ${a.y}, ${p.x + (p.x >= a.x ? -dx : dx)} ${p.y}, ${p.x} ${p.y}`)
			return
		}
		if (rectDraw) {
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			rectDraw.el.style.left = `${Math.min(rectDraw.x0, p.x)}px`
			rectDraw.el.style.top = `${Math.min(rectDraw.y0, p.y)}px`
			rectDraw.el.style.width = `${Math.abs(p.x - rectDraw.x0)}px`
			rectDraw.el.style.height = `${Math.abs(p.y - rectDraw.y0)}px`
			return
		}
		if (rectMove) {
			const r = getRect(rectMove.id)
			const el = rectsEl.querySelector(`[data-id="${rectMove.id}"]`)
			if (!r || !el) return
			const dx = (e.clientX - rectMove.startX) / cam.s
			const dy = (e.clientY - rectMove.startY) / cam.s
			r.x = Math.round(rectMove.ox + dx)
			r.y = Math.round(rectMove.oy + dy)
			el.style.left = `${r.x}px`
			el.style.top = `${r.y}px`
			for (const m of rectMove.members) {
				const n = getNode(m.id)
				const nel = nodeEls.get(m.id)
				if (!n || !nel) continue
				n.x = Math.round(m.ox + dx)
				n.y = Math.round(m.oy + dy)
				nel.style.left = `${n.x}px`
				nel.style.top = `${n.y}px`
			}
			renderEdges()
			positionNodeBar()
			return
		}
		if (rectResize) {
			const r = getRect(rectResize.id)
			const el = rectsEl.querySelector(`[data-id="${rectResize.id}"]`)
			if (!r || !el) return
			r.w = Math.max(80, Math.round(rectResize.ow + (e.clientX - rectResize.startX) / cam.s))
			r.h = Math.max(50, Math.round(rectResize.oh + (e.clientY - rectResize.startY) / cam.s))
			el.style.width = `${r.w}px`
			el.style.height = `${r.h}px`
			return
		}
		if (resize) {
			const n = getNode(resize.id)
			const el = nodeEls.get(resize.id)
			if (!n || !el) return
			const dx = (e.clientX - resize.startX) / cam.s
			let w
			if (resize.edge === 'r') {
				w = Math.min(560, Math.max(70, Math.round(resize.ow + dx)))
			} else {
				w = Math.min(560, Math.max(70, Math.round(resize.ow - dx)))
				n.x = resize.ox + (resize.ow - w)
				el.style.left = `${n.x}px`
			}
			n.w = w
			el.style.width = `${w}px`
			el.style.maxWidth = 'none'
			renderEdges()
			positionNodeBar()
			return
		}
		if (drag) {
			const dx = (e.clientX - drag.startX) / cam.s
			const dy = (e.clientY - drag.startY) / cam.s
			if (Math.abs(dx) + Math.abs(dy) > 1) {
				drag.moved = true
				lastTap = { id: null, t: 0 }
			}
			const n = getNode(drag.id)
			if (!n) return
			n.x = Math.round(drag.ox + dx)
			n.y = Math.round(drag.oy + dy)
			const el = nodeEls.get(n.id)
			el.style.left = `${n.x}px`
			el.style.top = `${n.y}px`
			renderEdges()
			positionNodeBar()
			return
		}
		if (pan) {
			cam.ox = pan.ox + (e.clientX - pan.startX)
			cam.oy = pan.oy + (e.clientY - pan.startY)
			applyTransform()
		}
	})

	viewport.addEventListener('pointerup', (e) => {
		if (pen) {
			const { pts, el } = pen
			pen = null
			el.remove()
			if (pts.length >= 2) {
				board.strokes.push({ id: uid(), d: smoothPath(simplify(pts, 1.6)), color: inkColor, w: 3 })
				renderInk()
				changed()
			}
			return
		}
		if (imgDrag || imgResize) {
			imgDrag = imgResize = null
			changed()
			return
		}
		if (connect) {
			const from = connect.from
			connect = null
			previewPath?.remove()
			previewPath = null
			const target = document.elementFromPoint(e.clientX, e.clientY)
			const nodeEl = target?.closest?.('.mp-node')
			if (nodeEl && nodeEl.dataset.id !== from) {
				const to = nodeEl.dataset.id
				if (!board.edges.some((ed) => (ed.from === from && ed.to === to) || (ed.from === to && ed.to === from))) {
					board.edges.push({ from, to })
					renderEdges()
					changed()
				}
			} else if (!nodeEl) {
				const vr = viewport.getBoundingClientRect()
				const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
				const src = getNode(from)
				const nn = addNode(p.x - 60, p.y - 18, 'Nova ideia', src && src.color === 0 ? 1 : src?.color, from)
				startEdit(nn.id, true)
			}
			return
		}
		if (rectDraw) {
			const el = rectDraw.el
			const x = parseFloat(el.style.left) || 0
			const y = parseFloat(el.style.top) || 0
			const w = parseFloat(el.style.width) || 0
			const h = parseFloat(el.style.height) || 0
			el.remove()
			rectDraw = null
			setTool('select')
			if (w >= 40 && h >= 40) {
				const r = { id: uid(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), label: 'Área' }
				board.rects.push(r)
				selRect = r.id
				renderRects()
				refreshSelection()
				changed()
			}
			return
		}
		if (rectMove || rectResize) {
			rectMove = rectResize = null
			changed()
			return
		}
		if ((drag && drag.moved) || resize) changed()
		drag = resize = pan = null
		viewport.classList.remove('panning')
	})

	viewport.addEventListener('wheel', (e) => {
		e.preventDefault()
		const vr = viewport.getBoundingClientRect()
		zoomAt(e.clientX - vr.left, e.clientY - vr.top, e.deltaY < 0 ? 1.12 : 1 / 1.12)
	}, { passive: false })

	viewport.addEventListener('dblclick', (e) => {
		if (e.target.closest('.mp-node') || e.target.closest('.mp-nodebar')) return
		const vr = viewport.getBoundingClientRect()
		const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
		const n = addNode(p.x - 60, p.y - 20)
		startEdit(n.id, true)
	})

	// arrastar arquivo de fora
	let dragDepth = 0
	const onDragEnter = (e) => {
		if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return
		e.preventDefault()
		dragDepth++
		dropEl.classList.add('show')
	}
	const onDragOver = (e) => {
		if (dropEl.classList.contains('show')) e.preventDefault()
	}
	const onDragLeave = () => {
		dragDepth = Math.max(0, dragDepth - 1)
		if (!dragDepth) dropEl.classList.remove('show')
	}
	const onDrop = async (e) => {
		if (!e.dataTransfer) return
		e.preventDefault()
		dragDepth = 0
		dropEl.classList.remove('show')
		const vr = viewport.getBoundingClientRect()
		const base = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
		const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
		for (let i = 0; i < files.length; i++) await addImageFile(files[i], { x: base.x + i * 30, y: base.y + i * 30 })
	}
	window.addEventListener('dragenter', onDragEnter)
	window.addEventListener('dragover', onDragOver)
	window.addEventListener('dragleave', onDragLeave)
	window.addEventListener('drop', onDrop)

	const onPaste = async (e) => {
		if (editing) return
		const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
		if (!files.length) return
		e.preventDefault()
		const p = screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2)
		for (const f of files) await addImageFile(f, p)
	}
	window.addEventListener('paste', onPaste)

	const onKey = (e) => {
		if (e.target.isContentEditable && !editing) return
		if (editing) {
			if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
				e.preventDefault()
				const was = editing
				endEdit()
				selNode = was
				refreshSelection()
			}
			if (e.key === 'Tab') {
				e.preventDefault()
				const was = editing
				endEdit()
				addChildOf(was)
			}
			return
		}
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

		const k = e.key.toLowerCase()
		if (!e.ctrlKey && !e.altKey && !e.metaKey) {
			if (k === 'v') return setTool('select')
			if (k === 'p') return setTool('pen')
			if (k === 'r') return setTool('rect')
		}

		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selNode) {
				e.preventDefault()
				return deleteNode(selNode)
			}
			if (selImage) {
				e.preventDefault()
				board.images = board.images.filter((i) => i.id !== selImage)
				selImage = null
				renderImages()
				return changed()
			}
			if (selStroke) {
				e.preventDefault()
				board.strokes = board.strokes.filter((s) => s.id !== selStroke)
				selStroke = null
				renderInk()
				return changed()
			}
			if (selRect) {
				e.preventDefault()
				board.rects = board.rects.filter((r) => r.id !== selRect)
				selRect = null
				renderRects()
				return changed()
			}
		}
		if (!selNode) {
			if (e.key === 'Escape') {
				selRect = selImage = selStroke = null
				refreshSelection()
				setTool('select')
			}
			return
		}
		if (e.key === 'Tab') {
			e.preventDefault()
			addChildOf(selNode)
		} else if (e.key === 'Enter') {
			e.preventDefault()
			addSiblingOf(selNode)
		} else if (e.key === 'F2') {
			e.preventDefault()
			startEdit(selNode, false)
		} else if (e.key === 'Escape') {
			selNode = null
			refreshSelection()
		}
	}
	window.addEventListener('keydown', onKey)

	const onResize = () => applyTransform()
	window.addEventListener('resize', onResize)

	function setTool(t) {
		tool = t
		viewport.classList.toggle('rect-mode', t === 'rect')
		viewport.classList.toggle('pen-mode', t === 'pen')
		if (onToolChange) onToolChange(t)
	}
	let onToolChange = null

	// primeira pintura
	buildNodeBar()
	for (const n of board.nodes) nodesEl.appendChild(buildNodeEl(n))
	renderRects()
	renderImages()
	renderInk()
	refreshSelection()
	requestAnimationFrame(fitView)

	return {
		setTool,
		getTool: () => tool,
		setInkColor: (c) => {
			inkColor = c
		},
		getInkColor: () => inkColor,
		onToolChange: (fn) => {
			onToolChange = fn
		},
		onZoom: (fn) => {
			onZoom = fn
		},
		addNodeAtCenter() {
			const p = screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2)
			const n = addNode(p.x - 60, p.y - 20)
			startEdit(n.id, true)
		},
		async addImages(files) {
			const p = screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2)
			for (let i = 0; i < files.length; i++) await addImageFile(files[i], { x: p.x + i * 30, y: p.y + i * 30 })
		},
		zoomIn: () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1.2),
		zoomOut: () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1 / 1.2),
		resetZoom: () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1 / cam.s),
		fitView,
		setPeers,
		getBoard: () => board,
		destroy() {
			if (destroyed) return
			destroyed = true
			clearTimeout(saveTimer)
			window.removeEventListener('keydown', onKey)
			window.removeEventListener('resize', onResize)
			window.removeEventListener('paste', onPaste)
			window.removeEventListener('dragenter', onDragEnter)
			window.removeEventListener('dragover', onDragOver)
			window.removeEventListener('dragleave', onDragLeave)
			window.removeEventListener('drop', onDrop)
			container.innerHTML = ''
		},
	}
}
