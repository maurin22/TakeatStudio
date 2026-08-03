import { useEffect, useState } from 'react'
import { listBoards, createBoard, deleteBoard, importBoard } from '../lib/boards'
import { NODE_COLORS } from '../engine/mapEngine'
import { hasCloud } from '../lib/supabase'
import { TEMPLATES } from '../lib/templates'
import { listar, marcarTodasLidas, ouvir } from '../lib/notificacoes'

function fmtDate(ts) {
	if (!ts) return ''
	const d = new Date(ts)
	const hoje = new Date()
	if (d.toDateString() === hoje.toDateString()) {
		return `hoje às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
	}
	return d.toLocaleDateString('pt-BR')
}

export default function Gallery({ onOpen, user, onSignOut, ehAdmin, onAdmin, onPerfil }) {
	const [boards, setBoards] = useState([])
	const [loading, setLoading] = useState(true)
	const [erro, setErro] = useState(null)
	const [avisos, setAvisos] = useState([])
	const [avisosAbertos, setAvisosAbertos] = useState(false)

	async function refresh() {
		setLoading(true)
		try {
			setBoards(await listBoards())
			setErro(null)
		} catch (e) {
			setErro(e.message)
		}
		setLoading(false)
	}

	useEffect(() => {
		refresh()
	}, [])

	// notificações: carrega as existentes e escuta as novas chegando
	useEffect(() => {
		if (!user?.email) return
		listar(user.email).then(setAvisos)
		return ouvir(user.email, (nova) => setAvisos((l) => [nova, ...l]))
	}, [user?.email])

	const naoLidas = avisos.filter((a) => !a.lida).length

	async function abrirAvisos() {
		const novo = !avisosAbertos
		setAvisosAbertos(novo)
		if (novo && naoLidas) {
			await marcarTodasLidas(user.email)
			setAvisos((l) => l.map((a) => ({ ...a, lida: true })))
		}
	}

	async function novo(tpl) {
		const id = await createBoard(tpl ? tpl.nome : 'Meu mapa', tpl ? tpl.build() : null)
		onOpen(id)
	}

	async function apagar(b, ev) {
		ev.stopPropagation()
		if (!confirm(`Apagar o mapa "${b.name}"? Isso não tem volta.`)) return
		await deleteBoard(b.id)
		refresh()
	}

	async function importar(ev) {
		const file = ev.target.files?.[0]
		ev.target.value = ''
		if (!file) return
		try {
			const id = await importBoard(JSON.parse(await file.text()))
			onOpen(id)
		} catch {
			alert('Não consegui ler esse arquivo. Ele precisa ser um .takeatmap.')
		}
	}

	return (
		<div className="gallery">
			<header className="topbar">
				<div className="brand small">
					<img src="/takeat-icon.png" alt="Takeat" />
					<span>
						Takeat <em>Map</em>
					</span>
				</div>
				<div className="grow" />
				{!hasCloud && <span className="badge-local">modo local</span>}
				<label className="tbtn">
					Importar
					<input type="file" accept=".takeatmap,.json" onChange={importar} hidden />
				</label>
				{hasCloud && user && (
					<div className="sino-wrap">
						<button className="tbtn sino" onClick={abrirAvisos} title="Notificações">
							🔔{naoLidas > 0 && <i className="badge">{naoLidas}</i>}
						</button>
						{avisosAbertos && (
							<div className="avisos">
								<strong>Notificações</strong>
								{avisos.length === 0 && <p className="vazio">Nada por aqui ainda.</p>}
								{avisos.map((a) => (
									<button
										key={a.id}
										className={'aviso' + (a.lida ? '' : ' nova')}
										onClick={() => a.board_id && onOpen(a.board_id)}
									>
										<span>
											<b>{a.de || 'alguém'}</b> {a.texto}
										</span>
										<em>
											{a.board_nome ? `${a.board_nome} · ` : ''}
											{new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
										</em>
									</button>
								))}
							</div>
						)}
					</div>
				)}
				{hasCloud && ehAdmin && (
					<button className="tbtn" onClick={onAdmin} title="Criar contas pro time">
						+ Contas
					</button>
				)}
				{user && (
					<>
						<button className="tbtn ghost" onClick={onPerfil} title="Meu perfil">
							<span className="who">{user.email}</span>
						</button>
						<button className="tbtn ghost" onClick={onSignOut}>
							Sair
						</button>
					</>
				)}
			</header>

			<div className="gallery-body">
				<h1>
					Meus <em>mapas</em>
				</h1>
				<p className="sub">
					{hasCloud
						? 'Seus quadros ficam na nuvem e podem ser abertos de qualquer lugar.'
						: 'Rodando sem conta: os quadros ficam salvos só neste navegador.'}
				</p>

				{erro && <p className="status erro">{erro}</p>}

				<h2 className="admin-h2" style={{ marginTop: 0 }}>
					Comece por um modelo
				</h2>
				<div className="tpl-grid">
					{TEMPLATES.map((t) => (
						<button key={t.id} className="tpl" onClick={() => novo(t)}>
							<strong>{t.nome}</strong>
							<span>{t.desc}</span>
						</button>
					))}
				</div>

				<h2 className="admin-h2">Seus quadros</h2>
				<div className="board-grid">
					<button className="bcard new" onClick={() => novo(null)}>
						<span className="plus">+</span>
						<span>Novo mapa</span>
					</button>

					{loading
						? <div className="bcard skeleton" />
						: boards.map((b) => (
								<button key={b.id} className="bcard" onClick={() => onOpen(b.id)}>
									<span className="bname">
										{b.name || 'Sem nome'}
										{b.shared && <i className="tag-shared" title="Compartilhado por link">🔗</i>}
										{b.meu === false && <i className="tag-shared" title="De outra pessoa">👥</i>}
									</span>
									<span className="bmeta">
										{(b.nodes?.length || 0)} {(b.nodes?.length || 0) === 1 ? 'ideia' : 'ideias'} · {fmtDate(b.updatedAt)}
									</span>
									<span className="bdots">
										{(b.nodes || []).slice(0, 8).map((n, i) => (
											<i key={i} style={{ background: (NODE_COLORS[n.color] || NODE_COLORS[0]).bg }} />
										))}
									</span>
									<span className="bdel" onClick={(ev) => apagar(b, ev)} title="Apagar mapa">
										<svg viewBox="0 0 24 24">
											<path
												d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									</span>
								</button>
							))}
				</div>
			</div>
		</div>
	)
}
