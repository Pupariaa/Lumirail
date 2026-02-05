'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronStorage', {
  getItem: (key) => ipcRenderer.invoke('storage:getItem', key),
  setItem: (key, value) => ipcRenderer.invoke('storage:setItem', key, value),
  removeItem: (key) => ipcRenderer.invoke('storage:removeItem', key),
  clear: () => ipcRenderer.invoke('storage:clear'),
})

const serialConnectedCbs = []
const serialDisconnectedCbs = []
const serialDataCbs = []

ipcRenderer.on('serial:connected', () => serialConnectedCbs.forEach((cb) => cb()))
ipcRenderer.on('serial:disconnected', () => serialDisconnectedCbs.forEach((cb) => cb()))
ipcRenderer.on('serial:data', (event, data) => serialDataCbs.forEach((cb) => cb(data)))

contextBridge.exposeInMainWorld('electronSerial', {
  listPorts: () => ipcRenderer.invoke('serial:listPorts'),
  connectTo: (path) => ipcRenderer.invoke('serial:connectTo', path),
  onConnected: (cb) => {
    serialConnectedCbs.push(cb)
    return () => { const i = serialConnectedCbs.indexOf(cb); if (i >= 0) serialConnectedCbs.splice(i, 1) }
  },
  onDisconnected: (cb) => {
    serialDisconnectedCbs.push(cb)
    return () => { const i = serialDisconnectedCbs.indexOf(cb); if (i >= 0) serialDisconnectedCbs.splice(i, 1) }
  },
  onData: (cb) => {
    serialDataCbs.push(cb)
    return () => { const i = serialDataCbs.indexOf(cb); if (i >= 0) serialDataCbs.splice(i, 1) }
  },
  write: (data) => ipcRenderer.invoke('serial:write', data),
  disconnect: () => ipcRenderer.invoke('serial:disconnect'),
  isConnected: () => ipcRenderer.invoke('serial:isConnected'),
})
