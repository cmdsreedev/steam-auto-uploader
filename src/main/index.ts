import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';
import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { createWindow } from './window';
import './ipc'; // Importing IPC handler registration
import { startMediaServer } from './media-server';
import { ensureVideoDir, getPartialOutputPath } from './video-converter';
import { initializeFFmpeg } from './ffmpeg-setup';
import { getAllSessions, upsertSession } from './db';

// Load environment variables from .env file
dotenvConfig();

if (started) app.quit();

app.on('ready', async () => {
  // On startup, 'converting' sessions are stale (FFmpeg process is dead) — reset to 'waiting'.
  // 'Paused' sessions intentionally have a saved checkpoint and must be left as-is so the
  // user can resume from where they left off (partial resume via startPartialResume).
  const allSessions = getAllSessions();
  for (const sessionId in allSessions) {
    const record = allSessions[sessionId];
    if (record.status === 'converting') {
      // Delete the stale .mp4.part — it's an incomplete file with no checkpoint.
      // The user will need to re-convert from scratch.
      const partialPath = getPartialOutputPath(sessionId);
      if (fs.existsSync(partialPath)) {
        try { fs.unlinkSync(partialPath); } catch { /* ignore */ }
        console.log(`[Startup] Deleted stale partial file: ${partialPath}`);
      }
      upsertSession(sessionId, { status: 'waiting', conversionProgress: 0 });
      console.log(`[Startup] Reset stale 'converting' session ${sessionId} to 'waiting'`);
    }
    // 'paused' sessions keep their .mp4.part checkpoint — that's intentional.
  }

  // Initialize FFmpeg (auto-setup if needed)
  await initializeFFmpeg();

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
