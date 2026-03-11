import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
    clearDB: () => ipcRenderer.invoke('db:clear'),
  selectFolder:      ()                    => ipcRenderer.invoke('folder:select'),
  scanFiles:         (folder)              => ipcRenderer.invoke('files:scan', folder),
  loadSettings:      ()                    => ipcRenderer.invoke('settings:load'),
  saveSettings:      (settings)            => ipcRenderer.invoke('settings:save', settings),
  updateSessionStatus: (id, status, extra) => ipcRenderer.invoke('session:updateStatus', id, status, extra),
  getGameInfo:         (appId)             => ipcRenderer.invoke('steam:gameInfo', appId),
  getMediaPort:        ()                  => ipcRenderer.invoke('media:port'),
  getPreviewUrl:       (id, dir)           => ipcRenderer.invoke('media:preview', id, dir),
  startConversion:     (id, mpdPath)       => ipcRenderer.invoke('conversion:start', id, mpdPath),
  startConversionForce: (id, mpdPath)      => ipcRenderer.invoke('conversion:startForce', id, mpdPath),
  cancelConversion:    (id)                => ipcRenderer.invoke('conversion:cancel', id),
  getConversionProgress: (id)              => ipcRenderer.invoke('conversion:getProgress', id),
  startUpload:         (id)                => ipcRenderer.invoke('upload:start', id),
  deleteProcessedFile: (id, convertedPath) => ipcRenderer.invoke('deleteProcessedFile', id, convertedPath),
};

contextBridge.exposeInMainWorld('api', api);

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
