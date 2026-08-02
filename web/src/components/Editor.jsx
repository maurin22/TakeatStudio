import { useEffect, useRef, useState } from 'react'
import { createMapEngine, INK_COLORS } from '../engine/mapEngine'
import { getBoard, saveBoard } from '../lib/boards'
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

	useEffect(() => {
		let cancelled = false
		let engine = null
		let room = null

		;(async () => {
			const board = await getBoard(boardId)
			if (!board || cancelled || !hostRef.current) return
			setName(board.name || 'Meu mapa')

			engine = createMapEngine({
				container: hostRef.current,
				board,
				uploadImage,
				resolveImage,
				onChange: async (b) => {
					setSaving('saving')
					try {
						await saveBoard(boardId, { ...b, name: b.name || board.name })
						setSaving('ok')
					} catch {
						setSaving('erro')
					}
				},
				onPointerMove: (p) => room?.move(p.x, p.y),
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
			})
			roomRef.current = room
		})()

		return () => {
			cancelled = true
			room?.leave()
			engine?.destroy()
			engineRef.current = null
			roomRef.current = null
		}
	}, [boardId, user])

	function pick(t) {
		engineRef.current?.setTool(t)
		setTool(t)
	}

	function pickInk(c) {
		engineRef.current?.setInkColor(c)
		setInk(c)
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

			<div className="hint">
				<b>Duplo clique</b> novo nó &nbsp; <b>Bolinha</b> arrasta conexão &nbsp; <b>Tab</b> filho &nbsp; <b>Ctrl+V</b> cola imagem &nbsp; <b>Delete</b> apagar
			</div>
		</div>
	)
}
