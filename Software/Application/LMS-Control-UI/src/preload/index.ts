import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('lmsAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Connection
  connect: (port: string) => ipcRenderer.invoke('api:connect', port),
  disconnect: () => ipcRenderer.invoke('api:disconnect'),

  // Slaves
  getSlaves: () => ipcRenderer.invoke('api:getSlaves'),
  pairSlave: (id: number) => ipcRenderer.invoke('api:pairSlave', id),
  unpairSlave: (id: number) => ipcRenderer.invoke('api:unpairSlave', id),
  pingSlave: (id: number) => ipcRenderer.invoke('api:pingSlave', id),

  // Commands
  sendCommand: (id: number, message: string) =>
    ipcRenderer.invoke('api:sendCommand', id, message),
  broadcast: (message: string) => ipcRenderer.invoke('api:broadcast', message),

  // Stats
  getStats: () => ipcRenderer.invoke('api:getStats'),
});

