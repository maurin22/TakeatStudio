import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as chaves o app roda em MODO LOCAL: nada de login nem colaboração,
// tudo guardado só neste navegador. Assim dá pra usar e testar hoje, e
// quando as chaves entrarem no .env o modo nuvem liga sozinho.
export const hasCloud = Boolean(url && key)

export const supabase = hasCloud
	? createClient(url, key, {
			auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
		})
	: null
