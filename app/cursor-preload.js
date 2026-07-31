const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cursorwin', {
	onStyle: (cb) => ipcRenderer.on('style', (_e, s) => cb(s)),
})
