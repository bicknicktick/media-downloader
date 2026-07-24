const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electron', {
  test: () => 'electron api working',
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openFileLocation: (filepath) => ipcRenderer.invoke('open-file-location', filepath)
});

console.log('Electron API exposed');
