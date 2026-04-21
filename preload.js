import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe, limited API to the renderer process
// The renderer cannot access Node or Electron directly — only these methods
contextBridge.exposeInMainWorld('api', {
    startOAuth: () => ipcRenderer.invoke('oauth:start'),
    pollOAuth: (deviceCode) => ipcRenderer.invoke('oauth:poll', deviceCode),
    syncToGithub: (formData) => ipcRenderer.invoke('github:sync', formData)
});
