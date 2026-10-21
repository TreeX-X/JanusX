import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('remoteTransport', {
  send: (message: unknown) => ipcRenderer.send('remote:transport', message),
  onMessage: (callback: (message: unknown) => void) => ipcRenderer.on('remote:transport', (_event, message) => callback(message)),
})
