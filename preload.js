const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, limited API to the renderer process
// The renderer cannot access Node or Electron directly — only these methods
contextBridge.exposeInMainWorld('api', {
    startOAuth: () => ipcRenderer.invoke('oauth:start'),
    pollOAuth: (deviceCode) => ipcRenderer.invoke('oauth:poll', deviceCode),
    syncToGithub: (formData) => ipcRenderer.invoke('github:sync', formData),
    onStatusUpdate: (callback) => ipcRenderer.on('status:update', (_event, message) => callback(message)),
    getUserOrgs: () => ipcRenderer.invoke('github:getorgs')
});
