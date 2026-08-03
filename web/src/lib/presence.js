// Presença ao vivo: quem está no quadro e onde está o cursor de cada um.
//
// Duas coisas diferentes viajam por caminhos diferentes:
//   • quem entrou/saiu e o nome  -> "presence" (guarda estado, é mais lento)
//   • posição do cursor          -> "broadcast" (mensagem solta e rápida)
// Mandar cursor por presence engasga, porque cada movimento reescreve o
// estado da sala inteira. É por isso que Figma e afins usam broadcast.

import { supabase, hasCloud } from './supabase'

const CURSOR_COLORS = ['#ff5a5a', '#fbbf24', '#34d668', '#8b5cf6', '#38bdf8', '#fb7185']

export function colorFor(id = '') {
	let h = 0
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
	return CURSOR_COLORS[h % CURSOR_COLORS.length]
}

export function joinBoard({ boardId, me, onPeers, onRemoteBoard }) {
	if (!hasCloud || !boardId) {
		return { move() {}, leave() {}, publish() {}, hide() {}, active: false }
	}

	const channel = supabase.channel(`board:${boardId}`, {
		config: { presence: { key: me.id }, broadcast: { self: false } },
	})

	// id -> { name, color, x, y, visto }
	const peers = new Map()

	function emit() {
		onPeers &&
			onPeers(
				[...peers.entries()].map(([id, p]) => ({
					id,
					name: p.name || 'Alguém',
					color: colorFor(id),
					x: p.x,
					y: p.y,
				})),
			)
	}

	// quem está na sala
	channel.on('presence', { event: 'sync' }, () => {
		const state = channel.presenceState()
		const vivos = new Set()
		for (const [id, entries] of Object.entries(state)) {
			if (id === me.id) continue
			vivos.add(id)
			const info = entries[entries.length - 1] || {}
			const atual = peers.get(id) || {}
			peers.set(id, { ...atual, name: info.name || atual.name })
		}
		// tira quem saiu
		for (const id of [...peers.keys()]) if (!vivos.has(id)) peers.delete(id)
		emit()
	})

	// cursor das outras pessoas
	channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
		if (!payload || payload.id === me.id) return
		const atual = peers.get(payload.id) || {}
		if (payload.fora) {
			peers.set(payload.id, { ...atual, name: payload.name || atual.name, x: null, y: null })
		} else {
			peers.set(payload.id, { ...atual, name: payload.name || atual.name, x: payload.x, y: payload.y })
		}
		emit()
	})

	// quadro que chega de outra pessoa
	channel.on('broadcast', { event: 'board' }, ({ payload }) => {
		if (!payload || payload.by === me.id) return
		onRemoteBoard && onRemoteBoard(payload.board)
	})

	channel.subscribe(async (status) => {
		if (status === 'SUBSCRIBED') await channel.track({ name: me.name })
	})

	// o cursor viaja no máximo ~20x por segundo: fluido pra quem vê e leve
	// o bastante pro limite de mensagens do plano gratuito
	let pendente = null
	let timer = null
	function flush() {
		timer = null
		if (!pendente) return
		channel.send({ type: 'broadcast', event: 'cursor', payload: { id: me.id, name: me.name, ...pendente } })
		pendente = null
	}

	return {
		active: true,
		move(x, y) {
			pendente = { x, y }
			if (!timer) timer = setTimeout(flush, 50)
		},
		/** Avisa que meu mouse saiu do quadro, pra sumir o cursor dos outros. */
		hide() {
			pendente = null
			channel.send({ type: 'broadcast', event: 'cursor', payload: { id: me.id, name: me.name, fora: true } })
		},
		publish(board) {
			channel.send({ type: 'broadcast', event: 'board', payload: { by: me.id, board } })
		},
		leave() {
			if (timer) clearTimeout(timer)
			supabase.removeChannel(channel)
		},
	}
}
