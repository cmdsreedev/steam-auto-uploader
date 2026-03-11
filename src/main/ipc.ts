import { BrowserWindow, ipcMain, dialog } from 'electron';
import type { Settings, FileStatus } from '../shared/types';
import { loadSettings, saveSettings } from './settings';
import { scanFolder } from './scanner';
import { upsertSession, getAllSessions } from './db';
import { getGameInfo } from './steam';
import { getMediaServerPort, registerSessionDir } from './media-server';
import { convertVideo, getVideoOutputPath, cancelConversion, isConversionActive, convertVideoForce } from './video-converter';
import fs from 'node:fs';
import { app } from 'electron';

// Track conversion progress per session
const conversionProgress = new Map<string, number>();

// Cleanup partial conversions and reset DB state on app quit
app.on('before-quit', () => {
  const allDb = getAllSessions();
  for (const sessionId in allDb) {
    const record = allDb[sessionId];
    // If conversion is not done, remove partial file and reset DB
    if (record.status === 'converting' || (record.conversionProgress && record.conversionProgress < 100)) {
      const outputPath = getVideoOutputPath(sessionId);
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch {}
      }
      upsertSession(sessionId, { status: 'waiting', conversionProgress: 0, errorMessage: undefined });
    }
  }
});
      ipcMain.handle('deleteProcessedFile', async (_event, sessionId: string, convertedPath: string) => {
        const fs = require('node:fs');
        try {
          if (fs.existsSync(convertedPath)) {
            fs.unlinkSync(convertedPath);
          }
          // Remove convertedPath from DB
          upsertSession(sessionId, { convertedPath: undefined, status: 'done', conversionProgress: undefined });
          return { status: 'deleted' };
        } catch (err) {
          return { status: 'error', error: err.message || 'Failed to delete file' };
        }
      });
    ipcMain.handle('db:clear', () => {
      const { clearDB } = require('./db.js');
      clearDB();
      return { status: 'cleared' };
    });
  ipcMain.handle('folder:select', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('files:scan', async (_event, folder: string) => await scanFolder(folder));

  ipcMain.handle('settings:load', () => loadSettings());

  ipcMain.handle('settings:save', (_event, settings: Settings) => saveSettings(settings));

  ipcMain.handle('session:updateStatus', (_event, id: string, status: FileStatus, extra?: { youtubeVideoId?: string; convertedPath?: string }) => {
    upsertSession(id, { status, ...extra });
  });

  ipcMain.handle('steam:gameInfo', (_event, appId: string) => getGameInfo(appId));

  ipcMain.handle('media:port', () => getMediaServerPort());

  ipcMain.handle('media:preview', (_event, sessionId: string, videoDir: string) => {
    registerSessionDir(sessionId, videoDir);
    const port = getMediaServerPort();
    return `http://127.0.0.1:${port}/${sessionId}/session.mpd`;
  });

  ipcMain.handle('conversion:start', (_event, sessionId: string, mpdPath: string) => {
    // Use convertedFolder from settings
    const settings = require('./settings').loadSettings();
    const convertedFolder = settings.convertedFolder && settings.convertedFolder.trim()
      ? settings.convertedFolder
      : require('electron').app.getPath('videos') + '/SteamAutoUploader';
    const outputPath = require('path').join(convertedFolder, `${sessionId}.mp4`);
    
    // Update status to converting immediately
    upsertSession(sessionId, { status: 'converting', conversionProgress: 0 });
    
    convertVideo({
      sessionId,
      mpdPath,
      outputPath,
      onProgress: (progress) => {
        conversionProgress.set(sessionId, progress);
        upsertSession(sessionId, { conversionProgress: progress });
      },
      onComplete: (convertedPath) => {
        conversionProgress.delete(sessionId);
        // Set status to 'done' after conversion completes
        upsertSession(sessionId, { status: 'done', conversionProgress: 100, convertedPath });
      },
      onError: (error) => {
        conversionProgress.delete(sessionId);
        upsertSession(sessionId, { status: 'error', conversionProgress: 0, errorMessage: error });
        console.error(`Conversion failed for ${sessionId}:`, error);
      },
    });
    return { status: 'started' };
  });

  ipcMain.handle('conversion:startForce', (_event, sessionId: string, mpdPath: string) => {
    // Use convertedFolder from settings
    const settings = require('./settings').loadSettings();
    const convertedFolder = settings.convertedFolder && settings.convertedFolder.trim()
      ? settings.convertedFolder
      : require('electron').app.getPath('videos') + '/SteamAutoUploader';
    const outputPath = require('path').join(convertedFolder, `${sessionId}.mp4`);
    
    // Update status to converting immediately
    upsertSession(sessionId, { status: 'converting', conversionProgress: 0 });
    
    convertVideoForce({
      sessionId,
      mpdPath,
      outputPath,
      onProgress: (progress) => {
        conversionProgress.set(sessionId, progress);
        upsertSession(sessionId, { conversionProgress: progress });
      },
      onComplete: (convertedPath) => {
        conversionProgress.delete(sessionId);
        // Set status to 'done' after conversion completes
        upsertSession(sessionId, { status: 'done', conversionProgress: 100, convertedPath });
      },
      onError: (error) => {
        conversionProgress.delete(sessionId);
        upsertSession(sessionId, { status: 'error', conversionProgress: 0, errorMessage: error });
        console.error(`Conversion failed for ${sessionId}:`, error);
      },
    });
    return { status: 'started' };
  });

  ipcMain.handle('conversion:cancel', (_event, sessionId: string) => {
    cancelConversion(sessionId);
    conversionProgress.delete(sessionId);
    // Always clean up partial output file using convertedFolder from settings
    const settings = require('./settings').loadSettings();
    const convertedFolder = settings.convertedFolder && settings.convertedFolder.trim()
      ? settings.convertedFolder
      : require('electron').app.getPath('videos') + '/SteamAutoUploader';
    const outputPath = require('path').join(convertedFolder, `${sessionId}.mp4`);
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (error) {
        console.error(`Failed to clean up partial file ${outputPath}:`, error);
      }
    }
    upsertSession(sessionId, { status: 'waiting', conversionProgress: 0 });
    return { status: 'cancelled' };
  });

  ipcMain.handle('conversion:getProgress', (_event, sessionId: string) => {
    return {
      progress: conversionProgress.get(sessionId) ?? 0,
      isActive: isConversionActive(sessionId),
    };
  });

  ipcMain.handle('upload:start', (_event, sessionId: string) => {
    upsertSession(sessionId, { status: 'uploading' });
    return { status: 'started' };
  });

  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
