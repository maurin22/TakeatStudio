(() => {
	if (window.__livezoomLoaded) return
	window.__livezoomLoaded = true

	// Fatores de suavização por frame (~60fps)
	const EASE_SCALE = 0.1   // entrada/saída do zoom
	const EASE_FOLLOW = 0.08 // câmera perseguindo o mouse
	const EASE_MOUSE = 0.25  // leitura do mouse
	const EASE_FAKE = 0.22   // cursor sintético

	const state = {
		zoomed: false,
		targetScale: 1.5,
		s: 1,                        // escala atual
		f: null,                     // ponto focal em coordenadas do documento
		prevT: { x: 0, y: 0 },
		prevS: 1,
		mouse: { x: innerWidth / 2, y: innerHeight / 2 },
		smooth: { x: innerWidth / 2, y: innerHeight / 2 },
		fake: { x: innerWidth / 2, y: innerHeight / 2 },
		fakeCursor: false,
		running: false,
	}

	addEventListener('mousemove', (e) => {
		state.mouse.x = e.clientX
		state.mouse.y = e.clientY
	}, { passive: true })

	// ---- cursor sintético -------------------------------------------------

	let fakeEl = null
	let cursorStyle = null

	function setFakeCursor(on) {
		state.fakeCursor = on
		if (on) {
			if (!cursorStyle) {
				cursorStyle = document.createElement('style')
				cursorStyle.textContent = '* { cursor: none !important; }'
			}
			document.documentElement.appendChild(cursorStyle)
			if (!fakeEl) {
				fakeEl = document.createElement('div')
				fakeEl.style.cssText = [
					'position: fixed', 'top: 0', 'left: 0',
					'width: 16px', 'height: 16px',
					'margin: -8px 0 0 -8px',
					'border-radius: 50%',
					'background: #e11d2e',
					'border: 2.5px solid rgba(255,255,255,0.95)',
					'box-shadow: 0 1px 6px rgba(0,0,0,0.35)',
					'pointer-events: none',
					'z-index: 2147483647',
				].join(';')
			}
			state.fake.x = state.mouse.x
			state.fake.y = state.mouse.y
			document.documentElement.appendChild(fakeEl)
		} else {
			if (cursorStyle) cursorStyle.remove()
			if (fakeEl) fakeEl.remove()
		}
		ensureLoop()
	}

	// ---- toast discreto ---------------------------------------------------

	let toastEl = null
	let toastTimer = null

	function toast(text) {
		if (!toastEl) {
			toastEl = document.createElement('div')
			toastEl.style.cssText = [
				'position: fixed', 'left: 50%', 'bottom: 22px',
				'transform: translateX(-50%)',
				'background: rgba(12,12,14,0.85)', 'color: #fff',
				'font: 12.5px/1 system-ui, sans-serif',
				'padding: 7px 14px', 'border-radius: 8px',
				'pointer-events: none', 'z-index: 2147483647',
				'transition: opacity 0.3s ease', 'opacity: 0',
			].join(';')
			document.documentElement.appendChild(toastEl)
		}
		toastEl.textContent = text
		toastEl.style.opacity = '1'
		clearTimeout(toastTimer)
		toastTimer = setTimeout(() => { toastEl.style.opacity = '0' }, 1200)
	}

	// ---- câmera -----------------------------------------------------------

	const clamp = (v, a, b) => (a > b ? v : Math.min(b, Math.max(a, v)))

	function startZoom(scale) {
		state.targetScale = scale
		if (!state.zoomed) {
			state.zoomed = true
			// Sem transform ativo, o ponto do documento sob o mouse é direto
			if (state.s <= 1.001) {
				state.smooth.x = state.mouse.x
				state.smooth.y = state.mouse.y
				state.f = { x: state.mouse.x + scrollX, y: state.mouse.y + scrollY }
				state.prevT = { x: 0, y: 0 }
				state.prevS = 1
			}
		}
		document.body.style.transformOrigin = '0 0'
		ensureLoop()
	}

	function tick() {
		const active = state.zoomed || state.s > 1.003 || state.fakeCursor
		if (!active) {
			state.running = false
			document.body.style.transform = ''
			return
		}

		state.smooth.x += (state.mouse.x - state.smooth.x) * EASE_MOUSE
		state.smooth.y += (state.mouse.y - state.smooth.y) * EASE_MOUSE

		const vw = innerWidth
		const vh = innerHeight
		const targetS = state.zoomed ? state.targetScale : 1
		state.s += (targetS - state.s) * EASE_SCALE

		if (state.f) {
			// Alvo do foco: zoomado segue o mouse; soltando, volta ao enquadramento natural
			let fdx
			let fdy
			if (state.zoomed) {
				fdx = (state.smooth.x + scrollX - state.prevT.x) / state.prevS
				fdy = (state.smooth.y + scrollY - state.prevT.y) / state.prevS
			} else {
				fdx = scrollX + vw / 2
				fdy = scrollY + vh / 2
			}
			state.f.x += (fdx - state.f.x) * EASE_FOLLOW
			state.f.y += (fdy - state.f.y) * EASE_FOLLOW

			const s = state.s
			const de = document.documentElement
			const docW = Math.max(de.scrollWidth, document.body.scrollWidth || 0)
			const docH = Math.max(de.scrollHeight, document.body.scrollHeight || 0)
			let tx = scrollX + vw / 2 - state.f.x * s
			let ty = scrollY + vh / 2 - state.f.y * s
			tx = clamp(tx, scrollX + vw - docW * s, scrollX)
			ty = clamp(ty, scrollY + vh - docH * s, scrollY)
			state.prevT = { x: tx, y: ty }
			state.prevS = s

			if (!state.zoomed && Math.abs(s - 1) < 0.003) {
				state.s = 1
				state.f = null
				document.body.style.transform = ''
			} else {
				document.body.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`
			}
		}

		if (state.fakeCursor && fakeEl) {
			state.fake.x += (state.mouse.x - state.fake.x) * EASE_FAKE
			state.fake.y += (state.mouse.y - state.fake.y) * EASE_FAKE
			fakeEl.style.transform = `translate3d(${state.fake.x}px, ${state.fake.y}px, 0)`
		}

		requestAnimationFrame(tick)
	}

	function ensureLoop() {
		if (!state.running) {
			state.running = true
			requestAnimationFrame(tick)
		}
	}

	// ---- comandos ---------------------------------------------------------

	function handle(command) {
		if (command === 'toggle-zoom') {
			if (state.zoomed) {
				state.zoomed = false
				toast('Zoom solto')
			} else {
				startZoom(state.targetScale || 1.5)
				toast(`Zoom ${state.targetScale}x`)
			}
		} else if (command === 'release-zoom') {
			state.zoomed = false
			toast('Zoom solto')
		} else if (command === 'toggle-cursor') {
			setFakeCursor(!state.fakeCursor)
			toast(state.fakeCursor ? 'Cursor suave ligado' : 'Cursor suave desligado')
		} else if (command.startsWith('level-')) {
			const scale = { 'level-1': 1.3, 'level-2': 1.5, 'level-3': 2 }[command]
			startZoom(scale)
			toast(`Zoom ${scale}x`)
		}
		ensureLoop()
	}

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg && msg.command) handle(msg.command)
	})

	// Fallback e níveis: Alt+1/2/3 direto na página
	addEventListener('keydown', (e) => {
		if (!e.altKey || e.ctrlKey || e.metaKey) return
		const map = { Digit1: 'level-1', Digit2: 'level-2', Digit3: 'level-3' }
		if (map[e.code]) {
			e.preventDefault()
			handle(map[e.code])
		}
	})
})()
