import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
	const [email, setEmail] = useState('')
	const [status, setStatus] = useState(null)
	const [busy, setBusy] = useState(false)

	async function withGoogle() {
		setBusy(true)
		setStatus(null)
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: window.location.origin },
		})
		if (error) {
			setStatus({ type: 'erro', msg: error.message })
			setBusy(false)
		}
	}

	async function withEmail(e) {
		e.preventDefault()
		if (!email.trim()) return
		setBusy(true)
		setStatus(null)
		const { error } = await supabase.auth.signInWithOtp({
			email: email.trim(),
			options: { emailRedirectTo: window.location.origin },
		})
		setBusy(false)
		setStatus(
			error
				? { type: 'erro', msg: error.message }
				: { type: 'ok', msg: 'Link enviado! Confere seu e-mail e clica pra entrar.' },
		)
	}

	return (
		<div className="login">
			<div className="login-card">
				<div className="brand">
					<img src="/takeat-icon.png" alt="Takeat" />
					<span>
						Takeat <em>Map</em>
					</span>
				</div>
				<p className="lead">Quadros de ideias do time, colaborativos e sempre à mão.</p>

				<button className="btn-google" onClick={withGoogle} disabled={busy}>
					<svg viewBox="0 0 24 24" width="17" height="17">
						<path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
						<path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z" />
						<path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z" />
						<path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z" />
					</svg>
					Entrar com Google
				</button>

				<div className="or">
					<span>ou</span>
				</div>

				<form onSubmit={withEmail}>
					<input
						type="email"
						placeholder="seu@takeat.app"
						value={email}
						onChange={(ev) => setEmail(ev.target.value)}
						disabled={busy}
					/>
					<button type="submit" className="btn-primary" disabled={busy || !email.trim()}>
						{busy ? 'Enviando...' : 'Receber link por e-mail'}
					</button>
				</form>

				{status && <p className={`status ${status.type}`}>{status.msg}</p>}
			</div>
		</div>
	)
}
