import { useEffect, useState } from 'react'
import { meuPerfil, salvarPerfil } from '../lib/perfis'

export default function Perfil({ onBack }) {
	const [p, setP] = useState(null)
	const [status, setStatus] = useState(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		meuPerfil().then(setP)
	}, [])

	async function salvar(e) {
		e.preventDefault()
		setBusy(true)
		setStatus(null)
		try {
			await salvarPerfil({ nome: p.nome, telefone: p.telefone, cargo: p.cargo })
			setStatus({ tipo: 'ok', msg: 'Perfil salvo.' })
		} catch (err) {
			setStatus({ tipo: 'erro', msg: err.message })
		}
		setBusy(false)
	}

	if (!p) return null
	const campo = (k, v) => setP({ ...p, [k]: v })

	return (
		<div className="gallery">
			<header className="topbar">
				<button className="tbtn ghost" onClick={onBack}>
					←
				</button>
				<div className="brand small">
					<img src="/takeat-icon.png" alt="Takeat" />
					<span>
						Takeat <em>Map</em>
					</span>
				</div>
				<div className="grow" />
				<span className="who">meu perfil</span>
			</header>

			<div className="gallery-body">
				<h1>
					Meu <em>perfil</em>
				</h1>
				<p className="sub">Seu nome aparece nos cards que você cria, no cursor ao vivo e nas menções com @.</p>

				<form className="perfil-form" onSubmit={salvar}>
					<label className="cp-label">Nome</label>
					<input value={p.nome || ''} onChange={(e) => campo('nome', e.target.value)} placeholder="como o time te chama" />

					<label className="cp-label">E-mail</label>
					<input value={p.email || ''} disabled title="O e-mail é o seu login e não muda por aqui" />

					<label className="cp-label">Telefone</label>
					<input value={p.telefone || ''} onChange={(e) => campo('telefone', e.target.value)} placeholder="(00) 00000-0000" />

					<label className="cp-label">Cargo / time</label>
					<input value={p.cargo || ''} onChange={(e) => campo('cargo', e.target.value)} placeholder="produto, design, marketing..." />

					<button className="btn-primary" style={{ marginTop: 20, width: 'auto' }} disabled={busy}>
						{busy ? 'Salvando...' : 'Salvar perfil'}
					</button>
					{status && <p className={`status ${status.tipo}`}>{status.msg}</p>}
				</form>
			</div>
		</div>
	)
}
