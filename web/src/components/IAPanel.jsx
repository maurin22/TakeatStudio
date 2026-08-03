import { useEffect, useRef, useState } from 'react'

/**
 * Painel da IA: analisa um card ou uma área e permite continuar a
 * conversa. A chave nunca passa pelo navegador — quem fala com a IA é o
 * servidor do próprio site (/api/ia).
 */
export default function IAPanel({ pedido, onClose, onVirarCards }) {
	const [conversa, setConversa] = useState([])
	const [pergunta, setPergunta] = useState('')
	const [carregando, setCarregando] = useState(false)
	const [erro, setErro] = useState(null)
	const fimRef = useRef(null)

	const titulo = pedido?.tipo === 'area' ? pedido.alvo?.label || 'Área' : pedido?.alvo?.text || 'Card'

	function contextoDoPedido() {
		if (pedido?.tipo === 'area') {
			return (pedido.cards || []).map((c) => `- ${c.text}${c.kind === 'task' ? ` (tarefa: ${c.status || 'todo'})` : ''}`).join('\n') || 'a área está vazia'
		}
		return pedido?.alvo?.nota || ''
	}

	async function chamar(perguntaTexto) {
		setCarregando(true)
		setErro(null)
		try {
			const r = await fetch('/api/ia', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					tipo: pedido.tipo,
					titulo,
					contexto: contextoDoPedido(),
					pergunta: perguntaTexto || null,
					historico: conversa.map((m) => `${m.de === 'eu' ? 'Pessoa' : 'IA'}: ${m.texto}`).join('\n'),
				}),
			})
			const dados = await r.json()
			if (!r.ok) throw new Error(dados.erro || 'falhou')
			setConversa((c) => [...c, { de: 'ia', texto: dados.texto }])
		} catch (e) {
			setErro(e.message)
		}
		setCarregando(false)
	}

	// primeira análise assim que abre
	useEffect(() => {
		if (!pedido) return
		setConversa([])
		setErro(null)
		chamar(null)
	}, [pedido?.alvo?.id])

	useEffect(() => {
		fimRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [conversa, carregando])

	if (!pedido) return null

	// pega os tópicos da última resposta pra virarem cards no quadro
	const ultima = [...conversa].reverse().find((m) => m.de === 'ia')
	const topicos = (ultima?.texto || '')
		.split('\n')
		.filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))
		.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
		.filter((l) => l.length > 3)

	function enviar(e) {
		e.preventDefault()
		const t = pergunta.trim()
		if (!t || carregando) return
		setConversa((c) => [...c, { de: 'eu', texto: t }])
		setPergunta('')
		chamar(t)
	}

	return (
		<aside className="iapanel">
			<header>
				<strong>✦ IA analisando</strong>
				<button onClick={onClose} title="Fechar">
					✕
				</button>
			</header>
			<p className="ia-alvo">{titulo}</p>

			<div className="ia-conversa">
				{conversa.map((m, i) => (
					<div key={i} className={`ia-msg ${m.de}`}>
						{m.texto}
					</div>
				))}
				{carregando && <div className="ia-msg ia pensando">pensando...</div>}
				{erro && (
					<div className="ia-erro">
						{erro}
						{!/wrangler/.test(erro) && (
							<>
								<br />
								<small>Se a IA ainda não foi configurada, rode: npx wrangler secret put ANTHROPIC_API_KEY</small>
							</>
						)}
					</div>
				)}
				<div ref={fimRef} />
			</div>

			{topicos.length > 1 && !carregando && (
				<button
					className="ia-virar"
					onClick={() => {
						onVirarCards?.(topicos.slice(0, 8))
						onClose()
					}}
				>
					＋ Jogar {Math.min(topicos.length, 8)} passos no quadro
				</button>
			)}

			<form className="ia-form" onSubmit={enviar}>
				<input
					value={pergunta}
					placeholder="pergunte algo sobre essa ideia..."
					onChange={(e) => setPergunta(e.target.value)}
					disabled={carregando}
				/>
				<button type="submit" disabled={carregando || !pergunta.trim()}>
					↑
				</button>
			</form>
		</aside>
	)
}
