import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Cliente separado, sem guardar sessão: criar uma conta aqui não pode
// derrubar o login de quem está administrando.
const criador = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
})

function senhaFacil() {
	const palavras = ['takeat', 'mapa', 'quadro', 'ideia', 'time', 'zoom']
	const p = palavras[Math.floor(Math.random() * palavras.length)]
	return `${p}${Math.floor(1000 + Math.random() * 9000)}`
}

export default function Admin({ onBack }) {
	const [email, setEmail] = useState('')
	const [senha, setSenha] = useState(senhaFacil())
	const [busy, setBusy] = useState(false)
	const [criadas, setCriadas] = useState([])
	const [status, setStatus] = useState(null)

	async function criar(e) {
		e.preventDefault()
		if (!email.trim() || senha.length < 6) return
		setBusy(true)
		setStatus(null)

		const { data, error } = await criador.auth.signUp({ email: email.trim(), password: senha })
		setBusy(false)

		if (error) {
			const msg = /rate limit/i.test(error.message)
				? 'Limite de e-mails atingido. Desligue "Confirm email" em Authentication → Providers → Email.'
				: /already/i.test(error.message)
					? 'Essa conta já existe.'
					: error.message
			setStatus({ type: 'erro', msg })
			return
		}

		const pendente = !data.session && !data.user?.confirmed_at
		setCriadas((l) => [{ email: email.trim(), senha, pendente }, ...l])
		setStatus({
			type: pendente ? 'erro' : 'ok',
			msg: pendente
				? 'Conta criada, mas está esperando confirmação por e-mail. Desligue "Confirm email" no Supabase pra liberar o acesso direto.'
				: 'Conta criada e pronta pra usar.',
		})
		setEmail('')
		setSenha(senhaFacil())
	}

	function copiar(c) {
		navigator.clipboard?.writeText(`Takeat Map\n${window.location.origin}\nusuário: ${c.email}\nsenha: ${c.senha}`)
	}

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
				<span className="who">painel de contas</span>
			</header>

			<div className="gallery-body">
				<h1>
					Criar <em>contas</em>
				</h1>
				<p className="sub">
					Cadastre as pessoas do time e passe o usuário e a senha pra elas. Serve qualquer e-mail, inclusive Gmail.
				</p>

				<form className="admin-form" onSubmit={criar}>
					<input
						type="email"
						placeholder="pessoa@gmail.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={busy}
					/>
					<input
						type="text"
						placeholder="senha"
						value={senha}
						onChange={(e) => setSenha(e.target.value)}
						disabled={busy}
					/>
					<button type="button" className="tbtn" onClick={() => setSenha(senhaFacil())} disabled={busy}>
						sortear senha
					</button>
					<button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={busy || !email.trim() || senha.length < 6}>
						{busy ? 'Criando...' : 'Criar conta'}
					</button>
				</form>

				{status && <p className={`status ${status.type}`}>{status.msg}</p>}

				{criadas.length > 0 && (
					<>
						<h2 className="admin-h2">Contas criadas agora</h2>
						<div className="admin-list">
							{criadas.map((c, i) => (
								<div key={i} className="admin-item">
									<div>
										<strong>{c.email}</strong>
										<span>senha: {c.senha}</span>
										{c.pendente && <em className="pend">aguardando confirmação por e-mail</em>}
									</div>
									<button className="tbtn" onClick={() => copiar(c)}>
										copiar
									</button>
								</div>
							))}
						</div>
						<p className="sub" style={{ marginTop: 18 }}>
							Anote agora: por segurança, as senhas não ficam guardadas e somem quando você sair desta tela.
						</p>
					</>
				)}
			</div>
		</div>
	)
}
