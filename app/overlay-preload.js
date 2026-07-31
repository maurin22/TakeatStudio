const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlay', {
	onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
})
