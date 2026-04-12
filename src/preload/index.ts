import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
    clearDB: () => ipcRenderer.invoke('db:clear'),
  selectFolder:      ()                    => ipcRenderer.invoke('folder:select'),
  scanFiles:         (folder)              => ipcRenderer.invoke('files:scan', folder),
  loadSettings:      ()                    => ipcRenderer.invoke('settings:load'),
  saveSettings:      (settings)            => ipcRenderer.invoke('settings:save', settings),
  detectEncoders:    ()                    => ipcRenderer.invoke('encoders:detect'),
  updateSessionStatus: (id, status, extra) => ipcRenderer.invoke('session:updateStatus', id, status, extra),
  getGameInfo:         (appId)             => ipcRenderer.invoke('steam:gameInfo', appId),
  getMediaPort:        ()                  => ipcRenderer.invoke('media:port'),
  getPreviewUrl:       (id, dir)           => ipcRenderer.invoke('media:preview', id, dir),
  startConversion:     (id, mpdPath)       => ipcRenderer.invoke('conversion:start', id, mpdPath),
  startConversionForce: (id, mpdPath)      => ipcRenderer.invoke('conversion:startForce', id, mpdPath),
  cancelConversion:    (id)                => ipcRenderer.invoke('conversion:cancel', id),
  pauseConversion:     (id)                => ipcRenderer.invoke('conversion:pause', id),
  resumeConversion:    (id, mpdPath)       => ipcRenderer.invoke('conversion:resume', id, mpdPath),
  getConversionProgress: (id)              => ipcRenderer.invoke('conversion:getProgress', id),
  startUpload:         (id, convertedPath, title, description) => ipcRenderer.invoke('upload:start', id, convertedPath, title, description),
  deleteProcessedFile: (id, convertedPath) => ipcRenderer.invoke('deleteProcessedFile', id, convertedPath),
  youtubeAuthorize:    () => ipcRenderer.invoke('youtube:authorize'),
  youtubeDisconnect:   () => ipcRenderer.invoke('youtube:disconnect'),
  youtubeCancel:       () => ipcRenderer.invoke('youtube:cancel'),
  openExternal:        (url: string)      => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder:    (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
};

contextBridge.exposeInMainWorld('api', api);

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
