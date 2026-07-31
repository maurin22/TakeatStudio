const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
	launch: (choice) => ipcRenderer.send('launch-choice', choice),
	onRecState: (cb) => ipcRenderer.on('rec-state', (_e, s) => cb(s)),
	isPackaged: () => ipcRenderer.invoke('is-packaged'),
	platform: () => ipcRenderer.invoke('platform'),
})
