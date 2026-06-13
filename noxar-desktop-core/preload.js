const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onClipboardTrigger: (callback) => {
    ipcRenderer.on('clipboard-trigger', (_event, value) => callback(value));
  },
  onWindowRestoreUi: (callback) => {
    ipcRenderer.on('window-restore-ui', () => callback());
  },
  minimizeToCoin: () => ipcRenderer.send('window-minimize-to-coin'),
  expandFromCoin: () => ipcRenderer.send('window-expand-from-coin'),
  dragWindow: (data) => ipcRenderer.send('window-drag', data)
});
