const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('livezoom', {
	onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
	onZoom: (cb) => ipcRenderer.on('zoom', (_e, c) => cb(c)),
	listSources: () => ipcRenderer.invoke('list-sources'),
	selectSource: (id) => ipcRenderer.send('select-source', id),
	resizeToAspect: (r) => ipcRenderer.send('resize-to-aspect', r),
	setCursorHidden: (hidden, style) => ipcRenderer.send('set-cursor-hidden', { hidden, style }),
	setBindings: (b) => ipcRenderer.send('set-bindings', b),
	sendZoomState: (s) => ipcRenderer.send('zoom-state', s),
	backToLauncher: () => ipcRenderer.send('back-to-launcher'),
	isPackaged: () => ipcRenderer.invoke('is-packaged'),
	platform: () => ipcRenderer.invoke('platform'),
})
