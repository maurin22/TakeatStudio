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
export function createMapEngine({ container, board, onChange, uploadImage, resolveImage, onPointerMove, onPointerLeave, me, onSelect, onAssign, onIA, onMention }) {
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
	let strokeDrag = null
	let embedResize = null
	let pen = null
	let marquee = null
	const selMulti = new Set()
	let guias = null
	let lastTap = { id: null, t: 0 }
	let lastRectTap = { id: null, t: 0 }
	let destroyed = false

	const getNode = (id) => board.nodes.find((n) => n.id === id)
	const getRect = (id) => board.rects.find((r) => r.id === id)
	const getImage = (id) => board.images.find((i) => i.id === id)

	// Conexões ligam cards E imagens, então o endpoint é resolvido nos dois
	function anchorOf(id) {
		const n = getNode(id)
		if (n) {
			const el = nodeEls.get(id)
			return el ? { x: n.x, y: n.y, w: el.offsetWidth, h: el.offsetHeight } : null
		}
		const im = getImage(id)
		if (im) {
			const el = imagesEl.querySelector(`[data-id="${id}"]`)
			return el ? { x: im.x, y: im.y, w: el.offsetWidth, h: el.offsetHeight } : null
		}
		return null
	}

	// ---------- histórico (desfazer) ----------
	// Guarda fotografias do quadro. Simples e confiável: o quadro é leve
	// (texto e coordenadas), então copiar inteiro sai barato.
	const historico = []
	const refazer = []
	const LIMITE = 60
	let restaurando = false

	const foto = () => JSON.stringify({ nodes: board.nodes, edges: board.edges, rects: board.rects, strokes: board.strokes, images: board.images })

	function marcar() {
		if (restaurando) return
		historico.push(foto())
		if (historico.length > LIMITE) historico.shift()
		refazer.length = 0
	}

	function aplicarFoto(json) {
		const dados = JSON.parse(json)
		restaurando = true
		for (const k of ['nodes', 'edges', 'rects', 'strokes', 'images']) board[k] = dados[k] || []
		selNode = selRect = selImage = selStroke = null
		selMulti.clear()
		nodesEl.innerHTML = ''
		nodeEls.clear()
		for (const n of board.nodes) nodesEl.appendChild(buildNodeEl(n))
		renderRects()
		renderImages()
		renderInk()
		refreshSelection()
		restaurando = false
		changed()
	}

	function desfazer() {
		if (!historico.length) return false
		refazer.push(foto())
		aplicarFoto(historico.pop())
		return true
	}

	function refazerUltimo() {
		if (!refazer.length) return false
		historico.push(foto())
		aplicarFoto(refazer.pop())
		return true
	}

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
		el.className = `mp-node kind-${n.kind || 'text'}`
		el.dataset.id = n.id
		const color = NODE_COLORS[n.color] || NODE_COLORS[0]
		if (n.kind === 'link' || n.kind === 'code' || n.kind === 'embed') {
			// esses têm visual próprio, definido no CSS
			el.style.removeProperty('background')
		} else {
			el.style.background = color.bg
			el.style.color = color.fg
		}
		el.style.left = `${n.x}px`
		el.style.top = `${n.y}px`
		if (n.w) {
			el.style.width = `${n.w}px`
			el.style.maxWidth = 'none'
		}

		if (n.kind === 'embed') {
			el.appendChild(buildEmbedBody(n))
		} else if (n.kind === 'link') {
			el.appendChild(buildLinkBody(n))
		} else if (n.kind === 'code') {
			el.appendChild(buildCodeBody(n))
		} else if (n.kind === 'task') {
			el.appendChild(buildTaskBody(n))
		}

		const txt = document.createElement('div')
		txt.className = 'mp-txt'
		// menções aparecem destacadas (texto puro, montado com segurança)
		if (/@[\w.-]+/.test(n.text || '')) {
			for (const parte of (n.text || '').split(/(@[\w.-]+)/g)) {
				if (parte.startsWith('@')) {
					const m = document.createElement('b')
					m.className = 'mp-mencao'
					m.textContent = parte
					txt.appendChild(m)
				} else if (parte) {
					txt.appendChild(document.createTextNode(parte))
				}
			}
		} else {
			txt.textContent = n.text
		}
		el.appendChild(txt)

		if (n.kind === 'task') {
			const rod = buildRodape(n)
			if (rod) el.appendChild(rod)
		}
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

	// ---------- cards especiais ----------

	function dominioDe(url) {
		try {
			return new URL(url).hostname.replace(/^www\./, '')
		} catch {
			return url
		}
	}

	// Alguns serviços permitem mostrar o conteúdo dentro de outra página.
	// Quando dá, o card exibe o design/vídeo de verdade; quando não dá
	// (a maioria dos sites bloqueia), vira o cartão simples com o link.
	function incorporavel(url) {
		try {
			const u = new URL(url)
			const h = u.hostname.replace(/^www\./, '')

			if (h.endsWith('figma.com')) {
				// hide-ui tira a moldura do Figma (rodapé, zoom, botões) e
				// deixa só o desenho; scaling=contain encaixa no espaço.
				// Endereço novo (Embed Kit 2.0) preserva o node-id do link,
				// então abre exatamente no frame que a pessoa compartilhou.
				const alvo = url.replace(/^https?:\/\/(www\.)?figma\.com/i, 'https://embed.figma.com')
				const sep = alvo.includes('?') ? '&' : '?'
				return {
					tipo: 'Figma',
					src: `${alvo}${sep}embed-host=takeatmap&hide-ui=1&scaling=contain&theme=dark&footer=false`,
					alt: 0.68,
				}
			}
			if (h === 'youtu.be') {
				return { tipo: 'YouTube', src: `https://www.youtube.com/embed/${u.pathname.slice(1)}`, alt: 0.5625 }
			}
			if (h.endsWith('youtube.com') && u.searchParams.get('v')) {
				return { tipo: 'YouTube', src: `https://www.youtube.com/embed/${u.searchParams.get('v')}`, alt: 0.5625 }
			}
			if (h.endsWith('loom.com')) {
				const id = u.pathname.split('/').pop()
				return { tipo: 'Loom', src: `https://www.loom.com/embed/${id}`, alt: 0.5625 }
			}
			if (h.endsWith('vimeo.com')) {
				const id = u.pathname.split('/').filter(Boolean).pop()
				return { tipo: 'Vimeo', src: `https://player.vimeo.com/video/${id}`, alt: 0.5625 }
			}
			if (h === 'docs.google.com' || h === 'drive.google.com') {
				return { tipo: 'Google', src: url.replace(/\/(edit|view)(\?.*)?$/, '/preview'), alt: 0.72 }
			}
			return null
		} catch {
			return null
		}
	}

	function buildEmbedBody(n) {
		const emb = incorporavel(n.url)
		const wrap = document.createElement('div')
		wrap.className = 'mp-embed'

		const bar = document.createElement('div')
		bar.className = 'mp-embedbar'
		const ico = document.createElement('img')
		ico.className = 'mp-favicon'
		ico.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(dominioDe(n.url))}`
		ico.onerror = () => ico.remove()
		const nome = document.createElement('span')
		nome.className = 'mp-domain'
		nome.textContent = emb ? emb.tipo : dominioDe(n.url)

		// Enquanto o escudo está ligado, o card arrasta normalmente; ao
		// liberar, o mouse passa a controlar o conteúdo de dentro.
		const interagir = document.createElement('button')
		interagir.className = 'mp-open'
		interagir.textContent = 'interagir'
		interagir.addEventListener('pointerdown', (e) => e.stopPropagation())
		interagir.addEventListener('click', (e) => {
			e.stopPropagation()
			const solto = wrap.classList.toggle('livre')
			interagir.textContent = solto ? 'travar' : 'interagir'
		})

		const abrir = document.createElement('button')
		abrir.className = 'mp-open'
		abrir.textContent = '↗'
		abrir.title = n.url
		abrir.addEventListener('pointerdown', (e) => e.stopPropagation())
		abrir.addEventListener('click', (e) => {
			e.stopPropagation()
			window.open(n.url, '_blank', 'noopener')
		})
		// botão de remover no próprio card: o conteúdo incorporado rouba o
		// foco do teclado, então Delete pode não chegar até o app
		const fechar = document.createElement('button')
		fechar.className = 'mp-open remover'
		fechar.textContent = '✕'
		fechar.title = 'Remover card'
		fechar.addEventListener('pointerdown', (e) => e.stopPropagation())
		fechar.addEventListener('click', (e) => {
			e.stopPropagation()
			deleteNode(n.id)
		})
		bar.append(ico, nome, interagir, abrir, fechar)

		const body = document.createElement('div')
		body.className = 'mp-embedbody'
		// altura salva pelo usuário; senão, proporção padrão do serviço
		body.style.height = `${Math.round(n.h || (n.w || 420) * (emb?.alt || 0.62))}px`
		const frame = document.createElement('iframe')
		frame.src = emb ? emb.src : n.url
		frame.loading = 'lazy'
		frame.allow = 'fullscreen; clipboard-write'
		frame.referrerPolicy = 'no-referrer'
		const escudo = document.createElement('div')
		escudo.className = 'mp-shield'
		body.append(frame, escudo)

		// alça no canto: ajusta largura E altura, pra casar com o formato
		// do design (o Figma não informa as medidas do frame)
		const grip = document.createElement('div')
		grip.className = 'mp-embedgrip'
		grip.title = 'Ajustar tamanho e proporção'
		grip.addEventListener('pointerdown', (e) => {
			e.stopPropagation()
			selNode = n.id
			refreshSelection()
			embedResize = {
				id: n.id,
				startX: e.clientX,
				startY: e.clientY,
				ow: n.w || 440,
				oh: body.offsetHeight,
			}
			viewport.setPointerCapture(e.pointerId)
		})

		wrap.append(bar, body, grip)
		return wrap
	}

	function buildLinkBody(n) {
		const wrap = document.createElement('div')
		wrap.className = 'mp-link'
		const ico = document.createElement('img')
		ico.className = 'mp-favicon'
		ico.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(dominioDe(n.url))}`
		ico.onerror = () => ico.remove()
		const dom = document.createElement('span')
		dom.className = 'mp-domain'
		dom.textContent = dominioDe(n.url)
		const abrir = document.createElement('button')
		abrir.className = 'mp-open'
		abrir.textContent = 'abrir ↗'
		abrir.title = n.url
		abrir.addEventListener('pointerdown', (e) => e.stopPropagation())
		abrir.addEventListener('click', (e) => {
			e.stopPropagation()
			window.open(n.url, '_blank', 'noopener')
		})
		const fechar = document.createElement('button')
		fechar.className = 'mp-open remover'
		fechar.textContent = '✕'
		fechar.title = 'Remover card'
		fechar.addEventListener('pointerdown', (e) => e.stopPropagation())
		fechar.addEventListener('click', (e) => {
			e.stopPropagation()
			deleteNode(n.id)
		})
		wrap.append(ico, dom, abrir, fechar)
		return wrap
	}

	// Colorização simples: o suficiente pra código ficar legível no quadro,
	// sem carregar uma biblioteca inteira de destaque de sintaxe
	const PALAVRAS = /\b(const|let|var|function|return|if|else|for|while|class|new|import|from|export|await|async|try|catch|def|end|do|then|select|insert|update|delete|where|null|true|false)\b/g
	function pintarCodigo(src) {
		const esc = src.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
		return esc
			.replace(/(\/\/[^\n]*|#[^\n]*|--[^\n]*)/g, '<i class="cmt">$1</i>')
			.replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, '<i class="str">$1</i>')
			.replace(PALAVRAS, '<i class="kw">$&</i>')
			.replace(/\b(\d+(\.\d+)?)\b/g, '<i class="num">$1</i>')
	}

	function buildCodeBody(n) {
		const wrap = document.createElement('div')
		wrap.className = 'mp-code'
		const bar = document.createElement('div')
		bar.className = 'mp-codebar'
		const lang = document.createElement('span')
		lang.textContent = n.lang || 'código'
		const copiar = document.createElement('button')
		copiar.textContent = 'copiar'
		copiar.addEventListener('pointerdown', (e) => e.stopPropagation())
		copiar.addEventListener('click', (e) => {
			e.stopPropagation()
			navigator.clipboard?.writeText(n.text || '')
			copiar.textContent = 'copiado!'
			setTimeout(() => (copiar.textContent = 'copiar'), 1500)
		})
		bar.append(lang, copiar)
		const pre = document.createElement('pre')
		pre.innerHTML = pintarCodigo(n.text || '')
		wrap.append(bar, pre)
		return wrap
	}

	const STATUS = [
		{ id: 'todo', txt: 'A fazer', cor: '#8f8f97' },
		{ id: 'doing', txt: 'Fazendo', cor: '#fbbf24' },
		{ id: 'done', txt: 'Feito', cor: '#34d668' },
	]

	const iniciais = (t) =>
		(t || '?')
			.split(/[\s.@_-]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0].toUpperCase())
			.join('')

	function dataCurta(ts) {
		if (!ts) return ''
		const d = new Date(ts)
		const hoje = new Date()
		if (d.toDateString() === hoje.toDateString()) return 'hoje'
		return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
	}

	function buildTaskBody(n) {
		const wrap = document.createElement('div')
		wrap.className = 'mp-task'

		const topo = document.createElement('div')
		topo.className = 'mp-task-topo'
		const st = STATUS.find((s) => s.id === n.status) || STATUS[0]
		const pill = document.createElement('button')
		pill.className = 'mp-status'
		pill.textContent = st.txt
		pill.style.background = st.cor
		pill.title = 'Clique pra mudar o status'
		pill.addEventListener('pointerdown', (e) => e.stopPropagation())
		pill.addEventListener('click', (e) => {
			e.stopPropagation()
			const i = STATUS.findIndex((s) => s.id === (n.status || 'todo'))
			n.status = STATUS[(i + 1) % STATUS.length].id
			const novo = STATUS.find((s) => s.id === n.status)
			pill.textContent = novo.txt
			pill.style.background = novo.cor
			nodeEls.get(n.id)?.classList.toggle('feito', n.status === 'done')
			changed()
		})
		topo.appendChild(pill)

		// responsável: bolinha com as iniciais, clique abre os detalhes
		const resp = document.createElement('button')
		resp.className = 'mp-resp' + (n.resp ? '' : ' vazio')
		resp.textContent = n.resp ? iniciais(n.resp) : '+'
		resp.title = n.resp ? `Responsável: ${n.resp}` : 'Definir responsável'
		resp.addEventListener('pointerdown', (e) => e.stopPropagation())
		resp.addEventListener('click', (e) => {
			e.stopPropagation()
			selNode = n.id
			refreshSelection()
			onSelect && onSelect(n, true)
		})
		topo.appendChild(resp)
		wrap.appendChild(topo)
		if (n.status === 'done') setTimeout(() => nodeEls.get(n.id)?.classList.add('feito'), 0)
		return wrap
	}

	// rodapé com autoria, em todos os cards
	function buildRodape(n) {
		if (!n.por && !n.em) return null
		const p = document.createElement('div')
		p.className = 'mp-autoria'
		p.textContent = `${n.por || 'alguém'} · ${dataCurta(n.em)}`
		p.title = n.em ? `Criado por ${n.por} em ${new Date(n.em).toLocaleString('pt-BR')}` : ''
		return p
	}

	function sidePoint(n, el, side) {
		const w = el.offsetWidth
		const h = el.offsetHeight
		if (side === 'l') return { x: n.x, y: n.y + h / 2 }
		if (side === 'r') return { x: n.x + w, y: n.y + h / 2 }
		if (side === 't') return { x: n.x + w / 2, y: n.y }
		return { x: n.x + w / 2, y: n.y + h }
	}

	// Todo card guarda quem criou e quando
	const autoria = () => ({ por: me?.name || 'alguém', em: Date.now() })

	function addNode(x, y, text, color, parentId) {
		const n = { id: uid(), x: Math.round(x), y: Math.round(y), text: text || 'Nova ideia', color: color ?? 1, ...autoria() }
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
		marcar()
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
			const antes = n.text
			n.text = txt.textContent.trim() || 'Ideia'
			// menções novas no texto viram aviso pra pessoa citada
			if (n.text !== antes && onMention) {
				const antigas = new Set((antes || '').match(/@[\w.-]+/g) || [])
				for (const m of n.text.match(/@[\w.-]+/g) || []) {
					if (!antigas.has(m)) onMention(m.slice(1), n)
				}
			}
			txt.textContent = n.text
			el.classList.remove('editing')
			// código: o texto é o conteúdo, então o bloco colorido é refeito
			if (n.kind === 'code') {
				const pre = el.querySelector('.mp-code pre')
				if (pre) pre.innerHTML = pintarCodigo(n.text)
			}
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

		// IA da área: analisa tudo que está dentro dela
		const iaBtn = document.createElement('button')
		iaBtn.className = 'mp-ria'
		iaBtn.textContent = '✦'
		iaBtn.title = 'Analisar esta área com IA'
		iaBtn.addEventListener('pointerdown', (e) => e.stopPropagation())
		iaBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			const dentro = board.nodes.filter((n) => {
				const nel = nodeEls.get(n.id)
				const cx = n.x + (nel ? nel.offsetWidth : 120) / 2
				const cy = n.y + (nel ? nel.offsetHeight : 40) / 2
				return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
			})
			onIA && onIA({ tipo: 'area', alvo: r, cards: dentro })
		})
		el.appendChild(iaBtn)

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
			// a imagem vive dentro de um invólucro pra poder receber as
			// bolinhas de conexão (uma tag <img> não aceita filhos)
			const wrap = document.createElement('div')
			wrap.className = 'mp-img' + (im.id === selImage ? ' selected' : '')
			wrap.dataset.id = im.id
			wrap.style.left = `${im.x}px`
			wrap.style.top = `${im.y}px`
			wrap.style.width = `${im.w}px`

			const img = document.createElement('img')
			img.draggable = false
			wrap.appendChild(img)

			for (const side of ['l', 'r', 't', 'b']) {
				const h = document.createElement('div')
				h.className = `mp-hdl ${side}`
				h.title = 'Arraste até um card pra ligar'
				h.addEventListener('pointerdown', (e) => {
					e.stopPropagation()
					selImage = im.id
					selNode = selRect = selStroke = null
					refreshSelection()
					connect = { from: im.id, side }
					viewport.setPointerCapture(e.pointerId)
				})
				wrap.appendChild(h)
			}

			imagesEl.appendChild(wrap)
			const src = await resolveImage(im.ref)
			if (src) img.src = src
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

	// O traço guarda os pontos originais e um deslocamento (tx, ty); mover
	// é só mudar o deslocamento, sem recalcular a curva inteira
	function strokeTransform(s) {
		return s.tx || s.ty ? `translate(${s.tx || 0} ${s.ty || 0})` : null
	}

	function renderInk() {
		inkSvg.innerHTML = ''
		for (const s of board.strokes) {
			const t = strokeTransform(s)
			const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			hit.setAttribute('d', s.d)
			if (t) hit.setAttribute('transform', t)
			hit.classList.add('mp-hit')
			hit.dataset.id = s.id
			inkSvg.appendChild(hit)
			const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			p.setAttribute('d', s.d)
			if (t) p.setAttribute('transform', t)
			p.setAttribute('stroke', s.color)
			p.setAttribute('stroke-width', String(s.w || 3))
			p.dataset.id = s.id
			if (s.id === selStroke) p.classList.add('sel')
			p.style.pointerEvents = 'none'
			inkSvg.appendChild(p)
		}
	}

	// ---------- conexões ----------

	function renderEdges() {
		edgesSvg.innerHTML = ''
		for (const e of board.edges) {
			const na = anchorOf(e.from)
			const nb = anchorOf(e.to)
			if (!na || !nb) continue
			const ax = na.x + na.w / 2
			const ay = na.y + na.h / 2
			const bx = nb.x + nb.w / 2
			const by = nb.y + nb.h / 2
			const dx = Math.max(40, Math.abs(bx - ax) * 0.45)
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			path.setAttribute('d', `M ${ax} ${ay} C ${ax + (bx >= ax ? dx : -dx)} ${ay}, ${bx + (bx >= ax ? -dx : dx)} ${by}, ${bx} ${by}`)
			if (e.from === selNode || e.to === selNode) path.classList.add('sel')
			edgesSvg.appendChild(path)
		}
	}

	// ---------- seleção e barra do nó ----------

	function refreshSelection() {
		for (const [id, el] of nodeEls) {
			el.classList.toggle('selected', id === selNode)
			el.classList.toggle('multi', selMulti.has(id))
		}
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

		const ia = document.createElement('button')
		ia.className = 'mp-ia'
		ia.title = 'Analisar com IA'
		ia.textContent = '✦'
		ia.addEventListener('pointerdown', (e) => e.stopPropagation())
		ia.addEventListener('click', () => {
			const n = getNode(selNode)
			if (n) onIA && onIA({ tipo: 'card', alvo: n })
		})
		nodeBar.appendChild(ia)

		const info = document.createElement('button')
		info.className = 'mp-del'
		info.title = 'Detalhes do card'
		info.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.01" stroke-linecap="round"/></svg>'
		info.addEventListener('pointerdown', (e) => e.stopPropagation())
		info.addEventListener('click', () => {
			const n = getNode(selNode)
			if (n) onSelect && onSelect(n, true)
		})
		nodeBar.appendChild(info)

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

	// Cursores das outras pessoas: mantidos entre quadros (em vez de
	// recriados) pra que a transição do CSS faça o movimento deslizar em
	// vez de pular de um ponto ao outro.
	const peerEls = new Map()

	function renderPeers() {
		const vivos = new Set()
		for (const p of peers) {
			if (typeof p.x !== 'number' || typeof p.y !== 'number') continue
			vivos.add(p.id)
			let el = peerEls.get(p.id)
			if (!el) {
				el = document.createElement('div')
				el.className = 'mp-peer'
				const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
				svg.setAttribute('viewBox', '0 0 24 24')
				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
				path.setAttribute('d', 'M5 3l14 8-6.5 1.8L9 19z')
				svg.appendChild(path)
				const label = document.createElement('span')
				el.append(svg, label)
				peersEl.appendChild(el)
				peerEls.set(p.id, el)
			}
			el.querySelector('path').setAttribute('fill', p.color)
			const label = el.querySelector('span')
			if (label.textContent !== p.name) label.textContent = p.name
			label.style.background = p.color
			el.style.transform = `translate(${p.x * cam.s + cam.ox}px, ${p.y * cam.s + cam.oy}px)`
		}
		for (const [id, el] of peerEls) {
			if (!vivos.has(id)) {
				el.remove()
				peerEls.delete(id)
			}
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

		// traço da caneta: seleciona e arrasta
		if (e.target.classList?.contains('mp-hit')) {
			const s = board.strokes.find((x) => x.id === e.target.dataset.id)
			if (s) {
				if (editing) endEdit()
				selStroke = s.id
				selNode = selRect = selImage = null
				refreshSelection()
				strokeDrag = {
					id: s.id,
					startX: e.clientX,
					startY: e.clientY,
					ox: s.tx || 0,
					oy: s.ty || 0,
					moved: false,
				}
				viewport.setPointerCapture(e.pointerId)
			}
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
			else {
				marcar()
				drag = { id, startX: e.clientX, startY: e.clientY, ox: n.x, oy: n.y, moved: false }
				// arrastar um card do grupo move o grupo inteiro
				if (selMulti.has(id) && selMulti.size > 1) {
					drag.grupo = [...selMulti]
						.filter((x) => x !== id)
						.map((x) => {
							const o = getNode(x)
							return o ? { id: x, ox: o.x, oy: o.y } : null
						})
						.filter(Boolean)
				}
			}
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

		// No fundo: arrastar cria seleção (como Figma/Miro). Pra navegar o
		// quadro: segure espaço, use o botão do meio ou o botão direito.
		const querPan = e.button === 1 || e.button === 2 || espacoPressionado
		if (!querPan) {
			const vr = viewport.getBoundingClientRect()
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const cx = document.createElement('div')
			cx.className = 'mp-marquee'
			viewport.appendChild(cx)
			marquee = { x0: p.x, y0: p.y, el: cx }
			viewport.setPointerCapture(e.pointerId)
			return
		}

		pan = { startX: e.clientX, startY: e.clientY, ox: cam.ox, oy: cam.oy }
		viewport.classList.add('panning')
		viewport.setPointerCapture(e.pointerId)
	})

	// segurar espaço = modo navegar
	let espacoPressionado = false
	const onSpaceDown = (e) => {
		if (e.code === 'Space' && !editing && e.target === document.body) {
			espacoPressionado = true
			viewport.classList.add('modo-pan')
			e.preventDefault()
		}
	}
	const onSpaceUp = (e) => {
		if (e.code === 'Space') {
			espacoPressionado = false
			viewport.classList.remove('modo-pan')
		}
	}
	window.addEventListener('keydown', onSpaceDown)
	window.addEventListener('keyup', onSpaceUp)
	viewport.addEventListener('contextmenu', (e) => e.preventDefault())

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
		if (embedResize) {
			const n = getNode(embedResize.id)
			const el = nodeEls.get(embedResize.id)
			if (!n || !el) return
			n.w = Math.min(1200, Math.max(220, Math.round(embedResize.ow + (e.clientX - embedResize.startX) / cam.s)))
			n.h = Math.min(1200, Math.max(140, Math.round(embedResize.oh + (e.clientY - embedResize.startY) / cam.s)))
			el.style.width = `${n.w}px`
			el.style.maxWidth = 'none'
			const corpo = el.querySelector('.mp-embedbody')
			if (corpo) corpo.style.height = `${n.h}px`
			renderEdges()
			positionNodeBar()
			return
		}
		if (strokeDrag) {
			const s = board.strokes.find((x) => x.id === strokeDrag.id)
			if (!s) return
			const dx = (e.clientX - strokeDrag.startX) / cam.s
			const dy = (e.clientY - strokeDrag.startY) / cam.s
			if (Math.abs(dx) + Math.abs(dy) > 1) strokeDrag.moved = true
			s.tx = Math.round(strokeDrag.ox + dx)
			s.ty = Math.round(strokeDrag.oy + dy)
			const t = `translate(${s.tx} ${s.ty})`
			for (const p of inkSvg.querySelectorAll(`[data-id="${s.id}"]`)) p.setAttribute('transform', t)
			return
		}
		if (connect) {
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const box = anchorOf(connect.from)
			if (!box) return
			const a = sidePoint({ x: box.x, y: box.y }, { offsetWidth: box.w, offsetHeight: box.h }, connect.side)
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
			// conteúdo incorporado acompanha a largura, mantendo a proporção
			const corpo = el.querySelector('.mp-embedbody')
			if (corpo) corpo.style.height = `${Math.round(w * (incorporavel(n.url)?.alt || 0.62))}px`
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
			encaixar(n, el)
			el.style.left = `${n.x}px`
			el.style.top = `${n.y}px`
			// leva junto os outros selecionados
			if (drag.grupo) {
				for (const m of drag.grupo) {
					const o = getNode(m.id)
					const oel = nodeEls.get(m.id)
					if (!o || !oel) continue
					o.x = Math.round(m.ox + (n.x - drag.ox))
					o.y = Math.round(m.oy + (n.y - drag.oy))
					oel.style.left = `${o.x}px`
					oel.style.top = `${o.y}px`
				}
			}
			renderEdges()
			positionNodeBar()
			return
		}
		if (marquee) {
			const p = screenToWorld(e.clientX - vr.left, e.clientY - vr.top)
			const x = Math.min(marquee.x0, p.x)
			const y = Math.min(marquee.y0, p.y)
			const w = Math.abs(p.x - marquee.x0)
			const h = Math.abs(p.y - marquee.y0)
			Object.assign(marquee.el.style, {
				left: `${x * cam.s + cam.ox}px`,
				top: `${y * cam.s + cam.oy}px`,
				width: `${w * cam.s}px`,
				height: `${h * cam.s}px`,
			})
			marquee.area = { x, y, w, h }
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
		if (imgDrag || imgResize || embedResize) {
			imgDrag = imgResize = embedResize = null
			changed()
			return
		}
		if (strokeDrag) {
			const moved = strokeDrag.moved
			strokeDrag = null
			if (moved) changed()
			return
		}
		if (connect) {
			const from = connect.from
			connect = null
			previewPath?.remove()
			previewPath = null
			const target = document.elementFromPoint(e.clientX, e.clientY)
			// pode soltar num card ou numa imagem
			const alvo = target?.closest?.('.mp-node') || target?.closest?.('.mp-img')
			if (alvo && alvo.dataset.id !== from) {
				const to = alvo.dataset.id
				if (!board.edges.some((ed) => (ed.from === from && ed.to === to) || (ed.from === to && ed.to === from))) {
					board.edges.push({ from, to })
					renderEdges()
					changed()
				}
			} else if (!alvo && getNode(from)) {
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
		if (marquee) {
			const area = marquee.area
			marquee.el.remove()
			marquee = null
			selMulti.clear()
			if (area && area.w > 8 && area.h > 8) {
				for (const n of board.nodes) {
					const el = nodeEls.get(n.id)
					if (!el) continue
					const dentro =
						n.x + el.offsetWidth > area.x && n.x < area.x + area.w &&
						n.y + el.offsetHeight > area.y && n.y < area.y + area.h
					if (dentro) selMulti.add(n.id)
				}
			}
			selNode = selMulti.size === 1 ? [...selMulti][0] : null
			refreshSelection()
			return
		}
		if ((drag && drag.moved) || resize) changed()
		limparGuias()
		drag = resize = pan = null
		viewport.classList.remove('panning')
	})

	// ---------- guias de alinhamento ----------

	function limparGuias() {
		if (!guias) return
		guias.remove()
		guias = null
	}

	// Compara as bordas e o centro do card arrastado com os outros; quando
	// fica a menos de 6px, gruda e mostra a linha
	function encaixar(n, el) {
		const TOL = 6 / cam.s
		const largura = el.offsetWidth
		const altura = el.offsetHeight
		const meus = { l: n.x, c: n.x + largura / 2, r: n.x + largura, t: n.y, m: n.y + altura / 2, b: n.y + altura }
		const linhas = []

		for (const o of board.nodes) {
			if (o.id === n.id || selMulti.has(o.id)) continue
			const oel = nodeEls.get(o.id)
			if (!oel) continue
			const ow = oel.offsetWidth
			const oh = oel.offsetHeight
			const outros = { l: o.x, c: o.x + ow / 2, r: o.x + ow, t: o.y, m: o.y + oh / 2, b: o.y + oh }

			for (const [meu, alvo] of [['l', 'l'], ['c', 'c'], ['r', 'r'], ['l', 'r'], ['r', 'l']]) {
				if (Math.abs(meus[meu] - outros[alvo]) < TOL) {
					n.x += outros[alvo] - meus[meu]
					linhas.push({ vertical: true, pos: outros[alvo] })
					break
				}
			}
			for (const [meu, alvo] of [['t', 't'], ['m', 'm'], ['b', 'b'], ['t', 'b'], ['b', 't']]) {
				if (Math.abs(meus[meu] - outros[alvo]) < TOL) {
					n.y += outros[alvo] - meus[meu]
					linhas.push({ vertical: false, pos: outros[alvo] })
					break
				}
			}
		}

		limparGuias()
		if (!linhas.length) return
		guias = document.createElement('div')
		guias.className = 'mp-guias'
		for (const g of linhas.slice(0, 4)) {
			const linha = document.createElement('i')
			if (g.vertical) {
				linha.className = 'v'
				linha.style.left = `${g.pos * cam.s + cam.ox}px`
			} else {
				linha.className = 'h'
				linha.style.top = `${g.pos * cam.s + cam.oy}px`
			}
			guias.appendChild(linha)
		}
		viewport.appendChild(guias)
	}

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
		if (files.length) {
			e.preventDefault()
			const p = screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2)
			for (const f of files) await addImageFile(f, p)
			return
		}
		// colar um endereço vira card de link direto
		const texto = (e.clipboardData?.getData('text') || '').trim()
		if (/^(https?:\/\/|www\.)\S+$/i.test(texto)) {
			e.preventDefault()
			criarLink(texto)
		}
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

		// desfazer / refazer
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
			e.preventDefault()
			if (e.shiftKey) refazerUltimo()
			else desfazer()
			return
		}
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
			e.preventDefault()
			refazerUltimo()
			return
		}
		// apagar tudo que está selecionado
		if ((e.key === 'Delete' || e.key === 'Backspace') && selMulti.size > 1) {
			e.preventDefault()
			marcar()
			for (const id of selMulti) {
				board.nodes = board.nodes.filter((n) => n.id !== id)
				board.edges = board.edges.filter((x) => x.from !== id && x.to !== id)
				nodeEls.get(id)?.remove()
				nodeEls.delete(id)
			}
			selMulti.clear()
			selNode = null
			refreshSelection()
			changed()
			return
		}

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

	// mouse saiu do quadro: avisa pra sumir meu cursor na tela dos outros
	const onLeave = () => onPointerLeave && onPointerLeave()
	viewport.addEventListener('pointerleave', onLeave)

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

	// ---------- criação dos cards especiais ----------

	function centroDaTela() {
		return screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2)
	}

	function criarCard(extra, texto, largura) {
		const p = centroDaTela()
		const n = {
			id: uid(),
			x: Math.round(p.x - (largura || 130) / 2),
			y: Math.round(p.y - 30),
			text: texto,
			color: 1,
			...autoria(),
			...extra,
		}
		if (largura) n.w = largura
		board.nodes.push(n)
		nodesEl.appendChild(buildNodeEl(n))
		selNode = n.id
		selRect = selImage = selStroke = null
		refreshSelection()
		changed()
		return n
	}

	// Endereço que dá pra mostrar por dentro vira card grande com o
	// conteúdo; o resto vira o cartão compacto com o link.
	function criarLink(url) {
		const limpa = /^https?:\/\//i.test(url) ? url : `https://${url}`
		const emb = incorporavel(limpa)
		if (emb) return criarCard({ kind: 'embed', url: limpa, color: 1 }, emb.tipo, 440)
		return criarCard({ kind: 'link', url: limpa, color: 1 }, dominioDe(limpa), 230)
	}

	// ---------- modo apresentação ----------

	// Cada área vira um slide; a câmera voa de uma pra outra
	let slide = -1
	// A ordem dos slides é escolhida pela pessoa (campo "ordem"); quem
	// ainda não tem posição definida entra depois, de cima pra baixo.
	function slides() {
		return [...board.rects].sort((a, b) => {
			const oa = a.ordem ?? 9999
			const ob = b.ordem ?? 9999
			return oa - ob || a.y - b.y || a.x - b.x
		})
	}

	function voarPara(alvo, dur = 620) {
		const vw = viewport.clientWidth
		const vh = viewport.clientHeight
		const pad = 70
		const destinoS = Math.min(1.6, Math.max(0.15, Math.min(vw / (alvo.w + pad * 2), vh / (alvo.h + pad * 2))))
		const destinoX = (vw - (alvo.x * 2 + alvo.w) * destinoS) / 2
		const destinoY = (vh - (alvo.y * 2 + alvo.h) * destinoS) / 2
		const de = { s: cam.s, ox: cam.ox, oy: cam.oy }
		const t0 = performance.now()
		function passo(t) {
			const k = Math.min(1, (t - t0) / dur)
			// desacelera no fim, dá sensação de câmera de cinema
			const e = 1 - (1 - k) ** 3
			cam.s = de.s + (destinoS - de.s) * e
			cam.ox = de.ox + (destinoX - de.ox) * e
			cam.oy = de.oy + (destinoY - de.oy) * e
			applyTransform()
			if (k < 1) requestAnimationFrame(passo)
		}
		requestAnimationFrame(passo)
	}

	function irParaSlide(i) {
		const lista = slides()
		if (!lista.length) return null
		slide = ((i % lista.length) + lista.length) % lista.length
		voarPara(lista[slide])
		return { atual: slide + 1, total: lista.length, nome: lista[slide].label || 'Área' }
	}

	// ---------- busca ----------

	function buscar(termo) {
		const t = (termo || '').trim().toLowerCase()
		for (const [id, el] of nodeEls) el.classList.remove('achado')
		if (!t) return []
		const achados = board.nodes.filter((n) => (n.text || '').toLowerCase().includes(t))
		for (const n of achados) nodeEls.get(n.id)?.classList.add('achado')
		return achados.map((n) => n.id)
	}

	function focarNo(id) {
		const n = getNode(id)
		const el = nodeEls.get(id)
		if (!n || !el) return
		voarPara({ x: n.x - 120, y: n.y - 90, w: el.offsetWidth + 240, h: el.offsetHeight + 180 }, 420)
		selNode = id
		refreshSelection()
	}

	// Está mexendo em algo agora? Serve pra não puxar o tapete: uma
	// atualização que chega de outra pessoa espera você soltar o mouse.
	function isBusy() {
		return Boolean(drag || resize || pen || connect || rectDraw || rectMove || rectResize || imgDrag || imgResize || strokeDrag || embedResize || editing)
	}

	return {
		setTool,
		getTool: () => tool,
		isBusy,
		/** Substitui o quadro pelo que veio de outra pessoa, preservando a câmera. */
		applyRemote(next) {
			if (isBusy()) return false
			for (const k of ['nodes', 'edges', 'rects', 'strokes', 'images']) {
				board[k] = Array.isArray(next[k]) ? next[k] : []
			}
			if (next.name) board.name = next.name
			// mantém a seleção só se o elemento ainda existir
			if (selNode && !getNode(selNode)) selNode = null
			if (selImage && !getImage(selImage)) selImage = null
			if (selRect && !getRect(selRect)) selRect = null
			nodesEl.innerHTML = ''
			nodeEls.clear()
			for (const n of board.nodes) nodesEl.appendChild(buildNodeEl(n))
			renderRects()
			renderImages()
			renderInk()
			refreshSelection()
			return true
		},
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
		addLink(url) {
			criarLink(url)
		},
		addCode() {
			const n = criarCard({ kind: 'code', lang: 'código', color: 1 }, 'cole seu código aqui', 320)
			startEdit(n.id, true)
		},
		addTask() {
			const n = criarCard({ kind: 'task', status: 'todo', color: 1 }, 'Nova tarefa', 200)
			startEdit(n.id, true)
		},
		desfazer,
		refazer: refazerUltimo,
		/**
		 * Vira os passos que a IA sugeriu em cards de verdade, empilhados ao
		 * lado do que estava sendo analisado e ligados a ele.
		 */
		criarCardsDaIA(textos, pedido) {
			if (!textos?.length) return
			marcar()
			const base = pedido?.tipo === 'area' ? pedido.alvo : getNode(pedido?.alvo?.id)
			const x0 = base ? base.x + (base.w || 220) + 70 : centroDaTela().x
			const y0 = base ? base.y : centroDaTela().y
			textos.forEach((t, i) => {
				const n = {
					id: uid(),
					x: Math.round(x0),
					y: Math.round(y0 + i * 92),
					text: t,
					color: 3,
					w: 240,
					daIA: true,
					...autoria(),
				}
				board.nodes.push(n)
				nodesEl.appendChild(buildNodeEl(n))
				if (pedido?.tipo === 'card' && base) board.edges.push({ from: base.id, to: n.id })
			})
			renderEdges()
			changed()
		},
		selecionados: () => selMulti.size,
		/** Muda a cor de todos os cards selecionados de uma vez. */
		corDoGrupo(i) {
			if (!selMulti.size) return
			marcar()
			for (const id of selMulti) {
				const n = getNode(id)
				if (!n) continue
				n.color = i
				const el = nodeEls.get(id)
				const c = NODE_COLORS[i]
				if (el && !n.kind) {
					el.style.background = c.bg
					el.style.color = c.fg
				}
			}
			changed()
		},
		irParaSlide,
		slidesTotal: () => slides().length,
		listaDeSlides: () => slides().map((r, i) => ({ id: r.id, nome: r.label || 'Área', pos: i })),
		moverSlide(id, direcao) {
			const lista = slides()
			const i = lista.findIndex((r) => r.id === id)
			const j = i + direcao
			if (i < 0 || j < 0 || j >= lista.length) return false
			const [a] = lista.splice(i, 1)
			lista.splice(j, 0, a)
			lista.forEach((r, k) => {
				const alvo = getRect(r.id)
				if (alvo) alvo.ordem = k
			})
			changed()
			return true
		},
		/** Atualiza campos de um card (usado pelo painel de detalhes). */
		atualizarCard(id, campos) {
			const n = getNode(id)
			if (!n) return null
			const respAntes = n.resp
			Object.assign(n, campos)
			const el = nodeEls.get(id)
			if (el) {
				const novo = buildNodeEl(n)
				el.replaceWith(novo)
				refreshSelection()
			}
			changed()
			// avisa quem acabou de virar responsável
			if (campos.resp && campos.resp !== respAntes) onAssign && onAssign(n)
			return n
		},
		buscar,
		focarNo,
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
			window.removeEventListener('keydown', onSpaceDown)
			window.removeEventListener('keyup', onSpaceUp)
			viewport.removeEventListener('pointerleave', onLeave)
			peerEls.clear()
			container.innerHTML = ''
		},
	}
}
