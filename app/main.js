const { app, BrowserWindow, session, desktopCapturer, globalShortcut, screen, ipcMain, powerSaveBlocker, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')

// As APIs nativas do Windows (koffi/user32/dwmapi) só carregam no Windows.
// No macOS o app roda com fallbacks: sem ocultação do cursor do sistema e
// mapeamento de janela capturada aproximado pela tela.
// HAS_NATIVE: o koffi depende do runtime do Visual C++ (msvcp140.dll etc.),
// que o app leva junto. Se ainda assim falhar em alguma máquina, o app abre
// normalmente e só perde ocultar cursor / mirar dentro de janela — nunca
// deve morrer na inicialização por causa disso.
const IS_WIN = process.platform === 'win32'
let HAS_NATIVE = false
let DwmGetWindowAttribute = null
let GetWindowRect = null
let LoadCursorFromFileW = null
let SetSystemCursor = null
let SystemParametersInfoW = null
let nativeLoadError = null
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
if (IS_WIN) {
	try {
		const koffi = require('koffi')
		koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
		const dwmapi = koffi.load('dwmapi.dll')
		const user32 = koffi.load('user32.dll')
		DwmGetWindowAttribute = dwmapi.func('int __stdcall DwmGetWindowAttribute(int64 hwnd, uint attr, _Out_ RECT *rect, uint size)')
		GetWindowRect = user32.func('bool __stdcall GetWindowRect(int64 hwnd, _Out_ RECT *rect)')
		LoadCursorFromFileW = user32.func('int64 __stdcall LoadCursorFromFileW(str16 path)')
		SetSystemCursor = user32.func('bool __stdcall SetSystemCursor(int64 hcur, uint id)')
		SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint uiAction, uint uiParam, void *pvParam, uint fWinIni)')
		HAS_NATIVE = true
	} catch (err) {
		nativeLoadError = err
		console.error('[TakeatCam] recursos nativos indisponíveis:', err && err.message)
	}
}

// Conversão DIP -> pixels físicos: API exclusiva do Windows; no macOS
// as coordenadas já são equivalentes
const toPhysPoint = (p) => (IS_WIN ? screen.dipToScreenPoint(p) : p)
const toPhysRect = (b) => (IS_WIN ? screen.dipToScreenRect(null, b) : b)

// A janela do LiveZoom fica coberta durante a transmissão; sem isso o Chromium
// derruba a renderização de janelas ocultas e a animação trava
if (IS_WIN) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
// Força o backend WGC pra TODA captura (tela e janela), igual ao Recordly:
// no WGC é o Windows quem desenha o cursor no vídeo, então o cursor
// invisível do sistema some da transmissão. No backend antigo o Chromium
// desenha uma seta própria e o cursor "duplica".
if (IS_WIN) app.commandLine.appendSwitch('enable-features', 'AllowWgcScreenCapturer,AllowWgcWindowCapturer')

// Instância única: se o Takeat Rec (ou o usuário) abrir o app de novo,
// a instância existente só traz o launcher de volta à frente
if (!app.requestSingleInstanceLock()) {
	app.quit()
} else {
	app.on('second-instance', () => {
		createLauncher()
	})
}

function windowPhysRect(hwnd) {
	if (!HAS_NATIVE) return null
	const rect = {}
	if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) === 0) return rect
	if (GetWindowRect(hwnd, rect)) return rect
	return null
}

// Oculta o cursor real do sistema inteiro: substitui os cursores do Windows
// por um cursor invisível (SetSystemCursor). ShowCursor não serve porque o
// contador vale só pro processo que chama, não pro sistema todo.
// O cursor invisível é um .cur de 32bpp com alpha 1/255 em todos os pixels:
// alpha zerado ou bitmap sem alpha faz o Windows cair na máscara AND (vira
// quadrado preto) ou o compositor do Chromium desenhar seta na transmissão.
const fs = require('fs')
const SPI_SETCURSORS = 0x0057
// Todos os tipos de cursor do sistema (seta, ibeam, mãozinha, resize...)
const OCR_IDS = [32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650]

let cursorHiddenByUs = false
let invisibleCur = null

// Log de diagnóstico do cursor em %APPDATA%/takeatcam/takeatcam.log
function tlog(...args) {
	try {
		fs.appendFileSync(path.join(app.getPath('userData'), 'takeatcam.log'), `[${new Date().toISOString()}] ${args.join(' ')}\n`)
	} catch {}
}

function invisibleCurPath() {
	if (invisibleCur) return invisibleCur
	const p = path.join(app.getPath('userData'), 'invisible.cur')
	const w = 32
	const h = 32
	const xor = Buffer.alloc(w * h * 4)
	for (let i = 0; i < w * h; i++) xor[i * 4 + 3] = 1 // BGRA com alpha 1
	const and = Buffer.alloc((w / 8) * h, 0x00)
	const bih = Buffer.alloc(40)
	bih.writeUInt32LE(40, 0)
	bih.writeInt32LE(w, 4)
	bih.writeInt32LE(h * 2, 8) // altura dobrada: XOR + AND
	bih.writeUInt16LE(1, 12)
	bih.writeUInt16LE(32, 14)
	const header = Buffer.alloc(22)
	header.writeUInt16LE(2, 2)  // tipo 2 = cursor
	header.writeUInt16LE(1, 4)  // 1 imagem
	header[6] = w
	header[7] = h
	header.writeUInt16LE(0, 10) // hotspot x
	header.writeUInt16LE(0, 12) // hotspot y
	header.writeUInt32LE(40 + xor.length + and.length, 14)
	header.writeUInt32LE(22, 18)
	fs.writeFileSync(p, Buffer.concat([header, bih, xor, and]))
	invisibleCur = p
	return p
}

function setSystemCursorVisible(visible) {
	if (!HAS_NATIVE) return true // macOS ou sem runtime nativo: sem ocultação
	if (visible) {
		if (cursorHiddenByUs) {
			const ok = SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0) // recarrega os cursores do usuário
			cursorHiddenByUs = false
			tlog('RESTORE cursores:', ok)
		}
		return true
	}
	if (cursorHiddenByUs) return true
	const curFile = invisibleCurPath()
	let okCount = 0
	let loadFails = 0
	let setFails = 0
	for (const id of OCR_IDS) {
		const cur = LoadCursorFromFileW(curFile) // SetSystemCursor consome o handle
		if (!cur) {
			loadFails++
			continue
		}
		if (SetSystemCursor(cur, id)) okCount++
		else setFails++
	}
	cursorHiddenByUs = true
	tlog(`HIDE cursores: ok=${okCount} loadFail=${loadFails} setFail=${setFails} de ${OCR_IDS.length}`)
	return true
}

// Rede de segurança: se o processo morrer com o cursor escondido, restaura
process.on('exit', () => {
	if (HAS_NATIVE && cursorHiddenByUs) SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0)
})

let win
let overlayWin
let cursorWin
let launcherWin
let mapWin
let cursorTick = 0
let cursorHideRequested = false // estilo Recordly ativo e menu fechado
let cursorReplicaStyle = null
let lastCursorToggle = 0
let lastHideApply = 0
let lastInsideLogged = null
let selectedId = null
let activeSource = null // { kind: 'screen', displayId } | { kind: 'window', hwnd }

function createWindow() {
	win = new BrowserWindow({
		width: 1280,
		height: 720,
		backgroundColor: '#000000',
		title: 'Takeat Cam',
		icon: path.join(__dirname, 'assets', 'takeat-icon.png'),
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			backgroundThrottling: false,
		},
	})
	win.setMenuBarVisibility(false)
	win.loadFile('index.html')
	win.on('closed', () => {
		if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close()
		if (cursorWin && !cursorWin.isDestroyed()) cursorWin.close()
	})
}

// Réplica local do cursor: com o cursor real do sistema oculto (pra sumir da
// transmissão), esta janela fantasma segue o mouse e desenha o cursor
// escolhido SÓ na tela do apresentador (content protection = fora da captura)
function createCursorWin() {
	cursorWin = new BrowserWindow({
		width: 72,
		height: 72,
		frame: false,
		transparent: true,
		resizable: false,
		focusable: false,
		skipTaskbar: true,
		hasShadow: false,
		alwaysOnTop: true,
		show: false,
		title: 'TakeatCam Cursor',
		webPreferences: {
			preload: path.join(__dirname, 'cursor-preload.js'),
		},
	})
	cursorWin.setAlwaysOnTop(true, 'screen-saver')
	cursorWin.setIgnoreMouseEvents(true)
	cursorWin.setContentProtection(true)
	cursorWin.loadFile('cursor.html')
}

// Proteção de conteúdo da réplica só é necessária ao capturar TELA (senão a
// réplica apareceria na transmissão). Capturando janela, a captura nunca
// inclui outras janelas, então a réplica fica visível em prints/snipping.
function syncCursorWinProtection() {
	if (!cursorWin || cursorWin.isDestroyed()) return
	const isScreen = !activeSource || activeSource.kind === 'screen'
	cursorWin.setContentProtection(isScreen)
}

// Aplica/remove o estado "cursor real invisível + réplica local visível"
function applyCursorHidden(hidden) {
	tlog('applyCursorHidden:', hidden, 'style:', cursorReplicaStyle ? cursorReplicaStyle.img : 'nenhum')
	setSystemCursorVisible(!hidden)
	if (hidden) lastHideApply = Date.now()
	if (!cursorWin || cursorWin.isDestroyed()) return
	if (hidden && cursorReplicaStyle) {
		const dip = screen.getCursorScreenPoint()
		cursorWin.setPosition(dip.x - 8, dip.y - 8)
		cursorWin.showInactive()
	} else {
		cursorWin.hide()
	}
}

// Launcher: escolha entre TakeatCam (ao vivo) e Takeat Rec (gravação)
function createLauncher() {
	if (launcherWin && !launcherWin.isDestroyed()) {
		launcherWin.show()
		launcherWin.focus()
		return
	}
	launcherWin = new BrowserWindow({
		width: 860,
		height: 440,
		resizable: false,
		backgroundColor: '#0d0d0f',
		title: 'Takeat Studio',
		icon: path.join(__dirname, 'assets', 'takeat-icon.png'),
		webPreferences: {
			preload: path.join(__dirname, 'launcher-preload.js'),
		},
	})
	launcherWin.setMenuBarVisibility(false)
	launcherWin.loadFile('launcher.html')
	launcherWin.on('closed', () => {
		launcherWin = null
	})
}

// Takeat Map: quadro de mapas mentais (canvas infinito estilo Miro)
function createMapWindow() {
	if (mapWin && !mapWin.isDestroyed()) {
		mapWin.show()
		mapWin.focus()
		return
	}
	mapWin = new BrowserWindow({
		width: 1280,
		height: 800,
		backgroundColor: '#0d0d0f',
		title: 'Takeat Map',
		icon: path.join(__dirname, 'assets', 'takeat-icon.png'),
		webPreferences: {
			preload: path.join(__dirname, 'map-preload.js'),
		},
	})
	mapWin.setMenuBarVisibility(false)
	mapWin.loadFile('map.html')
	mapWin.on('closed', () => {
		mapWin = null
	})
}

// Indicador de zoom no canto da tela do apresentador. Invisível pra
// qualquer captura (setContentProtection) e o mouse atravessa a janela.
function createOverlay() {
	overlayWin = new BrowserWindow({
		width: 120,
		height: 64,
		frame: false,
		transparent: true,
		resizable: false,
		focusable: false,
		skipTaskbar: true,
		hasShadow: false,
		alwaysOnTop: true,
		title: 'TakeatCam HUD',
		webPreferences: {
			preload: path.join(__dirname, 'overlay-preload.js'),
		},
	})
	overlayWin.setAlwaysOnTop(true, 'screen-saver')
	overlayWin.setIgnoreMouseEvents(true)
	overlayWin.setContentProtection(true)
	overlayWin.loadFile('overlay.html')
	overlayWin.webContents.on('did-finish-load', () => positionOverlay())
	positionOverlay()
}

function overlayDisplay() {
	let display = screen.getPrimaryDisplay()
	if (activeSource && activeSource.kind === 'screen') {
		display = screen.getAllDisplays().find((d) => String(d.id) === activeSource.displayId) || display
	}
	return display
}

function positionOverlay() {
	if (!overlayWin || overlayWin.isDestroyed()) return
	const display = overlayDisplay()
	const wa = display.workArea
	const x = wa.x + wa.width - 120 - 4
	const y = wa.y + 4
	overlayWin.setBounds({ x, y, width: 120, height: 64 })
}

// Retângulo físico (px reais) da fonte ativa, para mapear o mouse
function sourcePhysRect() {
	if (activeSource && activeSource.kind === 'window') {
		const r = windowPhysRect(activeSource.hwnd)
		if (r) return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top }
		// Sem API de retângulo de janela (macOS, ou Windows sem o runtime
		// nativo): aproxima pela tela onde o mouse está, que funciona bem
		// com a janela capturada maximizada
		const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
		return toPhysRect(d.bounds)
	}
	let display = screen.getPrimaryDisplay()
	if (activeSource && activeSource.kind === 'screen') {
		display = screen.getAllDisplays().find((d) => String(d.id) === activeSource.displayId) || display
	}
	return toPhysRect(display.bounds)
}

app.whenReady().then(() => {
	session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
		desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
			let source = sources.find((s) => s.id === selectedId)
			if (!source) {
				const primary = screen.getPrimaryDisplay()
				source = sources.find((s) => s.display_id === String(primary.id)) || sources[0]
			}
			if (source.id.startsWith('screen')) {
				activeSource = { kind: 'screen', displayId: source.display_id }
			} else {
				activeSource = { kind: 'window', hwnd: parseInt(source.id.split(':')[1], 10) }
			}
			positionOverlay()
			syncCursorWinProtection()
			tlog('fonte selecionada:', source.id, source.name)
			callback({ video: source })
		})
	})

	powerSaveBlocker.start('prevent-app-suspension')

	// O launcher abre em qualquer modo; no app instalado ele esconde o
	// Takeat Rec (que só existe no ambiente de desenvolvimento)
	createLauncher()

	// Roda um comando PowerShell oculto; cb recebe o stdout
	function psRun(cmd, cb) {
		const p = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', cmd], {
			windowsHide: true,
		})
		let out = ''
		p.stdout.on('data', (d) => { out += d })
		p.on('close', () => cb && cb(out.trim()))
		p.on('error', () => cb && cb(''))
	}

	// Encontra uma janela REAL (com MainWindowHandle) do Takeat Rec e a traz
	// pra frente. "found" = trouxe à frente; "none" = só existem processos
	// fantasmas sem janela (ou nenhum processo).
	const REC_FOCUS_CMD = `
$sig = @"
using System;
using System.Runtime.InteropServices;
public class TakeatRecWin {
	[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
	[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue | Out-Null
$procs = Get-Process electron, TakeatRec -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*takeatrec*' -and $_.MainWindowHandle -ne 0 }
if ($procs) {
	foreach ($p in $procs) {
		[TakeatRecWin]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null
		[TakeatRecWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
	}
	Write-Output "found"
} else {
	Write-Output "none"
}
`.trim()

	function sendRecState(state) {
		if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send('rec-state', state)
	}

	let recLaunching = false

	function spawnRec() {
		// Mata fantasmas de instâncias anteriores (processos sem janela,
		// ou o processo inteiro se estiver travado) antes de subir uma nova
		const ghostKill =
			`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*takeatrec*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
		psRun(ghostKill, () => {
			if (app.isPackaged) {
				// Instalado: o Rec vem embutido em resources/takeatrec
				const recExe = path.join(process.resourcesPath, 'takeatrec', 'TakeatRec.exe')
				spawn(recExe, [], { detached: true, stdio: 'ignore' }).unref()
				return
			}
			// Dev: sobe o projeto ../takeatrec pelo vite, sem janela de console
			const recDir = path.join(__dirname, '..', 'takeatrec')
			psRun(
				`$env:WHISPER_RUNTIME_ALLOW_MISSING='1'; ` +
				`Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm','run','dev' -WorkingDirectory '${recDir}' -WindowStyle Hidden`
			)
		})
	}

	function launchRec() {
		if (!IS_WIN) return // Takeat Rec: só no Windows por enquanto
		if (recLaunching) return
		recLaunching = true
		sendRecState('loading')
		psRun(REC_FOCUS_CMD, (out) => {
			if (out === 'found') {
				// Já estava aberto: só trouxemos a janela real à frente
				recLaunching = false
				sendRecState('ready')
				if (launcherWin && !launcherWin.isDestroyed()) launcherWin.minimize()
				return
			}
			// Nenhuma janela real (processo fantasma ou nada rodando):
			// mata fantasmas e sobe uma instância nova
			spawnRec()
			const started = Date.now()
			const poll = setInterval(() => {
				psRun(REC_FOCUS_CMD, (result) => {
					if (result === 'found') {
						clearInterval(poll)
						recLaunching = false
						sendRecState('ready')
						if (launcherWin && !launcherWin.isDestroyed()) launcherWin.minimize()
					} else if (Date.now() - started > 90000) {
						clearInterval(poll)
						recLaunching = false
						sendRecState('error')
					}
				})
			}, 2000)
		})
	}

	ipcMain.on('launch-choice', (_e, choice) => {
		if (choice === 'rec') {
			launchRec()
			return
		}
		if (choice === 'map') {
			createMapWindow()
			if (launcherWin && !launcherWin.isDestroyed()) launcherWin.close()
			launcherWin = null
			return
		}
		createWindow()
		createOverlay()
		createCursorWin()
		if (launcherWin && !launcherWin.isDestroyed()) launcherWin.close()
		launcherWin = null
	})

	// Botão "Trocar de app" (Cam ou Map): fecha a janela e volta ao launcher
	ipcMain.on('back-to-launcher', (event) => {
		cursorHideRequested = false
		applyCursorHidden(false)
		createLauncher()
		const sender = BrowserWindow.fromWebContents(event.sender)
		if (sender && !sender.isDestroyed()) sender.close()
		if (sender === win) win = null
		if (sender === mapWin) mapWin = null
	})

	// ---------- Takeat Map: salvar/abrir arquivos .takeatmap ----------

	ipcMain.handle('map-save', async (e, data, name) => {
		const w = BrowserWindow.fromWebContents(e.sender)
		const safeName = String(name || 'mapa').replace(/[\\/:*?"<>|]/g, '').trim() || 'mapa'
		const { canceled, filePath } = await dialog.showSaveDialog(w, {
			title: 'Salvar mapa',
			defaultPath: `${safeName}.takeatmap`,
			filters: [{ name: 'Takeat Map', extensions: ['takeatmap'] }],
		})
		if (canceled || !filePath) return false
		fs.writeFileSync(filePath, JSON.stringify(data, null, '\t'))
		return true
	})

	ipcMain.handle('map-open', async (e) => {
		const w = BrowserWindow.fromWebContents(e.sender)
		const { canceled, filePaths } = await dialog.showOpenDialog(w, {
			title: 'Abrir mapa',
			filters: [{ name: 'Takeat Map', extensions: ['takeatmap', 'json'] }],
			properties: ['openFile'],
		})
		if (canceled || !filePaths[0]) return null
		try {
			return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
		} catch {
			return null
		}
	})

	// Renderer pergunta se está empacotado (pra esconder o botão de launcher)
	ipcMain.handle('is-packaged', () => app.isPackaged)
	ipcMain.handle('platform', () => process.platform)

	// Posição do mouse a ~60fps, normalizada para a fonte ativa (tela ou janela)
	setInterval(() => {
		if (!win || win.isDestroyed()) return
		const dip = screen.getCursorScreenPoint()
		// Réplica local: a ponta do cursor desenhado fica no ponto (8,8) da janela
		if (cursorWin && !cursorWin.isDestroyed() && cursorWin.isVisible()) {
			cursorWin.setPosition(dip.x - 8, dip.y - 8)
			// Reafirma o topo de vez em quando: barra de tarefas e menus do
			// Windows disputam o z-order com janelas always-on-top
			if (++cursorTick % 30 === 0) cursorWin.moveTop()
		}
		const rect = sourcePhysRect()
		if (!rect || rect.width <= 0 || rect.height <= 0) return
		const p = toPhysPoint(dip)

		// Cursor real fica invisível SÓ com o mouse dentro da área capturada
		// (fora dela, o cursor do Windows é o normal de sempre). A captura de
		// janela só desenha o cursor quando ele está sobre a janela, então a
		// transmissão fica limpa o tempo todo.
		const inside =
			p.x >= rect.x && p.x < rect.x + rect.width &&
			p.y >= rect.y && p.y < rect.y + rect.height
		if (inside !== lastInsideLogged) {
			lastInsideLogged = inside
			tlog(`inside=${inside} mouse=(${p.x},${p.y}) rect=(${rect.x},${rect.y},${rect.width}x${rect.height}) fonte=${activeSource ? activeSource.kind : 'nenhuma'} pedido=${cursorHideRequested}`)
		}
		const wantHidden = cursorHideRequested && inside
		const now = Date.now()
		if (wantHidden !== cursorHiddenByUs && now - lastCursorToggle > 250) {
			lastCursorToggle = now
			applyCursorHidden(wantHidden)
		} else if (wantHidden && cursorHiddenByUs && now - lastHideApply > 2000) {
			// Defesa: outro programa pode restaurar os cursores do sistema
			// por fora; reaplica o invisível periodicamente
			lastHideApply = now
			cursorHiddenByUs = false
			setSystemCursorVisible(false)
		}

		win.webContents.send('cursor', {
			x: Math.min(1, Math.max(0, (p.x - rect.x) / rect.width)),
			y: Math.min(1, Math.max(0, (p.y - rect.y) / rect.height)),
		})
	}, 16)

	// Hotkeys globais (sempre Alt + tecla): funcionam com o app em segundo
	// plano e são reconfiguráveis pela interface
	const send = (cmd) => () => {
		if (win && !win.isDestroyed()) win.webContents.send('zoom', cmd)
	}
	const DEFAULT_BINDINGS = { zoom: 'Z', release: 'X', level1: '1', level2: '2', level3: '3', cursor: 'C', picker: 'S', restart: 'R' }
	const ACTION_CMDS = {
		zoom: { type: 'toggle', scale: 1.5 },
		release: { type: 'release' },
		level1: { type: 'set', scale: 1.3 },
		level2: { type: 'set', scale: 1.5 },
		level3: { type: 'set', scale: 2 },
		cursor: { type: 'cursor' },
		picker: { type: 'picker' },
		restart: { type: 'restart' },
	}
	function applyBindings(bindings) {
		globalShortcut.unregisterAll()
		const merged = { ...DEFAULT_BINDINGS, ...bindings }
		for (const [action, key] of Object.entries(merged)) {
			if (!ACTION_CMDS[action] || !/^[A-Z0-9]$/.test(String(key))) continue
			try {
				globalShortcut.register(`Alt+${key}`, send(ACTION_CMDS[action]))
			} catch {}
		}
	}
	applyBindings({})
	ipcMain.on('set-bindings', (_e, b) => applyBindings(b || {}))

	ipcMain.handle('list-sources', async () => {
		const sources = await desktopCapturer.getSources({
			types: ['screen', 'window'],
			thumbnailSize: { width: 320, height: 180 },
		})
		return sources
			.filter((s) => !['Takeat Cam', 'TakeatCam', 'TakeatCam HUD', 'TakeatCam Cursor', 'Takeat Studio'].includes(s.name))
			.map((s) => ({
				id: s.id,
				name: s.name,
				kind: s.id.startsWith('screen') ? 'screen' : 'window',
				thumb: s.thumbnail.toDataURL(),
			}))
	})

	ipcMain.on('select-source', (_e, id) => {
		selectedId = id
	})

	ipcMain.on('set-cursor-hidden', (_e, payload) => {
		cursorHideRequested = Boolean(payload && payload.hidden)
		cursorReplicaStyle = (payload && payload.style) || null
		tlog('set-cursor-hidden pedido:', cursorHideRequested, 'estilo:', cursorReplicaStyle ? cursorReplicaStyle.img : 'nenhum')
		if (cursorWin && !cursorWin.isDestroyed()) {
			cursorWin.webContents.send('style', cursorReplicaStyle)
			syncCursorWinProtection()
		}
		// Desligou: restaura imediatamente. Ligou: o loop de 60fps assume e
		// esconde só quando o mouse entrar na área capturada.
		if (!cursorHideRequested) applyCursorHidden(false)
	})

	ipcMain.on('zoom-state', (_e, s) => {
		if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('state', s)
	})

	ipcMain.on('resize-to-aspect', (_e, ratio) => {
		if (!win || win.isDestroyed() || !ratio) return
		const [w] = win.getContentSize()
		win.setContentSize(w, Math.round(w / ratio))
	})
})

app.on('will-quit', () => {
	if (cursorHiddenByUs) setSystemCursorVisible(true)
	globalShortcut.unregisterAll()
})
app.on('window-all-closed', () => app.quit())
