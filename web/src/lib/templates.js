// Modelos prontos: o time abre e já começa preenchendo, em vez de encarar
// uma tela em branco. Cada área vira um slide no modo apresentação.

const id = () => crypto.randomUUID().slice(0, 8)

function card(x, y, text, color = 1, extra = {}) {
	return { id: id(), x, y, text, color, ...extra }
}

function area(x, y, w, h, label) {
	return { id: id(), x, y, w, h, label }
}

function montar(nodes, rects = [], edges = []) {
	return { nodes, rects, edges, strokes: [], images: [] }
}

export const TEMPLATES = [
	{
		id: 'branco',
		nome: 'Em branco',
		desc: 'Comece do zero, com um card central.',
		build: () => montar([card(0, 0, 'Tema central', 0)]),
	},
	{
		id: 'sprint',
		nome: 'Planejamento de sprint',
		desc: 'A fazer, fazendo e feito, com cards de tarefa prontos.',
		build: () =>
			montar(
				[
					card(-380, 0, 'Primeira tarefa', 1, { kind: 'task', status: 'todo', w: 210 }),
					card(-380, 80, 'Segunda tarefa', 1, { kind: 'task', status: 'todo', w: 210 }),
					card(-40, 0, 'Em andamento', 1, { kind: 'task', status: 'doing', w: 210 }),
					card(300, 0, 'Já entregue', 1, { kind: 'task', status: 'done', w: 210 }),
				],
				[area(-420, -70, 300, 260, 'A fazer'), area(-80, -70, 300, 260, 'Fazendo'), area(260, -70, 300, 260, 'Feito')],
			),
	},
	{
		id: 'jornada',
		nome: 'Jornada do restaurante',
		desc: 'Do primeiro contato ao cliente fiel, etapa por etapa.',
		build: () => {
			const etapas = ['Descobre a Takeat', 'Primeira conversa', 'Implantação', 'Primeira semana', 'Vira fã']
			const nodes = etapas.map((t, i) => card(i * 260 - 520, 0, t, i === 0 ? 0 : 1, { w: 200 }))
			const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }))
			return montar(
				[...nodes, card(-520, 140, 'O que ele sente aqui?', 3, { w: 200 }), card(0, 140, 'Onde a gente pode falhar?', 3, { w: 200 })],
				[area(-570, -70, 1310, 290, 'Jornada')],
				edges,
			)
		},
	},
	{
		id: 'campanha',
		nome: 'Campanha de marketing',
		desc: 'Objetivo, público, peças e canais num quadro só.',
		build: () => {
			const centro = card(0, 0, 'Nome da campanha', 0, { w: 220 })
			const ramos = [
				card(-420, -140, 'Objetivo', 3),
				card(-420, 80, 'Público', 4),
				card(360, -140, 'Peças', 5),
				card(360, 80, 'Canais', 1),
			]
			return montar([centro, ...ramos], [], ramos.map((r) => ({ from: centro.id, to: r.id })))
		},
	},
	{
		id: 'retro',
		nome: 'Retrospectiva',
		desc: 'O que foi bem, o que travou e o que muda agora.',
		build: () =>
			montar(
				[
					card(-360, 0, 'Escreva aqui', 4, { w: 200 }),
					card(0, 0, 'Escreva aqui', 3, { w: 200 }),
					card(340, 0, 'Escreva aqui', 1, { w: 200 }),
				],
				[area(-400, -70, 300, 320, 'Foi bem'), area(-40, -70, 300, 320, 'Travou'), area(300, -70, 300, 320, 'Muda agora')],
			),
	},
	{
		id: 'produto',
		nome: 'Ideia de funcionalidade',
		desc: 'Problema, solução, links de referência e tarefas.',
		build: () => {
			const centro = card(0, 0, 'Nome da funcionalidade', 0, { w: 230 })
			const prob = card(-400, -120, 'Qual problema resolve?', 3, { w: 210 })
			const sol = card(-400, 60, 'Como resolve?', 4, { w: 210 })
			const ref = card(350, -120, 'Cole aqui o link do Figma', 1, { w: 230 })
			const tarefa = card(350, 60, 'Primeira tarefa', 1, { kind: 'task', status: 'todo', w: 210 })
			return montar([centro, prob, sol, ref, tarefa], [], [
				{ from: centro.id, to: prob.id },
				{ from: centro.id, to: sol.id },
				{ from: centro.id, to: ref.id },
				{ from: centro.id, to: tarefa.id },
			])
		},
	},
]
