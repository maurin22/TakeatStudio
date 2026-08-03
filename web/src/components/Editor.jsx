import { useEffect, useRef, useState } from 'react'
import { createMapEngine, INK_COLORS } from '../engine/mapEngine'
import { getBoard, saveBoard, setBoardShared } from '../lib/boards'
import CardPanel from './CardPanel'
import IAPanel from './IAPanel'
import { avisar } from '../lib/notificacoes'
import { listarPerfis } from '../lib/perfis'
import { uploadImage, resolveImage } from '../lib/imageStore'
import { joinBoard, colorFor } from '../lib/presence'
import { hasCloud } from '../lib/supabase'

export default function Editor({ boardId, user, onBack }) {
	const hostRef = useRef(null)
	const engineRef = useRef(null)
	const roomRef = useRef(null)
	const fileRef = useRef(null)
	const [name, setName] = useState('')
	const [tool, setTool] = useState('select')
	const [ink, setInk] = useState(INK_COLORS[0])
	const [zoom, setZoom] = useState(1)
	const [peers, setPeers] = useState([])
	const [saving, setSaving] = useState('ok')
	const [shared, setShared] = useState(false)
	const [copiado, setCopiado] = useState(false)
	const [slide, setSlide] = useState(null)
	const [busca, setBusca] = useState('')
	const [buscaAberta, setBuscaAberta] = useState(false)
	const [achados, setAchados] = useState([])
	const [achadoAtual, setAchadoAtual] = useState(0)
	const [cardAberto, setCardAberto] = useState(null)
	const [ordemAberta, setOrdemAberta] = useState(false)
	const [listaSlides, setListaSlides] = useState([])
	const [pedidoIA, setPedidoIA] = useState(null)
	const [pessoas, setPessoas] = useState([])
	const pendingRemote = useRef(null)

	// nomes das contas: alimentam as menções com @ e o campo de responsável
	useEffect(() => {
		listarPerfis().then((lista) => setPessoas(lista.map((p) => p.nome || p.email?.split('@')[0]).filter(Boolean)))
	}, [])

	useEffect(() => {
		let cancelled = false
		let engine = null
		let room = null
		let flushTimer = null

		;(async () => {
			const board = await getBoard(boardId)
			if (!board || cancelled || !hostRef.current) return
			setName(board.name || 'Meu mapa')

			setShared(Boolean(board.is_shared))

			engine = createMapEngine({
				container: hostRef.current,
				board,
				uploadImage,
				resolveImage,
				onChange: async (b) => {
					// manda pros outros na hora e salva no banco
					room?.publish({
						nodes: b.nodes,
						edges: b.edges,
						rects: b.rects,
						strokes: b.strokes,
						images: b.images,
						name: b.name,
					})
					setSaving('saving')
					try {
						await saveBoard(boardId, { ...b, name: b.name || board.name })
						setSaving('ok')
					} catch {
						setSaving('erro')
					}
				},
				onPointerMove: (p) => room?.move(p.x, p.y),
				onPointerLeave: () => room?.hide(),
				me: {
					id: user?.id || 'anon',
					name: user?.email?.split('@')[0] || 'Visitante',
				},
				onSelect: (card, abrirPainel) => {
					if (abrirPainel) setCardAberto({ ...card })
				},
				onAssign: (card) => {
					avisar({
						para: card.resp,
						de: user?.email?.split('@')[0] || 'alguém',
						texto: `te colocou como responsável por "${card.text}"`,
						boardId,
						boardNome: board.name,
					})
				},
				onMention: (quem, card) => {
					avisar({
						para: quem,
						de: user?.email?.split('@')[0] || 'alguém',
						texto: `te mencionou em "${card.text}"`,
						boardId,
						boardNome: board.name,
					})
				},
				onIA: (pedido) => setPedidoIA(pedido),
			})
			engine.onToolChange(setTool)
			engine.onZoom(setZoom)
			engineRef.current = engine

			room = joinBoard({
				boardId,
				me: {
					id: user?.id || `anon-${Math.random().toString(36).slice(2, 8)}`,
					name: user?.email?.split('@')[0] || 'Visitante',
				},
				onPeers: (list) => {
					setPeers(list)
					engine?.setPeers(list)
				},
				onRemoteBoard: (b) => {
					// se estou arrastando algo, a atualização espera minha vez
					if (!engine?.applyRemote(b)) {
						pendingRemote.current = b
					}
				},
			})
			roomRef.current = room

			// tenta aplicar o que ficou na fila assim que eu parar de mexer
			flushTimer = setInterval(() => {
				if (pendingRemote.current && engine && !engine.isBusy()) {
					engine.applyRemote(pendingRemote.current)
					pendingRemote.current = null
				}
			}, 500)
		})()

		return () => {
			cancelled = true
			if (flushTimer) clearInterval(flushTimer)
			room?.leave()
			engine?.destroy()
			engineRef.current = null
			roomRef.current = null
		}
	}, [boardId, user])

	async function alternarCompartilhamento() {
		const novo = !shared
		setShared(novo)
		try {
			await setBoardShared(boardId, novo)
			if (novo) copiarLink()
		} catch {
			setShared(!novo)
			alert('Não consegui mudar o compartilhamento.')
		}
	}

	function copiarLink() {
		const link = `${window.location.origin}/#/mapa/${boardId}`
		navigator.clipboard?.writeText(link)
		setCopiado(true)
		setTimeout(() => setCopiado(false), 2200)
	}

	function pick(t) {
		engineRef.current?.setTool(t)
		setTool(t)
	}

	function pickInk(c) {
		engineRef.current?.setInkColor(c)
		setInk(c)
	}

	// Ctrl+F abre a busca; nas setas, navega os slides quando apresentando
	useEffect(() => {
		const onKey = (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
				e.preventDefault()
				setBuscaAberta(true)
				return
			}
			if (!slide) return
			if (e.key === 'ArrowRight' || e.key === 'PageDown') passarSlide(1)
			if (e.key === 'ArrowLeft' || e.key === 'PageUp') passarSlide(-1)
			if (e.key === 'Escape') sairApresentacao()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [slide, achados, achadoAtual])

	function novoLink() {
		const url = prompt('Cole o endereço (Figma, Notion, Drive, YouTube...):')
		if (url && url.trim()) engineRef.current?.addLink(url.trim())
	}

	function apresentar() {
		const total = engineRef.current?.slidesTotal() || 0
		if (!total) {
			alert('Pra apresentar, desenhe áreas no quadro (ferramenta ▭). Cada área vira um slide.')
			return
		}
		setListaSlides(engineRef.current.listaDeSlides())
		setSlide(engineRef.current.irParaSlide(0))
	}

	function moverSlide(id, dir) {
		if (engineRef.current?.moverSlide(id, dir)) {
			setListaSlides(engineRef.current.listaDeSlides())
			setSlide((s) => (s ? { ...s, ...engineRef.current.irParaSlide(s.atual - 1) } : s))
		}
	}

	// muda campos do card e mantém o painel em sincronia
	function alterarCard(campos) {
		if (!cardAberto) return
		// menção nova nas anotações também avisa a pessoa
		if (campos.nota !== undefined) {
			const antigas = new Set((cardAberto.nota || '').match(/@[\w.-]+/g) || [])
			for (const m of campos.nota.match(/@[\w.-]+/g) || []) {
				if (antigas.has(m)) continue
				avisar({
					para: m.slice(1),
					de: user?.email?.split('@')[0] || 'alguém',
					texto: `te mencionou em "${cardAberto.text}"`,
					boardId,
					boardNome: name,
				})
			}
		}
		const atualizado = engineRef.current?.atualizarCard(cardAberto.id, campos)
		if (atualizado) setCardAberto({ ...atualizado })
	}

	function virarTarefa() {
		alterarCard({ kind: 'task', status: 'todo', w: cardAberto.w || 210 })
	}

	function passarSlide(d) {
		if (!slide) return
		setSlide(engineRef.current?.irParaSlide(slide.atual - 1 + d))
	}

	function sairApresentacao() {
		setSlide(null)
		engineRef.current?.fitView()
	}

	function aoBuscar(t) {
		setBusca(t)
		const ids = engineRef.current?.buscar(t) || []
		setAchados(ids)
		if (ids.length) engineRef.current?.focarNo(ids[0])
	}

	function proximoAchado() {
		if (!achados.length) return
		const i = (achadoAtual + 1) % achados.length
		setAchadoAtual(i)
		engineRef.current?.focarNo(achados[i])
	}

	async function onFiles(ev) {
		const files = Array.from(ev.target.files || [])
		ev.target.value = ''
		if (files.length) await engineRef.current?.addImages(files)
	}

	function renomear(v) {
		setName(v)
		const b = engineRef.current?.getBoard()
		if (b) {
			b.name = v.trim() || 'Meu mapa'
			saveBoard(boardId, b).catch(() => setSaving('erro'))
		}
	}

	return (
		<div className="editor">
			<header className="topbar">
				<button className="tbtn ghost" onClick={onBack} title="Voltar aos meus mapas">
					←
				</button>
				<div className="brand small">
					<img src="/takeat-icon.png" alt="Takeat" />
					<span>
						Takeat <em>Map</em>
					</span>
				</div>
				<input className="board-name" value={name} onChange={(e) => renomear(e.target.value)} spellCheck={false} />
				<span className={`save ${saving}`}>
					{saving === 'saving' ? 'salvando...' : saving === 'erro' ? 'erro ao salvar' : 'salvo'}
				</span>
				<div className="grow" />

				{hasCloud && (
					<div className="peers">
						{peers.slice(0, 5).map((p) => (
							<span key={p.id} className="avatar" style={{ background: colorFor(p.id) }} title={p.name}>
								{(p.name || '?')[0].toUpperCase()}
							</span>
						))}
						{user && (
							<span className="avatar me" style={{ background: colorFor(user.id) }} title="Você">
								{(user.email || '?')[0].toUpperCase()}
							</span>
						)}
					</div>
				)}

				{hasCloud && (
					<button
						className={`tbtn ${shared ? 'on' : ''}`}
						onClick={shared ? copiarLink : alternarCompartilhamento}
						title={shared ? 'Copiar link do quadro' : 'Liberar este quadro pro time'}
					>
						{copiado ? '✓ link copiado' : shared ? '🔗 copiar link' : 'Compartilhar'}
					</button>
				)}
				{hasCloud && shared && (
					<button className="tbtn ghost" onClick={alternarCompartilhamento} title="Parar de compartilhar">
						✕
					</button>
				)}

				<button className="tbtn" onClick={apresentar} title="Cada área vira um slide">
					▶ Apresentar
				</button>
				<button className="tbtn" onClick={() => engineRef.current?.fitView()}>
					Centralizar
				</button>
			</header>

			<div className="canvas-host" ref={hostRef} />

			<div className="toolbar">
				<button className={`tool ${tool === 'select' ? 'active' : ''}`} onClick={() => pick('select')} title="Selecionar (V)">
					<svg viewBox="0 0 24 24">
						<path d="M5 3l14 8-6.5 1.8L9 19z" />
					</svg>
				</button>
				<button className="tool" onClick={() => engineRef.current?.addNodeAtCenter()} title="Novo nó (duplo clique no quadro)">
					<svg viewBox="0 0 24 24">
						<rect x="3" y="7" width="18" height="10" rx="2.5" />
						<path d="M12 10.5v3M10.5 12h3" />
					</svg>
				</button>
				<button className={`tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => pick('pen')} title="Caneta — o traço é suavizado ao soltar (P)">
					<svg viewBox="0 0 24 24">
						<path d="M16.5 3.5l4 4L8 20l-5 1 1-5z" />
						<path d="M14 6l4 4" />
					</svg>
				</button>
				<button className={`tool ${tool === 'rect' ? 'active' : ''}`} onClick={() => pick('rect')} title="Área pra agrupar (R)">
					<svg viewBox="0 0 24 24">
						<rect x="3.5" y="5.5" width="17" height="13" rx="2.5" strokeDasharray="3.5 3" />
					</svg>
				</button>
				<div className="tsplit" />
				<button className="tool" onClick={() => fileRef.current?.click()} title="Imagem — ou arraste um arquivo pra cá">
					<svg viewBox="0 0 24 24">
						<rect x="3" y="4.5" width="18" height="15" rx="2.5" />
						<circle cx="8.5" cy="10" r="1.6" />
						<path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
					</svg>
				</button>
				<button className="tool" onClick={novoLink} title="Card de link (ou cole um endereço no quadro)">
					<svg viewBox="0 0 24 24">
						<path d="M10 13.5a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
						<path d="M14 10.5a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
					</svg>
				</button>
				<button className="tool" onClick={() => engineRef.current?.addCode()} title="Bloco de código">
					<svg viewBox="0 0 24 24">
						<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
					</svg>
				</button>
				<button className="tool" onClick={() => engineRef.current?.addTask()} title="Card de tarefa">
					<svg viewBox="0 0 24 24">
						<rect x="4" y="4.5" width="16" height="15" rx="3" />
						<path d="M8.5 12.5l2.5 2.5 4.5-5" />
					</svg>
				</button>
				<input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />

				{tool === 'pen' && (
					<div className="ink-colors">
						{INK_COLORS.map((c) => (
							<button key={c} className={ink === c ? 'active' : ''} style={{ background: c }} onClick={() => pickInk(c)} />
						))}
					</div>
				)}
			</div>

			<div className="zoombar">
				<button onClick={() => engineRef.current?.zoomOut()}>−</button>
				<span onClick={() => engineRef.current?.resetZoom()} title="Voltar pra 100%">
					{Math.round(zoom * 100)}%
				</span>
				<button onClick={() => engineRef.current?.zoomIn()}>+</button>
			</div>

			{slide && (
				<>
					<div className="slidebar">
						<button onClick={() => passarSlide(-1)} title="Anterior (←)">
							←
						</button>
						<span>
							<b>{slide.nome}</b> · {slide.atual}/{slide.total}
						</span>
						<button onClick={() => passarSlide(1)} title="Próximo (→)">
							→
						</button>
						<button onClick={() => setOrdemAberta(!ordemAberta)} title="Ordem dos slides">
							☰
						</button>
						<button className="sair" onClick={sairApresentacao} title="Sair (Esc)">
							✕
						</button>
					</div>

					{ordemAberta && (
						<div className="ordembar">
							<strong>Ordem dos slides</strong>
							{listaSlides.map((s, i) => (
								<div key={s.id} className="ordem-item">
									<span>
										{i + 1}. {s.nome}
									</span>
									<button onClick={() => moverSlide(s.id, -1)} disabled={i === 0} title="Subir">
										↑
									</button>
									<button onClick={() => moverSlide(s.id, 1)} disabled={i === listaSlides.length - 1} title="Descer">
										↓
									</button>
								</div>
							))}
							<p className="cp-dica">Renomeie as áreas no quadro com duplo clique na etiqueta.</p>
						</div>
					)}
				</>
			)}

			<CardPanel
				card={cardAberto}
				pessoas={[...new Set([...pessoas, ...peers.map((p) => p.name), user?.email?.split('@')[0]].filter(Boolean))]}
				onChange={alterarCard}
				onVirarTarefa={virarTarefa}
				onClose={() => setCardAberto(null)}
			/>

			<IAPanel pedido={pedidoIA} onClose={() => setPedidoIA(null)} onVirarCards={(textos) => engineRef.current?.criarCardsDaIA(textos, pedidoIA)} />

			{buscaAberta && (
				<div className="buscabar">
					<input
						autoFocus
						value={busca}
						placeholder="buscar no quadro..."
						onChange={(e) => aoBuscar(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') proximoAchado()
							if (e.key === 'Escape') {
								aoBuscar('')
								setBuscaAberta(false)
							}
						}}
					/>
					<span>{achados.length ? `${achadoAtual + 1}/${achados.length}` : busca ? 'nada' : ''}</span>
					<button
						onClick={() => {
							aoBuscar('')
							setBuscaAberta(false)
						}}
					>
						✕
					</button>
				</div>
			)}

			<div className="hint">
				<b>Duplo clique</b> novo nó &nbsp; <b>Arrastar no vazio</b> seleciona &nbsp; <b>Espaço</b> move o quadro &nbsp; <b>Ctrl+Z</b> desfaz &nbsp; <b>✦</b> IA &nbsp; <b>Delete</b> apagar
			</div>
		</div>
	)
}
