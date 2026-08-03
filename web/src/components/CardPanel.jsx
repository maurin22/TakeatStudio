import { useEffect, useRef, useState } from 'react'

const STATUS = [
	{ id: 'todo', txt: 'A fazer', cor: '#8f8f97' },
	{ id: 'doing', txt: 'Fazendo', cor: '#fbbf24' },
	{ id: 'done', txt: 'Feito', cor: '#34d668' },
]

const PRIOS = [
	{ id: 'baixa', txt: 'Baixa', cor: '#4b8ef5' },
	{ id: 'media', txt: 'Média', cor: '#fbbf24' },
	{ id: 'alta', txt: 'Alta', cor: '#ff3b30' },
]

function dataLonga(ts) {
	if (!ts) return '—'
	return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function diasPro(prazo) {
	if (!prazo) return null
	const hoje = new Date()
	hoje.setHours(0, 0, 0, 0)
	const d = Math.round((new Date(`${prazo}T00:00:00`) - hoje) / 86400000)
	if (d < 0) return { txt: `atrasada há ${-d} dia${-d > 1 ? 's' : ''}`, urgente: true }
	if (d === 0) return { txt: 'vence hoje', urgente: true }
	if (d === 1) return { txt: 'vence amanhã', urgente: false }
	return { txt: `faltam ${d} dias`, urgente: false }
}

/** Painel lateral com os detalhes do card selecionado. */
export default function CardPanel({ card, pessoas, onChange, onClose, onVirarTarefa }) {
	const [resp, setResp] = useState('')
	const [prazo, setPrazo] = useState('')
	const [nota, setNota] = useState('')
	const [tag, setTag] = useState('')
	const [sugestoes, setSugestoes] = useState(null)
	const notaRef = useRef(null)

	useEffect(() => {
		setResp(card?.resp || '')
		setPrazo(card?.prazo || '')
		setNota(card?.nota || '')
		setSugestoes(null)
	}, [card?.id])

	if (!card) return null
	const ehTarefa = card.kind === 'task'
	const tags = card.tags || []
	const checklist = card.checklist || []
	const feitos = checklist.filter((i) => i.ok).length
	const venc = diasPro(prazo)

	function digitouNota(e) {
		const v = e.target.value
		setNota(v)
		// autocompletar menção enquanto digita @
		const antes = v.slice(0, e.target.selectionStart)
		const m = antes.match(/@([\w.-]*)$/)
		if (!m) return setSugestoes(null)
		const busca = m[1].toLowerCase()
		const achou = pessoas.filter((p) => p.toLowerCase().startsWith(busca)).slice(0, 5)
		setSugestoes(achou.length ? achou : null)
	}

	function completar(nome) {
		const el = notaRef.current
		const pos = el.selectionStart
		const antes = nota.slice(0, pos).replace(/@[\w.-]*$/, `@${nome} `)
		const novo = antes + nota.slice(pos)
		setNota(novo)
		setSugestoes(null)
		onChange({ nota: novo })
		requestAnimationFrame(() => {
			el.focus()
			el.setSelectionRange(antes.length, antes.length)
		})
	}

	function addTag(e) {
		e.preventDefault()
		const t = tag.trim().replace(/^#/, '')
		if (!t || tags.includes(t)) return setTag('')
		onChange({ tags: [...tags, t] })
		setTag('')
	}

	function addItem(e) {
		e.preventDefault()
		const t = e.target.elements.item.value.trim()
		if (!t) return
		onChange({ checklist: [...checklist, { id: Math.random().toString(36).slice(2, 8), txt: t, ok: false }] })
		e.target.reset()
	}

	function marcarItem(id) {
		onChange({ checklist: checklist.map((i) => (i.id === id ? { ...i, ok: !i.ok } : i)) })
	}

	return (
		<aside className="cardpanel">
			<header>
				<strong>{ehTarefa ? 'Tarefa' : 'Card'}</strong>
				<button onClick={onClose} title="Fechar">
					✕
				</button>
			</header>

			<div className="cp-body">
				<p className="cp-titulo">{card.text || 'Sem título'}</p>

				<div className="cp-quem">
					<span className="cp-av" title={card.por}>
						{(card.por || '?')[0].toUpperCase()}
					</span>
					<div>
						<b>{card.por || 'alguém'}</b>
						<small>criou em {dataLonga(card.em)}</small>
					</div>
				</div>

				{ehTarefa ? (
					<>
						<label className="cp-label">Status</label>
						<div className="cp-status">
							{STATUS.map((s) => (
								<button
									key={s.id}
									className={(card.status || 'todo') === s.id ? 'sel' : ''}
									style={(card.status || 'todo') === s.id ? { background: s.cor, color: '#10100f' } : undefined}
									onClick={() => onChange({ status: s.id })}
								>
									{s.txt}
								</button>
							))}
						</div>

						<label className="cp-label">Prioridade</label>
						<div className="cp-status">
							{PRIOS.map((p) => (
								<button
									key={p.id}
									className={card.prio === p.id ? 'sel' : ''}
									style={card.prio === p.id ? { background: p.cor, color: '#10100f' } : undefined}
									onClick={() => onChange({ prio: card.prio === p.id ? null : p.id })}
								>
									{p.txt}
								</button>
							))}
						</div>

						<label className="cp-label">Responsável</label>
						<input
							list="pessoas-do-quadro"
							value={resp}
							placeholder="nome ou e-mail"
							onChange={(e) => setResp(e.target.value)}
							onBlur={() => resp !== (card.resp || '') && onChange({ resp: resp.trim() })}
							onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						/>
						<datalist id="pessoas-do-quadro">
							{pessoas.map((p) => (
								<option key={p} value={p} />
							))}
						</datalist>
						<p className="cp-dica">Ao definir alguém, essa pessoa recebe uma notificação.</p>

						<label className="cp-label">Prazo</label>
						<input
							type="date"
							value={prazo}
							onChange={(e) => {
								setPrazo(e.target.value)
								onChange({ prazo: e.target.value })
							}}
						/>
						{venc && <p className={`cp-venc ${venc.urgente ? 'urgente' : ''}`}>{venc.txt}</p>}

						<label className="cp-label">
							Subtarefas {checklist.length > 0 && <em>{feitos}/{checklist.length}</em>}
						</label>
						{checklist.length > 0 && (
							<div className="cp-barra">
								<i style={{ width: `${(feitos / checklist.length) * 100}%` }} />
							</div>
						)}
						<ul className="cp-check">
							{checklist.map((i) => (
								<li key={i.id} className={i.ok ? 'ok' : ''}>
									<button onClick={() => marcarItem(i.id)}>{i.ok ? '✓' : ''}</button>
									<span>{i.txt}</span>
									<button
										className="x"
										onClick={() => onChange({ checklist: checklist.filter((c) => c.id !== i.id) })}
										title="Remover"
									>
										✕
									</button>
								</li>
							))}
						</ul>
						<form onSubmit={addItem}>
							<input name="item" placeholder="+ adicionar subtarefa" autoComplete="off" />
						</form>
					</>
				) : (
					<button className="cp-virar" onClick={onVirarTarefa}>
						Transformar em tarefa
					</button>
				)}

				<label className="cp-label">Etiquetas</label>
				<div className="cp-tags">
					{tags.map((t) => (
						<span key={t}>
							#{t}
							<button onClick={() => onChange({ tags: tags.filter((x) => x !== t) })}>✕</button>
						</span>
					))}
				</div>
				<form onSubmit={addTag}>
					<input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ etiqueta (ex: produto)" autoComplete="off" />
				</form>

				<label className="cp-label">Anotações</label>
				<div className="cp-nota-wrap">
					<textarea
						ref={notaRef}
						value={nota}
						rows={5}
						placeholder="detalhes, links, contexto... use @ pra chamar alguém"
						onChange={digitouNota}
						onBlur={() => {
							setTimeout(() => setSugestoes(null), 150)
							if (nota !== (card.nota || '')) onChange({ nota })
						}}
					/>
					{sugestoes && (
						<div className="cp-mencoes">
							{sugestoes.map((p) => (
								<button key={p} onMouseDown={(e) => e.preventDefault()} onClick={() => completar(p)}>
									@{p}
								</button>
							))}
						</div>
					)}
				</div>
			</div>
		</aside>
	)
}
