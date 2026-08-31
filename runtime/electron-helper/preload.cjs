// dsh-dafeiyu 3D 渲染端 —— preload (CommonJS, sandbox 兼容)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petBridge', {
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  contextMenu: (x, y) => ipcRenderer.send('pet:context-menu', x, y),
  onState: (cb) => ipcRenderer.on('pet:state', (_e, payload) => cb(payload)),
  onPulse: (cb) => ipcRenderer.on('pet:pulse', (_e, payload) => cb(payload)),
  onInit: (cb) => ipcRenderer.on('pet:init', (_e, payload) => cb(payload)),
  onResetView: (cb) => ipcRenderer.on('pet:reset-view', () => cb()),
})