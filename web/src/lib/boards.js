// Camada de dados dos quadros.
//
// Modo nuvem (com login): tabela "boards" no Supabase, compartilhável.
// Modo local (sem chaves): localStorage, igual ao app de desktop.
// A interface é a mesma nos dois casos, então a tela não sabe a diferença.

import { supabase, hasCloud } from './supabase'

const LOCAL_KEY = 'takeatmap-boards'
const uid = () => crypto.randomUUID().slice(0, 8)

export function emptyBoard(name = 'Meu mapa') {
	return {
		name,
		nodes: [{ id: uid(), x: 0, y: 0, text: 'Tema central', color: 0 }],
		edges: [],
		rects: [],
		strokes: [],
		images: [],
	}
}

function readLocal() {
	try {
		const raw = localStorage.getItem(LOCAL_KEY)
		const list = raw ? JSON.parse(raw) : []
		return Array.isArray(list) ? list : []
	} catch {
		return []
	}
}

function writeLocal(list) {
	localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
}

/** Lista resumida pra galeria (sem o conteúdo pesado do quadro). */
export async function listBoards() {
	if (hasCloud) {
		const { data: userData } = await supabase.auth.getUser()
		const meuId = userData?.user?.id
		const { data, error } = await supabase
			.from('boards')
			.select('id, name, updated_at, data, owner, is_shared')
			.order('updated_at', { ascending: false })
		if (error) throw error
		return (data || []).map((b) => ({
			id: b.id,
			name: b.name,
			updatedAt: new Date(b.updated_at).getTime(),
			nodes: b.data?.nodes || [],
			shared: b.is_shared,
			meu: b.owner === meuId,
		}))
	}
	return readLocal()
		.map((b) => ({ id: b.id, name: b.name, updatedAt: b.updatedAt, nodes: b.nodes || [] }))
		.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function getBoard(id) {
	if (hasCloud) {
		const { data, error } = await supabase.from('boards').select('*').eq('id', id).single()
		if (error) throw error
		return {
			id: data.id,
			name: data.name,
			updatedAt: new Date(data.updated_at).getTime(),
			is_shared: data.is_shared,
			owner: data.owner,
			...data.data,
		}
	}
	return readLocal().find((b) => b.id === id) || null
}

/** Liga/desliga o link compartilhado do quadro. */
export async function setBoardShared(id, shared) {
	if (!hasCloud) return
	const { error } = await supabase.from('boards').update({ is_shared: shared }).eq('id', id)
	if (error) throw error
}

export async function createBoard(name, conteudo) {
	const board = conteudo ? { name, ...conteudo } : emptyBoard(name)

	// cards vindos de modelo também precisam de autoria
	let quem = 'alguém'
	if (hasCloud) {
		const { data } = await supabase.auth.getUser()
		quem = data?.user?.email?.split('@')[0] || quem
	}
	const agora = Date.now()
	board.nodes = (board.nodes || []).map((n) => ({ por: quem, em: agora, ...n }))
	if (hasCloud) {
		const { data: userData } = await supabase.auth.getUser()
		const { data, error } = await supabase
			.from('boards')
			.insert({ name: board.name, data: board, owner: userData?.user?.id })
			.select('id')
			.single()
		if (error) throw error
		return data.id
	}
	const id = uid()
	const list = readLocal()
	list.unshift({ id, updatedAt: Date.now(), ...board })
	writeLocal(list)
	return id
}

export async function saveBoard(id, board) {
	if (hasCloud) {
		const { nodes, edges, rects, strokes, images } = board
		const { error } = await supabase
			.from('boards')
			.update({ name: board.name, data: { nodes, edges, rects, strokes, images }, updated_at: new Date().toISOString() })
			.eq('id', id)
		if (error) throw error
		return
	}
	const list = readLocal()
	const i = list.findIndex((b) => b.id === id)
	const entry = { id, updatedAt: Date.now(), ...board }
	if (i >= 0) list[i] = entry
	else list.unshift(entry)
	writeLocal(list)
}

export async function deleteBoard(id) {
	if (hasCloud) {
		const { error } = await supabase.from('boards').delete().eq('id', id)
		if (error) throw error
		return
	}
	writeLocal(readLocal().filter((b) => b.id !== id))
}

/** Importa um .takeatmap exportado pelo app de desktop. */
export async function importBoard(data) {
	const board = {
		name: data.name || 'Mapa importado',
		nodes: data.nodes || [],
		edges: data.edges || [],
		rects: data.rects || [],
		strokes: data.strokes || [],
		images: [], // imagens do desktop apontam pra arquivos locais
	}
	if (hasCloud) {
		const { data: userData } = await supabase.auth.getUser()
		const { data: row, error } = await supabase
			.from('boards')
			.insert({ name: board.name, data: board, owner: userData?.user?.id })
			.select('id')
			.single()
		if (error) throw error
		return row.id
	}
	const id = uid()
	const list = readLocal()
	list.unshift({ id, updatedAt: Date.now(), ...board })
	writeLocal(list)
	return id
}
