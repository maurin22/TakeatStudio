const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('takeatmap', {
	backToLauncher: () => ipcRenderer.send('back-to-launcher'),
	saveBoard: (data, name) => ipcRenderer.invoke('map-save', data, name),
	openBoard: () => ipcRenderer.invoke('map-open'),
})
