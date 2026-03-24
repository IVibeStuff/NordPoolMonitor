const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  setAutoStart: (enabled) => {
    ipcRenderer.send('set-autostart', enabled);
  },
  setDarkMode: (enabled) => {
    ipcRenderer.send('set-dark-mode', enabled);
  },
  getDarkMode: () => ipcRenderer.invoke('get-dark-mode'),
  onDarkModeChange: (callback) => {
    ipcRenderer.on('dark-mode-changed', (event, enabled) => callback(enabled));
  },
  setLowPriceAlert: (enabled) => {
    ipcRenderer.send('set-low-price-alert', enabled);
  },
  setHighPriceAlert: (enabled) => {
    ipcRenderer.send('set-high-price-alert', enabled);
  },
  getAlertSettings: () => ipcRenderer.invoke('get-alert-settings'),
  onAlertSettingsChange: (callback) => {
    ipcRenderer.on('alert-settings-changed', (event, settings) => callback(settings));
  }
});
