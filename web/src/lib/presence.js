// Presença ao vivo: cursor das outras pessoas no mesmo quadro.
//
// Usa o canal de tempo real do Supabase, que transmite mensagens efêmeras
// (não guarda nada). Sem chaves, vira um objeto inerte e o app segue normal.

import { supabase, hasCloud } from './supabase'

const CURSOR_COLORS = ['#ff5a5a', '#fbbf24', '#34d668', '#8b5cf6', '#38bdf8', '#fb7185']

export function colorFor(id = '') {
	let h = 0
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
	return CURSOR_COLORS[h % CURSOR_COLORS.length]
}

/**
 * Entra na sala do quadro.
 * onPeers recebe a lista de quem está online (com cursor em coordenadas
 * do quadro, não da tela — assim o cursor aparece no lugar certo mesmo
 * com zoom diferente entre as pessoas).
 */
export function joinBoard({ boardId, me, onPeers }) {
	if (!hasCloud || !boardId) {
		return { move() {}, leave() {}, active: false }
	}

	const channel = supabase.channel(`board:${boardId}`, {
		config: { presence: { key: me.id } },
	})

	const emit = () => {
		const state = channel.presenceState()
		const peers = Object.entries(state)
			.filter(([id]) => id !== me.id)
			.map(([id, entries]) => {
				const p = entries[entries.length - 1] || {}
				return { id, name: p.name || 'Alguém', color: colorFor(id), x: p.x, y: p.y }
			})
		onPeers(peers)
	}

	channel
		.on('presence', { event: 'sync' }, emit)
		.on('presence', { event: 'join' }, emit)
		.on('presence', { event: 'leave' }, emit)
		.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				await channel.track({ name: me.name, x: null, y: null })
			}
		})

	// o cursor viaja no máximo ~20x por segundo: suficiente pra parecer
	// fluido e leve o bastante pro limite do plano gratuito
	let pending = null
	let timer = null
	const flush = () => {
		timer = null
		if (!pending) return
		channel.track({ name: me.name, x: pending.x, y: pending.y })
		pending = null
	}

	return {
		active: true,
		move(x, y) {
			pending = { x, y }
			if (!timer) timer = setTimeout(flush, 50)
		},
		leave() {
			if (timer) clearTimeout(timer)
			supabase.removeChannel(channel)
		},
	}
}
