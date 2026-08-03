// Perfis: nome, e-mail, telefone e cargo de cada conta.
// Alimentam as menções com @ e a escolha de responsável nas tarefas.

import { supabase, hasCloud } from './supabase'

let cache = null

export async function listarPerfis() {
	if (!hasCloud) return []
	if (cache) return cache
	const { data, error } = await supabase.from('perfis').select('id, nome, email, telefone, cargo').order('nome')
	if (error) return []
	cache = data || []
	return cache
}

export async function meuPerfil() {
	if (!hasCloud) return null
	const { data: u } = await supabase.auth.getUser()
	if (!u?.user) return null
	const { data } = await supabase.from('perfis').select('*').eq('id', u.user.id).maybeSingle()
	return data || { id: u.user.id, email: u.user.email, nome: u.user.email?.split('@')[0] }
}

export async function salvarPerfil(campos) {
	if (!hasCloud) return
	const { data: u } = await supabase.auth.getUser()
	if (!u?.user) return
	const { error } = await supabase
		.from('perfis')
		.upsert({ id: u.user.id, email: u.user.email, ...campos, atualizado_em: new Date().toISOString() })
	cache = null
	if (error) throw error
}
