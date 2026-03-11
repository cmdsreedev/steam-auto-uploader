import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { createWindow } from './window';
import './ipc'; // Importing IPC handler registration
import { startMediaServer } from './media-server';
import { ensureVideoDir } from './video-converter';

if (started) app.quit();

app.on('ready', async () => {
  const CLEAR_DB_ON_START = true; // TEMP: Set to true to clear DB on startup for development
  if (CLEAR_DB_ON_START) {
    try {
      require('./db.js').clearDB();
      console.log('DB cleared on startup (development mode).');
    } catch (e) {
      console.error('Failed to clear DB on startup:', e);
    }
  }
  await startMediaServer();
  ensureVideoDir();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
