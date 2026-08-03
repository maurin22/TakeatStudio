// Notificações: avisar alguém que virou responsável por uma tarefa.
//
// Ficam numa tabela própria, então a pessoa recebe mesmo se estiver
// offline na hora. Quem está com o app aberto vê chegar na hora, porque
// o Supabase avisa a tabela em tempo real.

import { supabase, hasCloud } from './supabase'

/** Cria um aviso pra alguém (por e-mail ou nome). */
export async function avisar({ para, texto, boardId, boardNome, de }) {
	if (!hasCloud || !para) return
	try {
		await supabase.from('notificacoes').insert({
			para: para.trim().toLowerCase(),
			de: de || null,
			texto,
			board_id: boardId,
			board_nome: boardNome || null,
		})
	} catch {
		// notificação nunca deve atrapalhar o trabalho no quadro
	}
}

export async function listar(email) {
	if (!hasCloud || !email) return []
	const { data, error } = await supabase
		.from('notificacoes')
		.select('*')
		.eq('para', email.toLowerCase())
		.order('created_at', { ascending: false })
		.limit(30)
	return error ? [] : data || []
}

export async function marcarLida(id) {
	if (!hasCloud) return
	await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
}

export async function marcarTodasLidas(email) {
	if (!hasCloud || !email) return
	await supabase.from('notificacoes').update({ lida: true }).eq('para', email.toLowerCase()).eq('lida', false)
}

/** Escuta avisos novos chegando em tempo real. */
export function ouvir(email, aoChegar) {
	if (!hasCloud || !email) return () => {}
	const canal = supabase
		.channel(`avisos:${email.toLowerCase()}`)
		.on(
			'postgres_changes',
			{ event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `para=eq.${email.toLowerCase()}` },
			({ new: nova }) => aoChegar(nova),
		)
		.subscribe()
	return () => supabase.removeChannel(canal)
}
