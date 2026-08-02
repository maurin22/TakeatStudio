import { useEffect, useState } from 'react'
import { supabase, hasCloud } from './lib/supabase'
import Login from './components/Login'
import Gallery from './components/Gallery'
import Editor from './components/Editor'

export default function App() {
	const [session, setSession] = useState(null)
	const [checking, setChecking] = useState(hasCloud)
	const [boardId, setBoardId] = useState(null)

	useEffect(() => {
		if (!hasCloud) return
		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session)
			setChecking(false)
		})
		const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
		return () => sub.subscription.unsubscribe()
	}, [])

	if (checking) {
		return (
			<div className="boot">
				<img src="/takeat-icon.png" alt="" />
				<span>carregando...</span>
			</div>
		)
	}

	// Com Supabase configurado exige login; sem ele, roda em modo local
	if (hasCloud && !session) return <Login />

	const user = session?.user || null

	if (boardId) {
		return <Editor boardId={boardId} user={user} onBack={() => setBoardId(null)} />
	}

	return (
		<Gallery
			user={user}
			onOpen={setBoardId}
			onSignOut={() => hasCloud && supabase.auth.signOut()}
		/>
	)
}
