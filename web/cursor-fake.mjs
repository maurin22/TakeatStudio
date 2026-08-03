// Simula a "time2" dentro do quadro, mexendo o cursor, pra verificar se
// a outra sessão (aberta no navegador como time1) mostra o cursor dela.
import { createClient } from '@supabase/supabase-js'

const U = 'https://ggrcosglwvcfrtxrgveo.supabase.co'
const K = 'sb_publishable_59PtG_s5uPEh5LGjWCwNyg_hEObG8C-'
const BOARD = process.argv[2]

const sb = createClient(U, K, { auth: { persistSession: false } })
const { data, error } = await sb.auth.signInWithPassword({ email: 'time2@takeat.app', password: 'takeat2026' })
if (error) {
	console.log('erro no login:', error.message)
	process.exit(1)
}
const me = { id: data.user.id, name: 'time2' }
console.log('logado como time2:', me.id.slice(0, 8))

const ch = sb.channel(`board:${BOARD}`, { config: { presence: { key: me.id }, broadcast: { self: false } } })

await new Promise((resolve) => {
	ch.subscribe(async (status) => {
		if (status === 'SUBSCRIBED') {
			await ch.track({ name: me.name })
			console.log('entrou na sala do quadro')
			resolve()
		}
	})
})

// passeia o cursor por uns segundos
let t = 0
const timer = setInterval(() => {
	t += 1
	const x = -200 + t * 14
	const y = 40 + Math.sin(t / 4) * 90
	ch.send({ type: 'broadcast', event: 'cursor', payload: { id: me.id, name: me.name, x, y } })
}, 100)

setTimeout(() => {
	clearInterval(timer)
	console.log('terminou de mexer o cursor')
	process.exit(0)
}, 40000)
