// Servidor mínimo do Takeat Map.
//
// Existe por um motivo: a chave da IA não pode ficar no navegador (quem
// abrir o site conseguiria ler e usar). Então o pedido passa por aqui, o
// servidor acrescenta a chave e devolve só a resposta.
//
// A chave é guardada como segredo, nunca no código:
//   npx wrangler secret put ANTHROPIC_API_KEY

const MODELO = 'claude-sonnet-4-5'

function prompt({ tipo, titulo, contexto, pergunta, historico }) {
	const base = `Você é um parceiro de trabalho do time da Takeat (tecnologia para restaurantes: cardápio digital, PDV, delivery, totem, KDS).
Está ajudando a pensar uma ideia dentro de um quadro de mapa mental.

Seja específico e prático. Nada de conselho genérico. Escreva em português do Brasil, direto, sem enrolação e sem clichês de consultoria.
Não use travessões. Use no máximo 200 palavras.`

	if (tipo === 'area') {
		return `${base}

Analise este bloco de ideias chamado "${titulo}":
${contexto}

Responda em três partes curtas:
1. O que esse conjunto está dizendo (leitura do todo, não repetição dos itens)
2. O buraco mais perigoso que ninguém listou
3. O próximo passo concreto que destrava mais coisas

No fim, faça UMA pergunta que force o time a decidir algo.`
	}

	if (pergunta) {
		return `${base}

A ideia em discussão é: "${titulo}"
${contexto ? `Contexto ao redor: ${contexto}` : ''}
${historico ? `\nConversa até agora:\n${historico}` : ''}

Pergunta de agora: ${pergunta}`
	}

	return `${base}

A ideia é: "${titulo}"
${contexto ? `Ao redor dela no quadro: ${contexto}` : ''}

Responda em três partes curtas:
1. Como executar isso na prática (o caminho mais curto que funciona)
2. O risco que costuma derrubar esse tipo de ideia
3. Uma forma de testar barato antes de investir

No fim, faça UMA pergunta que ajude a afinar a ideia.`
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.pathname === '/api/ia' && request.method === 'POST') {
			if (!env.ANTHROPIC_API_KEY) {
				return Response.json(
					{ erro: 'A IA ainda não foi configurada. Rode: npx wrangler secret put ANTHROPIC_API_KEY' },
					{ status: 503 },
				)
			}
			try {
				const corpo = await request.json()
				const r = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'x-api-key': env.ANTHROPIC_API_KEY,
						'anthropic-version': '2023-06-01',
					},
					body: JSON.stringify({
						model: MODELO,
						max_tokens: 700,
						messages: [{ role: 'user', content: prompt(corpo) }],
					}),
				})
				if (!r.ok) {
					const detalhe = await r.text()
					return Response.json({ erro: `A IA respondeu com erro (${r.status})`, detalhe: detalhe.slice(0, 300) }, { status: 502 })
				}
				const dados = await r.json()
				const texto = (dados.content || []).map((p) => p.text || '').join('\n').trim()
				return Response.json({ texto })
			} catch (e) {
				return Response.json({ erro: 'Não consegui falar com a IA agora.', detalhe: String(e).slice(0, 200) }, { status: 500 })
			}
		}

		// qualquer outro endereço: o site em si
		return env.ASSETS.fetch(request)
	},
}
