import { useEffect, useState } from 'react'
import { supabase, hasCloud } from './lib/supabase'
import Login from './components/Login'
import Gallery from './components/Gallery'
import Editor from './components/Editor'
import Admin from './components/Admin'
import Perfil from './components/Perfil'

// Quem pode criar contas. Vem do .env (VITE_ADMIN_EMAILS, separados por
// vírgula); sem isso, qualquer pessoa logada enxerga o painel — o que é
// aceitável num app interno, mas o certo é listar quem administra.
const ADMINS = (import.meta.env.VITE_ADMIN_EMAILS || '')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean)

// Endereço no formato #/mapa/<id>: é o que faz o link compartilhado abrir
// direto no quadro certo.
function boardFromHash() {
	const m = window.location.hash.match(/^#\/mapa\/([\w-]+)/)
	return m ? m[1] : null
}

export default function App() {
	const [session, setSession] = useState(null)
	const [checking, setChecking] = useState(hasCloud)
	const [boardId, setBoardId] = useState(boardFromHash())
	const [admin, setAdmin] = useState(false)
	const [perfil, setPerfil] = useState(false)

	useEffect(() => {
		if (!hasCloud) return
		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session)
			setChecking(false)
		})
		const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
		return () => sub.subscription.unsubscribe()
	}, [])

	// mantém o endereço do navegador em sincronia com o quadro aberto
	useEffect(() => {
		const alvo = boardId ? `#/mapa/${boardId}` : ''
		if (window.location.hash !== alvo) {
			history.replaceState(null, '', alvo || window.location.pathname)
		}
	}, [boardId])

	useEffect(() => {
		const onHash = () => setBoardId(boardFromHash())
		window.addEventListener('hashchange', onHash)
		return () => window.removeEventListener('hashchange', onHash)
	}, [])

	if (checking) {
		return (
			<div className="boot">
				<img src="/takeat-icon.png" alt="" />
				<span>carregando...</span>
			</div>
		)
	}

	if (hasCloud && !session) return <Login />

	const user = session?.user || null
	const ehAdmin = !hasCloud || !ADMINS.length || ADMINS.includes((user?.email || '').toLowerCase())

	if (admin && ehAdmin) return <Admin onBack={() => setAdmin(false)} />
	if (perfil) return <Perfil onBack={() => setPerfil(false)} />

	if (boardId) {
		return <Editor boardId={boardId} user={user} onBack={() => setBoardId(null)} />
	}

	return (
		<Gallery
			user={user}
			ehAdmin={ehAdmin}
			onAdmin={() => setAdmin(true)}
			onPerfil={() => setPerfil(true)}
			onOpen={setBoardId}
			onSignOut={() => hasCloud && supabase.auth.signOut()}
		/>
	)
}
