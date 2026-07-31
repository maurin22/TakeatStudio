const video = document.getElementById('screen')
const hud = document.getElementById('hud')
const picker = document.getElementById('picker')
const pickerContent = document.getElementById('picker-content')
const qualityEl = document.getElementById('quality')
const cursorStyleEl = document.getElementById('cursor-style')
const cursorEaseEl = document.getElementById('cursor-ease')
const cursorEl = document.getElementById('cursor')

// ---------- opções ----------

// Presets de qualidade: quanto menor, mais leve pra máquina
const QUALITIES = [
	{ key: 'full', label: '100% Full HD', width: null, height: null },
	{ key: '720', label: 'HD 720p', width: 1280, height: 720 },
	{ key: '480', label: '480p', width: 854, height: 480 },
	{ key: '360', label: '360p', width: 640, height: 360 },
]

// Cursores em SVG vindos do Recordly (hotspot = fração da ponta na imagem).
// Com qualquer um ativo, o cursor real do sistema é ocultado da transmissão.
const CURSOR_STYLES = [
	{ key: 'none', i18n: 'cursorSystem' },
	{ key: 'macos', label: 'Seta macOS', img: 'cursors/macos-pointer.svg', hotspot: { x: 0.34, y: 0.24 }, size: 28 },
	{ key: 'tahoe', label: 'Seta Tahoe', img: 'cursors/tahoe-pointer.svg', hotspot: { x: 0.14, y: 0.06 }, size: 28 },
	{ key: 'hand', label: 'Mãozinha', img: 'cursors/macos-hand.svg', hotspot: { x: 0.39, y: 0.26 }, size: 32 },
	{ key: 'minimal', label: 'Minimal', img: 'cursors/minimal.svg', hotspot: { x: 0.1, y: 0.05 }, size: 30 },
	{ key: 'face', label: 'Cursheferson', img: 'cursors/face.png', hotspot: { x: 0.23, y: 0.06 }, size: 36, led: true },
]

// Fator de suavização por frame do cursor destacado
const CURSOR_EASES = [
	{ key: 'light', i18n: 'easeLight', value: 0.35 },
	{ key: 'medium', i18n: 'easeMedium', value: 0.2 },
	{ key: 'high', i18n: 'easeHigh', value: 0.1 },
	{ key: 'max', i18n: 'easeMax', value: 0.06 },
]

const SYSTEM_CURSOR_ICON =
	'<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#9a9aa2" stroke-width="1.6"><path d="M5 3l14 8-6.5 1.8L9 19z" stroke-linejoin="round"/></svg>'

const getQuality = (key) => QUALITIES.find((q) => q.key === key)
let quality = localStorage.getItem('lz-quality')
if (!getQuality(quality)) quality = 'full'

let cursorStyle = localStorage.getItem('lz-cursor')
if (!CURSOR_STYLES.some((c) => c.key === cursorStyle)) cursorStyle = 'none'
let lastCursorStyle = cursorStyle === 'none' ? 'macos' : cursorStyle

let cursorEase = localStorage.getItem('lz-cursor-ease')
if (!CURSOR_EASES.some((c) => c.key === cursorEase)) cursorEase = 'medium'

// ---------- tema e idioma (mesmos 10 idiomas do Takeat Rec) ----------

const THEMES = [
	{ key: 'dark', label: 'Escuro' },
	{ key: 'light', label: 'Claro' },
]
const LANGUAGES = [
	{ key: 'pt-BR', label: 'Português' },
	{ key: 'en', label: 'English' },
	{ key: 'es', label: 'Español' },
	{ key: 'fr', label: 'Français' },
	{ key: 'it', label: 'Italiano' },
	{ key: 'nl', label: 'Nederlands' },
	{ key: 'ru', label: 'Русский' },
	{ key: 'ko', label: '한국어' },
	{ key: 'zh-CN', label: '简体中文' },
	{ key: 'zh-TW', label: '繁體中文' },
]

const I18N = {
	'pt-BR': {
		tag: 'Apresente o sistema Takeat com zoom: escolha a fonte e compartilhe a janela do Takeat Cam no Meet',
		back: '← Trocar de app',
		secSource: 'Fonte da transmissão', tabScreens: 'Telas', tabWindows: 'Janelas', loadingSources: 'Carregando fontes...',
		secQuality: 'Qualidade', secSmooth: 'Suavidade do cursor', secKeys: 'Atalhos',
		keysHint: 'Clique num atalho e pressione a nova tecla. Sempre Alt + letra ou número.',
		secPrefs: 'Preferências', themeLabel: 'Tema', langLabel: 'Idioma',
		secCursor: 'Cursor', cursorSystem: 'Sistema',
		secTutorial: 'Tutorial: como compartilhar no Meet', step: 'PASSO',
		s1t: 'Escolha a fonte aqui', s1p: 'Abra o Takeat Cam e clique na <b>tela ou janela</b> que quer transmitir (ex.: o Chrome com o sistema Takeat aberto). A janela do app vira o espelho com zoom.',
		s2t: 'No Meet, apresente uma janela', s2p: 'Na chamada, clique em <b>Apresentar agora</b> (ícone da setinha) e escolha <b>Uma janela</b>. <b style="color:#ff5a5a">Nunca "O dispositivo inteiro".</b>',
		s3t: 'Selecione a janela Takeat Cam', s3p: 'Na lista de janelas, escolha <b>Takeat Cam</b> e confirme. Quem assiste vê a janela do app, com o sistema já ampliado e o cursor destacado.',
		s4t: 'Apresente com os atalhos', s4p: 'Volte pro sistema Takeat e use <b>Alt+Z</b> pra dar zoom onde o mouse está e <b>Alt+X</b> pra soltar. O indicador no canto mostra o estado (só você vê ele).',
		easeLight: 'Leve', easeMedium: 'Média', easeHigh: 'Alta', easeMax: 'Máxima',
		bindZoom: 'Ligar/desligar zoom', bindRelease: 'Soltar zoom', bindLevel1: 'Zoom 1.3x', bindLevel2: 'Zoom 1.5x', bindLevel3: 'Zoom 2x',
		bindCursor: 'Cursor liga/desliga', bindPicker: 'Abrir este menu', bindRestart: 'Reiniciar captura', keyPrompt: 'tecla...',
		hudZoom: 'zoom', hudRelease: 'soltar', hudLevel: 'nível', hudCursor: 'cursor', hudMenu: 'menu',
	},
	en: {
		tag: 'Present the Takeat system with zoom: pick the source and share the Takeat Cam window on Meet',
		back: '← Switch app',
		secSource: 'Broadcast source', tabScreens: 'Screens', tabWindows: 'Windows', loadingSources: 'Loading sources...',
		secQuality: 'Quality', secSmooth: 'Cursor smoothness', secKeys: 'Shortcuts',
		keysHint: 'Click a shortcut and press the new key. Always Alt + letter or number.',
		secPrefs: 'Preferences', themeLabel: 'Theme', langLabel: 'Language',
		secCursor: 'Cursor', cursorSystem: 'System',
		secTutorial: 'Tutorial: how to share on Meet', step: 'STEP',
		s1t: 'Choose the source here', s1p: 'Open Takeat Cam and click the <b>screen or window</b> you want to broadcast (e.g. Chrome with the Takeat system open). The app window becomes the mirror with zoom.',
		s2t: 'On Meet, present a window', s2p: 'In the call, click <b>Present now</b> (arrow icon) and choose <b>A window</b>. <b style="color:#ff5a5a">Never "Your entire screen".</b>',
		s3t: 'Select the Takeat Cam window', s3p: 'In the window list, choose <b>Takeat Cam</b> and confirm. Viewers see the app window, already zoomed with the highlighted cursor.',
		s4t: 'Present with the shortcuts', s4p: 'Go back to the Takeat system and use <b>Alt+Z</b> to zoom where the mouse is and <b>Alt+X</b> to release. The corner indicator shows the state (only you see it).',
		easeLight: 'Light', easeMedium: 'Medium', easeHigh: 'High', easeMax: 'Maximum',
		bindZoom: 'Toggle zoom', bindRelease: 'Release zoom', bindLevel1: 'Zoom 1.3x', bindLevel2: 'Zoom 1.5x', bindLevel3: 'Zoom 2x',
		bindCursor: 'Toggle cursor', bindPicker: 'Open this menu', bindRestart: 'Restart capture', keyPrompt: 'key...',
		hudZoom: 'zoom', hudRelease: 'release', hudLevel: 'level', hudCursor: 'cursor', hudMenu: 'menu',
	},
	es: {
		tag: 'Presenta el sistema Takeat con zoom: elige la fuente y comparte la ventana de Takeat Cam en Meet',
		back: '← Cambiar de app',
		secSource: 'Fuente de transmisión', tabScreens: 'Pantallas', tabWindows: 'Ventanas', loadingSources: 'Cargando fuentes...',
		secQuality: 'Calidad', secSmooth: 'Suavidad del cursor', secKeys: 'Atajos',
		keysHint: 'Haz clic en un atajo y pulsa la nueva tecla. Siempre Alt + letra o número.',
		secPrefs: 'Preferencias', themeLabel: 'Tema', langLabel: 'Idioma',
		secCursor: 'Cursor', cursorSystem: 'Sistema',
		secTutorial: 'Tutorial: cómo compartir en Meet', step: 'PASO',
		s1t: 'Elige la fuente aquí', s1p: 'Abre Takeat Cam y haz clic en la <b>pantalla o ventana</b> que quieras transmitir (ej.: Chrome con el sistema Takeat abierto). La ventana de la app se convierte en el espejo con zoom.',
		s2t: 'En Meet, presenta una ventana', s2p: 'En la llamada, haz clic en <b>Presentar ahora</b> (icono de flecha) y elige <b>Una ventana</b>. <b style="color:#ff5a5a">Nunca "Toda la pantalla".</b>',
		s3t: 'Selecciona la ventana Takeat Cam', s3p: 'En la lista de ventanas, elige <b>Takeat Cam</b> y confirma. Los espectadores ven la ventana de la app, ya con zoom y el cursor destacado.',
		s4t: 'Presenta con los atajos', s4p: 'Vuelve al sistema Takeat y usa <b>Alt+Z</b> para hacer zoom donde está el ratón y <b>Alt+X</b> para soltarlo. El indicador de la esquina muestra el estado (solo tú lo ves).',
		easeLight: 'Suave', easeMedium: 'Media', easeHigh: 'Alta', easeMax: 'Máxima',
		bindZoom: 'Activar/desactivar zoom', bindRelease: 'Soltar zoom', bindLevel1: 'Zoom 1.3x', bindLevel2: 'Zoom 1.5x', bindLevel3: 'Zoom 2x',
		bindCursor: 'Cursor activar/desactivar', bindPicker: 'Abrir este menú', bindRestart: 'Reiniciar captura', keyPrompt: 'tecla...',
		hudZoom: 'zoom', hudRelease: 'soltar', hudLevel: 'nivel', hudCursor: 'cursor', hudMenu: 'menú',
	},
	fr: {
		tag: 'Présentez le système Takeat avec zoom : choisissez la source et partagez la fenêtre Takeat Cam sur Meet',
		back: '← Changer d\'app',
		secSource: 'Source de diffusion', tabScreens: 'Écrans', tabWindows: 'Fenêtres', loadingSources: 'Chargement des sources...',
		secQuality: 'Qualité', secSmooth: 'Fluidité du curseur', secKeys: 'Raccourcis',
		keysHint: 'Cliquez sur un raccourci et appuyez sur la nouvelle touche. Toujours Alt + lettre ou chiffre.',
		secPrefs: 'Préférences', themeLabel: 'Thème', langLabel: 'Langue',
		secCursor: 'Curseur', cursorSystem: 'Système',
		secTutorial: 'Tutoriel : partager sur Meet', step: 'ÉTAPE',
		s1t: 'Choisissez la source ici', s1p: 'Ouvrez Takeat Cam et cliquez sur l\'<b>écran ou la fenêtre</b> à diffuser (ex. Chrome avec le système Takeat ouvert). La fenêtre de l\'app devient le miroir avec zoom.',
		s2t: 'Sur Meet, présentez une fenêtre', s2p: 'Dans l\'appel, cliquez sur <b>Présenter maintenant</b> (icône flèche) et choisissez <b>Une fenêtre</b>. <b style="color:#ff5a5a">Jamais "Tout l\'écran".</b>',
		s3t: 'Sélectionnez la fenêtre Takeat Cam', s3p: 'Dans la liste des fenêtres, choisissez <b>Takeat Cam</b> et confirmez. Les spectateurs voient la fenêtre de l\'app, déjà zoomée avec le curseur mis en valeur.',
		s4t: 'Présentez avec les raccourcis', s4p: 'Retournez sur le système Takeat et utilisez <b>Alt+Z</b> pour zoomer là où se trouve la souris et <b>Alt+X</b> pour relâcher. L\'indicateur dans le coin montre l\'état (visible uniquement par vous).',
		easeLight: 'Légère', easeMedium: 'Moyenne', easeHigh: 'Élevée', easeMax: 'Maximale',
		bindZoom: 'Activer/désactiver le zoom', bindRelease: 'Relâcher le zoom', bindLevel1: 'Zoom 1.3x', bindLevel2: 'Zoom 1.5x', bindLevel3: 'Zoom 2x',
		bindCursor: 'Curseur activer/désactiver', bindPicker: 'Ouvrir ce menu', bindRestart: 'Redémarrer la capture', keyPrompt: 'touche...',
		hudZoom: 'zoom', hudRelease: 'relâcher', hudLevel: 'niveau', hudCursor: 'curseur', hudMenu: 'menu',
	},
	it: {
		tag: 'Presenta il sistema Takeat con zoom: scegli la fonte e condividi la finestra Takeat Cam su Meet',
		back: '← Cambia app',
		secSource: 'Fonte della trasmissione', tabScreens: 'Schermi', tabWindows: 'Finestre', loadingSources: 'Caricamento fonti...',
		secQuality: 'Qualità', secSmooth: 'Morbidezza del cursore', secKeys: 'Scorciatoie',
		keysHint: 'Clicca su una scorciatoia e premi il nuovo tasto. Sempre Alt + lettera o numero.',
		secPrefs: 'Preferenze', themeLabel: 'Tema', langLabel: 'Lingua',
		secCursor: 'Cursore', cursorSystem: 'Sistema',
		secTutorial: 'Tutorial: come condividere su Meet', step: 'PASSO',
		s1t: 'Scegli qui la fonte', s1p: 'Apri Takeat Cam e clicca su <b>schermo o finestra</b> da trasmettere (es. Chrome con il sistema Takeat aperto). La finestra dell\'app diventa lo specchio con zoom.',
		s2t: 'Su Meet, presenta una finestra', s2p: 'Nella chiamata, clicca su <b>Presenta ora</b> (icona freccia) e scegli <b>Una finestra</b>. <b style="color:#ff5a5a">Mai "L\'intero schermo".</b>',
		s3t: 'Seleziona la finestra Takeat Cam', s3p: 'Nell\'elenco delle finestre, scegli <b>Takeat Cam</b> e conferma. Chi guarda vede la finestra dell\'app, già ingrandita con il cursore evidenziato.',
		s4t: 'Presenta con le scorciatoie', s4p: 'Torna al sistema Takeat e usa <b>Alt+Z</b> per lo zoom dove si trova il mouse e <b>Alt+X</b> per rilasciare. L\'indicatore nell\'angolo mostra lo stato (lo vedi solo tu).',
		easeLight: 'Leggera', easeMedium: 'Media', easeHigh: 'Alta', easeMax: 'Massima',
		bindZoom: 'Attiva/disattiva zoom', bindRelease: 'Rilascia zoom', bindLevel1: 'Zoom 1.3x', bindLevel2: 'Zoom 1.5x', bindLevel3: 'Zoom 2x',
		bindCursor: 'Cursore attiva/disattiva', bindPicker: 'Apri questo menu', bindRestart: 'Riavvia acquisizione', keyPrompt: 'tasto...',
		hudZoom: 'zoom', hudRelease: 'rilascia', hudLevel: 'livello', hudCursor: 'cursore', hudMenu: 'menu',
	},
	nl: {
		tag: 'Presenteer het Takeat-systeem met zoom: kies de bron en deel het Takeat Cam-venster in Meet',
		back: '← App wisselen',
		secSource: 'Uitzendbron', tabScreens: 'Schermen', tabWindows: 'Vensters', loadingSources: 'Bronnen laden...',
		secQuality: 'Kwaliteit', secSmooth: 'Cursorsoepelheid', secKeys: 'Sneltoetsen',
		keysHint: 'Klik op een sneltoets en druk op de nieuwe toets. Altijd Alt + letter of cijfer.',
		secPrefs: 'Voorkeuren', themeLabel: 'Thema', langLabel: 'Taal',
		secCursor: 'Cursor', cursorSystem: 'Systeem',
		secTutorial: 'Tutorial: delen op Meet', step: 'STAP',
		s1t: 'Kies hier de bron', s1p: 'Open Takeat Cam en klik op het <b>scherm of venster</b> dat je wilt uitzenden (bv. Chrome met het Takeat-systeem open). Het app-venster wordt de spiegel met zoom.',
		s2t: 'Presenteer een venster in Meet', s2p: 'Klik in de oproep op <b>Nu presenteren</b> (pijl-icoon) en kies <b>Een venster</b>. <b style="color:#ff5a5a">Nooit "Je hele scherm".</b>',
		s3t: 'Selecteer het Takeat Cam-venster', s3p: 'Kies in de vensterlijst <b>Takeat Cam</b> en bevestig. Kijkers zien het app-venster, al ingezoomd met de gemarkeerde cursor.',
		s4t: 'Presenteer met de sneltoetsen', s4p: 'Ga terug naar het Takeat-systeem en gebruik <b>Alt+Z</b> om in te zoomen waar de muis is en <b>Alt+X</b> om los te laten. De indicator in de hoek toont de status (alleen jij ziet die).',
		easeLight: 'Licht', easeMedium: 'Gemiddeld', easeHigh: 'Hoog', easeMax: 'Maximaal',
		bindZoom: 'Zoom aan/uit', bindRelease: 'Zoom loslaten', bindLevel1: 'Zoom 1.3x', bindLevel2: 'Zoom 1.5x', bindLevel3: 'Zoom 2x',
		bindCursor: 'Cursor aan/uit', bindPicker: 'Dit menu openen', bindRestart: 'Opname herstarten', keyPrompt: 'toets...',
		hudZoom: 'zoom', hudRelease: 'loslaten', hudLevel: 'niveau', hudCursor: 'cursor', hudMenu: 'menu',
	},
	ru: {
		tag: 'Показывайте систему Takeat с зумом: выберите источник и поделитесь окном Takeat Cam в Meet',
		back: '← Сменить приложение',
		secSource: 'Источник трансляции', tabScreens: 'Экраны', tabWindows: 'Окна', loadingSources: 'Загрузка источников...',
		secQuality: 'Качество', secSmooth: 'Плавность курсора', secKeys: 'Горячие клавиши',
		keysHint: 'Нажмите на сочетание клавиш и введите новую клавишу. Всегда Alt + буква или цифра.',
		secPrefs: 'Настройки', themeLabel: 'Тема', langLabel: 'Язык',
		secCursor: 'Курсор', cursorSystem: 'Системный',
		secTutorial: 'Инструкция: как показать в Meet', step: 'ШАГ',
		s1t: 'Выберите источник здесь', s1p: 'Откройте Takeat Cam и выберите <b>экран или окно</b>, которое хотите транслировать (например, Chrome с открытой системой Takeat). Окно приложения станет зеркалом с зумом.',
		s2t: 'В Meet демонстрируйте окно', s2p: 'В звонке нажмите <b>Демонстрировать</b> (значок стрелки) и выберите <b>Окно</b>. <b style="color:#ff5a5a">Никогда «Весь экран».</b>',
		s3t: 'Выберите окно Takeat Cam', s3p: 'В списке окон выберите <b>Takeat Cam</b> и подтвердите. Зрители видят окно приложения с уже увеличенным изображением и выделенным курсором.',
		s4t: 'Показывайте с горячими клавишами', s4p: 'Вернитесь в систему Takeat и используйте <b>Alt+Z</b> для зума в месте курсора и <b>Alt+X</b>, чтобы отпустить. Индикатор в углу показывает состояние (виден только вам).',
		easeLight: 'Лёгкая', easeMedium: 'Средняя', easeHigh: 'Высокая', easeMax: 'Максимальная',
		bindZoom: 'Вкл/выкл зум', bindRelease: 'Отпустить зум', bindLevel1: 'Зум 1.3x', bindLevel2: 'Зум 1.5x', bindLevel3: 'Зум 2x',
		bindCursor: 'Курсор вкл/выкл', bindPicker: 'Открыть это меню', bindRestart: 'Перезапустить захват', keyPrompt: 'клавиша...',
		hudZoom: 'зум', hudRelease: 'отпустить', hudLevel: 'уровень', hudCursor: 'курсор', hudMenu: 'меню',
	},
	ko: {
		tag: '줌으로 Takeat 시스템을 발표하세요: 소스를 선택하고 Meet에서 Takeat Cam 창을 공유하세요',
		back: '← 앱 전환',
		secSource: '방송 소스', tabScreens: '화면', tabWindows: '창', loadingSources: '소스 불러오는 중...',
		secQuality: '화질', secSmooth: '커서 부드러움', secKeys: '단축키',
		keysHint: '단축키를 클릭하고 새 키를 누르세요. 항상 Alt + 문자 또는 숫자.',
		secPrefs: '환경설정', themeLabel: '테마', langLabel: '언어',
		secCursor: '커서', cursorSystem: '시스템',
		secTutorial: '튜토리얼: Meet에서 공유하는 방법', step: '단계',
		s1t: '여기서 소스를 선택하세요', s1p: 'Takeat Cam을 열고 방송할 <b>화면 또는 창</b>을 클릭하세요 (예: Takeat 시스템이 열린 Chrome). 앱 창이 줌이 적용된 미러가 됩니다.',
		s2t: 'Meet에서 창을 발표하세요', s2p: '통화에서 <b>지금 발표하기</b>(화살표 아이콘)를 클릭하고 <b>창</b>을 선택하세요. <b style="color:#ff5a5a">"전체 화면"은 절대 안 됩니다.</b>',
		s3t: 'Takeat Cam 창을 선택하세요', s3p: '창 목록에서 <b>Takeat Cam</b>을 선택하고 확인하세요. 시청자는 이미 확대되고 커서가 강조된 앱 창을 보게 됩니다.',
		s4t: '단축키로 발표하세요', s4p: 'Takeat 시스템으로 돌아가서 마우스 위치에서 확대하려면 <b>Alt+Z</b>를, 해제하려면 <b>Alt+X</b>를 사용하세요. 모서리 표시기가 상태를 보여줍니다 (본인만 볼 수 있음).',
		easeLight: '약하게', easeMedium: '보통', easeHigh: '강하게', easeMax: '최대',
		bindZoom: '줌 켜기/끄기', bindRelease: '줌 해제', bindLevel1: '줌 1.3x', bindLevel2: '줌 1.5x', bindLevel3: '줌 2x',
		bindCursor: '커서 켜기/끄기', bindPicker: '이 메뉴 열기', bindRestart: '캡처 재시작', keyPrompt: '키...',
		hudZoom: '줌', hudRelease: '해제', hudLevel: '레벨', hudCursor: '커서', hudMenu: '메뉴',
	},
	'zh-CN': {
		tag: '用缩放展示 Takeat 系统：选择来源并在 Meet 中共享 Takeat Cam 窗口',
		back: '← 切换应用',
		secSource: '直播来源', tabScreens: '屏幕', tabWindows: '窗口', loadingSources: '正在加载来源...',
		secQuality: '画质', secSmooth: '光标平滑度', secKeys: '快捷键',
		keysHint: '点击一个快捷键并按下新按键。始终为 Alt + 字母或数字。',
		secPrefs: '偏好设置', themeLabel: '主题', langLabel: '语言',
		secCursor: '光标', cursorSystem: '系统',
		secTutorial: '教程：如何在 Meet 中共享', step: '步骤',
		s1t: '在此选择来源', s1p: '打开 Takeat Cam，点击要直播的<b>屏幕或窗口</b>（例如打开了 Takeat 系统的 Chrome）。应用窗口将变成带缩放效果的镜像。',
		s2t: '在 Meet 中共享一个窗口', s2p: '在通话中点击<b>立即演示</b>（箭头图标），选择<b>一个窗口</b>。<b style="color:#ff5a5a">切勿选择"整个屏幕"。</b>',
		s3t: '选择 Takeat Cam 窗口', s3p: '在窗口列表中选择 <b>Takeat Cam</b> 并确认。观众看到的是已放大且光标高亮的应用窗口。',
		s4t: '使用快捷键进行演示', s4p: '回到 Takeat 系统，使用 <b>Alt+Z</b> 在鼠标所在位置缩放，使用 <b>Alt+X</b> 取消。角落的指示器显示状态（只有你能看到）。',
		easeLight: '轻', easeMedium: '中', easeHigh: '高', easeMax: '最大',
		bindZoom: '切换缩放', bindRelease: '取消缩放', bindLevel1: '缩放 1.3x', bindLevel2: '缩放 1.5x', bindLevel3: '缩放 2x',
		bindCursor: '光标开/关', bindPicker: '打开此菜单', bindRestart: '重新开始捕获', keyPrompt: '按键...',
		hudZoom: '缩放', hudRelease: '取消', hudLevel: '级别', hudCursor: '光标', hudMenu: '菜单',
	},
	'zh-TW': {
		tag: '用縮放展示 Takeat 系統：選擇來源並在 Meet 中共用 Takeat Cam 視窗',
		back: '← 切換應用程式',
		secSource: '直播來源', tabScreens: '螢幕', tabWindows: '視窗', loadingSources: '正在載入來源...',
		secQuality: '畫質', secSmooth: '游標平滑度', secKeys: '快速鍵',
		keysHint: '點擊一個快速鍵並按下新按鍵。永遠是 Alt + 字母或數字。',
		secPrefs: '偏好設定', themeLabel: '主題', langLabel: '語言',
		secCursor: '游標', cursorSystem: '系統',
		secTutorial: '教學：如何在 Meet 中共用', step: '步驟',
		s1t: '在此選擇來源', s1p: '開啟 Takeat Cam，點擊要直播的<b>螢幕或視窗</b>（例如開啟了 Takeat 系統的 Chrome）。應用程式視窗會變成帶縮放效果的鏡像。',
		s2t: '在 Meet 中簡報一個視窗', s2p: '在通話中點擊<b>立即簡報</b>（箭頭圖示），選擇<b>一個視窗</b>。<b style="color:#ff5a5a">切勿選擇「整個螢幕」。</b>',
		s3t: '選擇 Takeat Cam 視窗', s3p: '在視窗清單中選擇 <b>Takeat Cam</b> 並確認。觀眾看到的是已放大且游標醒目提示的應用程式視窗。',
		s4t: '使用快速鍵進行簡報', s4p: '回到 Takeat 系統，使用 <b>Alt+Z</b> 在滑鼠所在位置縮放，使用 <b>Alt+X</b> 取消。角落的指示器會顯示狀態（只有你能看到）。',
		easeLight: '輕', easeMedium: '中', easeHigh: '高', easeMax: '最大',
		bindZoom: '切換縮放', bindRelease: '取消縮放', bindLevel1: '縮放 1.3x', bindLevel2: '縮放 1.5x', bindLevel3: '縮放 2x',
		bindCursor: '游標開/關', bindPicker: '開啟此選單', bindRestart: '重新開始擷取', keyPrompt: '按鍵...',
		hudZoom: '縮放', hudRelease: '取消', hudLevel: '級別', hudCursor: '游標', hudMenu: '選單',
	},
}

let uiLang = localStorage.getItem('lz-lang')
if (!I18N[uiLang]) uiLang = 'pt-BR'
let uiTheme = localStorage.getItem('lz-theme')
if (uiTheme !== 'light' && uiTheme !== 'dark') uiTheme = 'dark'

function t(key) {
	return (I18N[uiLang] && I18N[uiLang][key]) || I18N['pt-BR'][key] || key
}

function applyTheme() {
	document.body.classList.toggle('light', uiTheme === 'light')
}

function applyTranslations() {
	document.querySelectorAll('[data-i18n]').forEach((el) => {
		const key = el.getAttribute('data-i18n')
		const value = t(key)
		if (value.includes('<')) el.innerHTML = value
		else el.textContent = value
	})
}

// ---------- atalhos (sempre Alt + tecla) ----------

const BIND_ACTIONS = [
	{ key: 'zoom', i18n: 'bindZoom' },
	{ key: 'release', i18n: 'bindRelease' },
	{ key: 'level1', i18n: 'bindLevel1' },
	{ key: 'level2', i18n: 'bindLevel2' },
	{ key: 'level3', i18n: 'bindLevel3' },
	{ key: 'cursor', i18n: 'bindCursor' },
	{ key: 'picker', i18n: 'bindPicker' },
	{ key: 'restart', i18n: 'bindRestart' },
]
const DEFAULT_BINDINGS = { zoom: 'Z', release: 'X', level1: '1', level2: '2', level3: '3', cursor: 'C', picker: 'S', restart: 'R' }
let bindings = { ...DEFAULT_BINDINGS }
try {
	const saved = JSON.parse(localStorage.getItem('lz-bindings') || '{}')
	for (const [action, key] of Object.entries(saved)) {
		if (action in DEFAULT_BINDINGS && /^[A-Z0-9]$/.test(String(key))) bindings[action] = key
	}
} catch {}
let editingAction = null

function saveBindings() {
	localStorage.setItem('lz-bindings', JSON.stringify(bindings))
	window.livezoom.setBindings(bindings)
	refreshHud()
}

function renderKeybinds() {
	const el = document.getElementById('keybinds')
	el.innerHTML = ''
	for (const a of BIND_ACTIONS) {
		const row = document.createElement('div')
		row.className = 'keyrow'
		const label = document.createElement('span')
		label.textContent = t(a.i18n)
		const btn = document.createElement('button')
		btn.className = 'kbd-btn' + (editingAction === a.key ? ' editing' : '')
		btn.textContent = editingAction === a.key ? t('keyPrompt') : `Alt + ${bindings[a.key]}`
		btn.addEventListener('click', () => {
			editingAction = editingAction === a.key ? null : a.key
			renderKeybinds()
		})
		row.append(label, btn)
		el.appendChild(row)
	}
}

addEventListener('keydown', (e) => {
	if (!editingAction) return
	if (e.key === 'Escape') {
		editingAction = null
		renderKeybinds()
		return
	}
	const k = e.key.toUpperCase()
	if (!/^[A-Z0-9]$/.test(k)) return
	e.preventDefault()
	// Se a tecla já pertence a outra ação, as duas trocam de lugar
	const other = Object.keys(bindings).find((ak) => bindings[ak] === k && ak !== editingAction)
	if (other) bindings[other] = bindings[editingAction]
	bindings[editingAction] = k
	editingAction = null
	saveBindings()
	renderKeybinds()
})

function refreshHud() {
	hud.innerHTML =
		`<b>Alt+${bindings.zoom}</b> ${t('hudZoom')} &nbsp; <b>Alt+${bindings.release}</b> ${t('hudRelease')} &nbsp; ` +
		`<b>Alt+${bindings.level1}/${bindings.level2}/${bindings.level3}</b> ${t('hudLevel')} &nbsp; ` +
		`<b>Alt+${bindings.cursor}</b> ${t('hudCursor')} &nbsp; <b>Alt+${bindings.picker}</b> ${t('hudMenu')}`
}

// ---------- estado da câmera ----------

const state = {
	cursor: { x: 0.5, y: 0.5 },  // posição bruta do mouse (0..1, relativa à fonte)
	smooth: { x: 0.5, y: 0.5 },  // mouse suavizado (segue a câmera)
	cur: { x: 0.5, y: 0.5 },     // cursor destacado (suavização própria)
	cam: { s: 1, cx: 0.5, cy: 0.5 },
	targetScale: 1.5,
	zoomed: false,
}

// Fatores de suavização por frame (~60fps)
const EASE_CURSOR = 0.25 // resposta ao mouse
const EASE_SCALE = 0.1   // entrada/saída do zoom
const EASE_FOLLOW = 0.08 // câmera perseguindo o mouse

// ---------- captura ----------

async function startCapture() {
	if (video.srcObject) {
		for (const t of video.srcObject.getTracks()) t.stop()
		video.srcObject = null
	}
	// 30fps: metade do custo de captura, suficiente pra demo de SaaS
	// (o zoom continua animando a 60fps). Resolução conforme o preset.
	const q = getQuality(quality)
	const constraints = { frameRate: { ideal: 30, max: 30 } }
	if (q.width) {
		constraints.width = { ideal: q.width, max: q.width }
		constraints.height = { ideal: q.height, max: q.height }
	}
	const stream = await navigator.mediaDevices.getDisplayMedia({
		video: constraints,
		audio: false,
	})
	video.srcObject = stream
	await video.play()
	window.livezoom.resizeToAspect(video.videoWidth / video.videoHeight)
	// Reinicia só se a captura realmente morrer (janela fechada, etc.)
	const [track] = stream.getVideoTracks()
	track.addEventListener('ended', () => restartCapture())
}

let restarting = false
async function restartCapture() {
	if (restarting) return
	restarting = true
	try {
		await startCapture()
	} catch {
		showPicker()
	} finally {
		restarting = false
	}
}

// Se a janela capturada mudar de tamanho, reajusta a proporção
video.addEventListener('resize', () => {
	window.livezoom.resizeToAspect(video.videoWidth / video.videoHeight)
})

// ---------- cursor destacado ----------

// O cursor real só é ocultado com um cursor do Recordly ativo e o menu
// fechado (senão o usuário fica sem mouse pra clicar nas opções). Enquanto
// isso, uma réplica local (invisível pra captura) segue o mouse na tela.
function syncCursorHidden() {
	const style = CURSOR_STYLES.find((c) => c.key === cursorStyle)
	const hide = cursorStyle !== 'none' && !picker.classList.contains('show')
	window.livezoom.setCursorHidden(
		hide,
		hide && style && style.img
			? { img: style.img, hotspot: style.hotspot, size: style.size, led: Boolean(style.led) }
			: null
	)
}

// Contorno arco-íris: 8 cópias da silhueta do cursor deslocadas em círculo
function buildRgbOutline(imgUrl) {
	const outline = document.createElement('div')
	outline.className = 'rgb-outline'
	for (let k = 0; k < 8; k++) {
		const i = document.createElement('i')
		const a = (k * Math.PI) / 4
		i.style.setProperty('--dx', `${(Math.cos(a) * 1.8).toFixed(2)}px`)
		i.style.setProperty('--dy', `${(Math.sin(a) * 1.8).toFixed(2)}px`)
		i.style.webkitMaskImage = `url(${imgUrl})`
		outline.appendChild(i)
	}
	return outline
}

function applyCursorStyle() {
	const style = CURSOR_STYLES.find((c) => c.key === cursorStyle)
	cursorEl.innerHTML = ''
	cursorEl.style.margin = ''
	cursorEl.classList.toggle('on', Boolean(style && style.img))
	if (style && style.img) {
		if (style.led) cursorEl.appendChild(buildRgbOutline(style.img))
		const img = document.createElement('img')
		img.style.height = `${style.size}px`
		img.style.display = 'block'
		img.style.position = 'relative' // acima do outline
		img.addEventListener('load', () => {
			const w = style.size * (img.naturalWidth / img.naturalHeight)
			cursorEl.style.margin = `-${style.hotspot.y * style.size}px 0 0 -${style.hotspot.x * w}px`
		})
		img.src = style.img
		cursorEl.appendChild(img)
	}
	syncCursorHidden()
}

// ---------- tela de configurações ----------

function renderChips(el, options, selectedKey, onPick) {
	el.innerHTML = ''
	for (const opt of options) {
		const b = document.createElement('button')
		b.className = 'chip' + (opt.key === selectedKey ? ' active' : '')
		b.textContent = opt.i18n ? t(opt.i18n) : opt.label
		b.addEventListener('click', () => onPick(opt.key))
		el.appendChild(b)
	}
}

// No macOS não dá pra ocultar o cursor real do sistema, então os cursores
// personalizados (que dependem disso) ficam só no Windows
let cursorStylesAvailable = true
window.livezoom.platform().then((p) => {
	cursorStylesAvailable = p === 'win32'
	if (!cursorStylesAvailable) {
		cursorStyle = 'none'
		applyCursorStyle()
	}
	renderSettings()
})

function renderCursorCards() {
	cursorStyleEl.innerHTML = ''
	const styles = cursorStylesAvailable ? CURSOR_STYLES : CURSOR_STYLES.filter((c) => c.key === 'none')
	for (const c of styles) {
		const card = document.createElement('button')
		card.className = 'ccard' + (c.key === cursorStyle ? ' active' : '') + (c.led ? ' led' : '')
		const preview = document.createElement('div')
		preview.className = 'preview'
		preview.innerHTML = c.img ? `<img src="${c.img}" alt="">` : SYSTEM_CURSOR_ICON
		card.appendChild(preview)
		const span = document.createElement('span')
		span.textContent = c.i18n ? t(c.i18n) : c.label
		card.appendChild(span)
		card.addEventListener('click', () => {
			cursorStyle = c.key
			if (c.key !== 'none') lastCursorStyle = c.key
			localStorage.setItem('lz-cursor', c.key)
			applyCursorStyle()
			renderSettings()
		})
		cursorStyleEl.appendChild(card)
	}
}

function renderPrefs() {
	renderChips(document.getElementById('theme-chips'), THEMES, uiTheme, (key) => {
		uiTheme = key
		localStorage.setItem('lz-theme', key)
		applyTheme()
		renderSettings()
	})
	renderChips(document.getElementById('lang-chips'), LANGUAGES, uiLang, (key) => {
		uiLang = key
		localStorage.setItem('lz-lang', key)
		applyTranslations()
		refreshHud()
		renderSettings()
		renderSources()
	})
}

function renderSettings() {
	document.getElementById('quality-current').textContent = getQuality(quality).label
	document.getElementById('ease-current').textContent = t(CURSOR_EASES.find((c) => c.key === cursorEase).i18n)
	renderChips(qualityEl, QUALITIES, quality, (key) => {
		quality = key
		localStorage.setItem('lz-quality', key)
		renderSettings()
		if (video.srcObject) restartCapture()
	})
	renderCursorCards()
	renderChips(cursorEaseEl, CURSOR_EASES, cursorEase, (key) => {
		cursorEase = key
		localStorage.setItem('lz-cursor-ease', key)
		renderSettings()
	})
	renderKeybinds()
	renderPrefs()
}

const SECTION_ICONS = {
	source: '<svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:#ff5a5a;fill:none;stroke-width:1.8"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4" stroke-linecap="round"/></svg>',
	screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4" stroke-linecap="round"/></svg>',
	window: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="13" height="10" rx="1.5"/><path d="M8 19h13V9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

let sourceTab = localStorage.getItem('lz-source-tab')
if (sourceTab !== 'screen' && sourceTab !== 'window') sourceTab = 'screen'
let cachedSources = []

function renderSources() {
	pickerContent.innerHTML = ''
	const h = document.createElement('h2')
	h.innerHTML = `${SECTION_ICONS.source} ${t('secSource')}`
	pickerContent.appendChild(h)

	const tabs = document.createElement('div')
	tabs.className = 'chips'
	tabs.style.marginBottom = '14px'
	for (const [kind, i18nKey] of [['screen', 'tabScreens'], ['window', 'tabWindows']]) {
		const b = document.createElement('button')
		b.className = 'chip' + (kind === sourceTab ? ' active' : '')
		b.innerHTML = `${SECTION_ICONS[kind]}${t(i18nKey)}`
		b.addEventListener('click', () => {
			sourceTab = kind
			localStorage.setItem('lz-source-tab', kind)
			renderSources()
		})
		tabs.appendChild(b)
	}
	pickerContent.appendChild(tabs)

	const grid = document.createElement('div')
	grid.className = 'grid'
	for (const s of cachedSources.filter((x) => x.kind === sourceTab)) {
		const card = document.createElement('div')
		card.className = 'card'
		card.innerHTML = `<img src="${s.thumb}" alt=""><span></span>`
		card.querySelector('span').textContent = s.name
		card.addEventListener('click', async () => {
			picker.classList.remove('show')
			window.livezoom.selectSource(s.id)
			await startCapture()
			syncCursorHidden()
			flashHud()
		})
		grid.appendChild(card)
	}
	pickerContent.appendChild(grid)
}

async function showPicker() {
	picker.classList.add('show')
	renderSettings()
	syncCursorHidden()
	pickerContent.innerHTML = `<p style="color:#888">${t('loadingSources')}</p>`
	cachedSources = await window.livezoom.listSources()
	renderSources()
}

// ---------- eventos ----------

window.livezoom.onCursor((p) => {
	state.cursor = p
})

window.livezoom.onZoom((cmd) => {
	if (cmd.type === 'picker') {
		showPicker()
		return
	}
	if (cmd.type === 'restart') {
		restartCapture()
		return
	}
	if (cmd.type === 'cursor') {
		cursorStyle = cursorStyle === 'none' ? lastCursorStyle : 'none'
		localStorage.setItem('lz-cursor', cursorStyle)
		applyCursorStyle()
		flashHud()
		return
	}
	if (cmd.type === 'release') {
		state.zoomed = false
	} else if (cmd.type === 'toggle') {
		state.zoomed = !state.zoomed
		if (state.zoomed) state.targetScale = cmd.scale
	} else if (cmd.type === 'set') {
		state.zoomed = true
		state.targetScale = cmd.scale
	}
	window.livezoom.sendZoomState({ zoomed: state.zoomed, scale: state.targetScale })
	flashHud()
})

// ---------- loop de animação ----------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function tick() {
	const W = video.clientWidth
	const H = video.clientHeight
	const targetS = state.zoomed ? state.targetScale : 1

	state.smooth.x += (state.cursor.x - state.smooth.x) * EASE_CURSOR
	state.smooth.y += (state.cursor.y - state.smooth.y) * EASE_CURSOR

	state.cam.s += (targetS - state.cam.s) * EASE_SCALE
	state.cam.cx += (state.smooth.x - state.cam.cx) * EASE_FOLLOW
	state.cam.cy += (state.smooth.y - state.cam.cy) * EASE_FOLLOW

	// Centraliza (cx, cy) no viewport, sem deixar aparecer borda
	const s = state.cam.s
	const tx = clamp(W / 2 - state.cam.cx * W * s, W - W * s, 0)
	const ty = clamp(H / 2 - state.cam.cy * H * s, H - H * s, 0)
	video.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`

	if (cursorStyle !== 'none') {
		const ease = CURSOR_EASES.find((c) => c.key === cursorEase).value
		state.cur.x += (state.cursor.x - state.cur.x) * ease
		state.cur.y += (state.cursor.y - state.cur.y) * ease
		const px = state.cur.x * W * s + tx
		const py = state.cur.y * H * s + ty
		cursorEl.style.transform = `translate3d(${px}px, ${py}px, 0)`
	}

	requestAnimationFrame(tick)
}

let hudTimer
function flashHud() {
	hud.classList.add('show')
	clearTimeout(hudTimer)
	hudTimer = setTimeout(() => hud.classList.remove('show'), 2500)
}

document.getElementById('back-launcher').addEventListener('click', () => {
	window.livezoom.backToLauncher()
})

applyTheme()
applyTranslations()
applyCursorStyle()
window.livezoom.setBindings(bindings)
refreshHud()
showPicker()
tick()
