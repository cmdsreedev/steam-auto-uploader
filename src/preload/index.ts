import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
  selectFolder:  ()         => ipcRenderer.invoke('folder:select'),
  scanFiles:     (folder)   => ipcRenderer.invoke('files:scan', folder),
  loadSettings:  ()         => ipcRenderer.invoke('settings:load'),
  saveSettings:  (settings) => ipcRenderer.invoke('settings:save', settings),
};

contextBridge.exposeInMainWorld('api', api);

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
