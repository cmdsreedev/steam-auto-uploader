import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron';
import type { Settings, FileStatus } from '../shared/types';
import { loadSettings, saveSettings } from './settings';
import { scanFolder } from './scanner';
import { upsertSession, getAllSessions, getSession } from './db';
import { getGameInfo } from './steam';
import { getMediaServerPort, registerSessionDir } from './media-server';
import { convertVideo, getVideoOutputPath, getPartialOutputPath, cancelConversion, isConversionActive, convertVideoForce, pauseConversion, resumeConversion, isPaused, startPartialResume } from './video-converter';
import { authorizeYouTube, uploadVideoToYouTube, cancelYouTubeAuth } from './youtube';
import { getGoogleOAuthConfig } from './google-oauth-config';
import { detectAvailableEncoders } from './gpu-detection';
import fs from 'node:fs';
import path from 'node:path';

// Track conversion progress and current timemark per session
const conversionProgress = new Map<string, number>();
const conversionTimemark = new Map<string, string>(); // last known HH:MM:SS position

// Handle app quit — clean up any live FFmpeg processes.
// 'converting': FFmpeg dies mid-encode (no clean shutdown possible) → reset to 'waiting'.
// 'paused': FFmpeg was already told to quit gracefully (pauseConversion sends "q" to stdin)
//   and has likely already exited. If still running for any reason, force-kill it but
//   keep the partial file + pauseTimemark intact so the user can partial-resume next launch.
app.on('before-quit', () => {
  const allDb = getAllSessions();
  for (const sessionId in allDb) {
    const record = allDb[sessionId];
    if (!isConversionActive(sessionId)) continue;

    if (record.status === 'converting') {
      cancelConversion(sessionId);
      upsertSession(sessionId, { status: 'waiting', conversionProgress: 0 });
      console.log(`[Quit] Reset active conversion to waiting: ${sessionId}`);
    } else if (record.status === 'paused') {
      // Force-kill if still running (e.g. graceful quit didn't finish yet),
      // but preserve the partial file and checkpoint for partial-resume next launch.
      cancelConversion(sessionId, /* keepPartialFile */ true);
      console.log(`[Quit] Force-killed lingering FFmpeg for paused session (checkpoint preserved): ${sessionId}`);
    }
  }
});
ipcMain.handle('deleteProcessedFile', async (_event, sessionId: string, convertedPath: string) => {
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

ipcMain.handle('encoders:detect', () => {
  const encoders = detectAvailableEncoders();
  return encoders.map((e) => ({
    type: e.type,
    name: e.name,
    supported: e.supported,
    description: e.description,
  }));
});

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  // Only allow https URLs to prevent abuse
  if (url.startsWith('https://')) shell.openExternal(url);
});

ipcMain.handle('shell:showItemInFolder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

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
  const settings = loadSettings();
  const convertedFolder = settings.convertedFolder && settings.convertedFolder.trim()
    ? settings.convertedFolder
    : app.getPath('videos') + '/SteamAutoUploader';
  const outputPath = path.join(convertedFolder, `${sessionId}.mp4`);

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
    onTimemark: (timemark) => {
      conversionTimemark.set(sessionId, timemark);
    },
    onComplete: (convertedPath) => {
      conversionProgress.delete(sessionId);
      conversionTimemark.delete(sessionId);
      upsertSession(sessionId, { status: 'done', conversionProgress: 100, convertedPath, pauseTimemark: undefined });
    },
    onError: (error) => {
      conversionProgress.delete(sessionId);
      conversionTimemark.delete(sessionId);
      upsertSession(sessionId, { status: 'error', conversionProgress: 0, errorMessage: error });
      console.error(`Conversion failed for ${sessionId}:`, error);
    },
  });
  return { status: 'started' };
});

ipcMain.handle('conversion:startForce', (_event, sessionId: string, mpdPath: string) => {
  // Use convertedFolder from settings
  const settings = loadSettings();
  const convertedFolder = settings.convertedFolder && settings.convertedFolder.trim()
    ? settings.convertedFolder
    : app.getPath('videos') + '/SteamAutoUploader';
  const outputPath = path.join(convertedFolder, `${sessionId}.mp4`);

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
    onTimemark: (timemark) => {
      conversionTimemark.set(sessionId, timemark);
    },
    onComplete: (convertedPath) => {
      conversionProgress.delete(sessionId);
      conversionTimemark.delete(sessionId);
      upsertSession(sessionId, { status: 'done', conversionProgress: 100, convertedPath, pauseTimemark: undefined });
    },
    onError: (error) => {
      conversionProgress.delete(sessionId);
      conversionTimemark.delete(sessionId);
      upsertSession(sessionId, { status: 'error', conversionProgress: 0, errorMessage: error });
      console.error(`Conversion failed for ${sessionId}:`, error);
    },
  });
  return { status: 'started' };
});

ipcMain.handle('conversion:cancel', (_event, sessionId: string) => {
  try {
    // Stop any active or paused conversion
    cancelConversion(sessionId);
    conversionProgress.delete(sessionId);

    // Clean up partial output files (.mp4.part checkpoint and any stray .mp4)
    const partialPath = getPartialOutputPath(sessionId);
    const finalPath = getVideoOutputPath(sessionId);

    let deleted = false;
    for (const targetPath of [partialPath, finalPath]) {
      if (!fs.existsSync(targetPath)) continue;
      // Retry up to 3 times in case file is briefly locked
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.unlinkSync(targetPath);
          console.log(`Deleted partial file: ${targetPath}`);
          deleted = true;
          break;
        } catch (err) {
          if (attempt < 2) {
            console.warn(`Attempt ${attempt + 1} to delete ${path.basename(targetPath)} failed, retrying...`);
          } else {
            console.error(`Failed to delete ${targetPath} after 3 attempts:`, err);
          }
        }
      }
    }

    // Reset session to clean state
    upsertSession(sessionId, {
      status: 'waiting',
      conversionProgress: 0,
      errorMessage: undefined, // Clear any previous error
      convertedPath: undefined, // Clear converted path
    });

    console.log(`Conversion cancelled for ${sessionId} (partial file ${deleted ? 'deleted' : 'not found'})`);
    return { status: 'cancelled', fileDeleted: deleted };
  } catch (err) {
    console.error(`Error cancelling conversion for ${sessionId}:`, err);
    throw err;
  }
});

ipcMain.handle('conversion:getProgress', (_event, sessionId: string) => {
  return {
    progress: conversionProgress.get(sessionId) ?? 0,
    isActive: isConversionActive(sessionId),
  };
});

ipcMain.handle('conversion:pause', async (_event, sessionId: string) => {
  // Snapshot timemark BEFORE calling pauseConversion (it sends "q" to stdin and returns immediately)
  const timemark = conversionTimemark.get(sessionId);
  const progress = conversionProgress.get(sessionId);
  console.log(`[Pause] Requesting graceful quit. checkpoint: timemark=${timemark ?? 'none'} progress=${progress ?? 'none'}%`);

  pauseConversion(sessionId); // sends "q" to FFmpeg stdin

  // Save checkpoint immediately so the DB reflects 'paused' state
  upsertSession(sessionId, {
    status: 'paused',
    ...(timemark ? { pauseTimemark: timemark } : {}),
    ...(progress !== undefined ? { conversionProgress: progress } : {}),
  });

  // Wait up to 10s for FFmpeg to finish its graceful shutdown.
  // This ensures the partial file is fully written before the renderer re-scans.
  const deadline = Date.now() + 10_000;
  while (isConversionActive(sessionId) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (isConversionActive(sessionId)) {
    console.warn(`[Pause] FFmpeg did not exit within 10s — partial file may be incomplete`);
  } else {
    console.log(`[Pause] FFmpeg exited cleanly — partial file ready`);
  }

  return { status: 'paused' };
});

ipcMain.handle('conversion:resume', (_event, sessionId: string, mpdPath: string) => {
  // Case 1: FFmpeg is still running (e.g. user clicked Resume while graceful quit is in-flight).
  // Wait — do NOT call resumeConversion (it's a no-op now). Fall through to checkpoint logic.
  if (isConversionActive(sessionId)) {
    console.warn(`[Resume] FFmpeg still active for ${sessionId} (mid-graceful-quit?). Falling through to checkpoint.`);
    // Don't return here — fall through so we use startPartialResume or reset to waiting
  }

  // Case 2: App was restarted — check for a saved checkpoint to resume from
  const record = getSession(sessionId);
  const outputPath = getVideoOutputPath(sessionId);
  const partialPath = getPartialOutputPath(sessionId); // .mp4.part checkpoint

  const hasCheckpoint = record?.pauseTimemark &&
    fs.existsSync(partialPath) &&
    fs.statSync(partialPath).size > 1024 * 1024; // checkpoint must be >1 MB

  if (hasCheckpoint) {
    const resumeTimemark = record!.pauseTimemark!;
    const progressOffset = record?.conversionProgress ?? 0;
    console.log(`[Resume] Resuming from checkpoint: ${resumeTimemark} (${progressOffset}% done)`);
    console.log(`[Resume] Checkpoint file: ${partialPath}`);

    upsertSession(sessionId, { status: 'converting' });

    startPartialResume({
      sessionId,
      mpdPath,
      outputPath,
      onProgress: (progress) => {
        conversionProgress.set(sessionId, progress);
        upsertSession(sessionId, { conversionProgress: progress });
      },
      onTimemark: (timemark) => {
        conversionTimemark.set(sessionId, timemark);
      },
      onComplete: (convertedPath) => {
        conversionProgress.delete(sessionId);
        conversionTimemark.delete(sessionId);
        upsertSession(sessionId, { status: 'done', conversionProgress: 100, convertedPath, pauseTimemark: undefined });
      },
      onError: (error) => {
        conversionProgress.delete(sessionId);
        conversionTimemark.delete(sessionId);
        upsertSession(sessionId, { status: 'error', conversionProgress: 0, errorMessage: error });
        console.error(`[Resume] Failed for ${sessionId}:`, error);
      },
    }, resumeTimemark, progressOffset);

    return { status: 'resuming' };
  }

  // Case 3: No checkpoint (.mp4.part missing) — restart from scratch automatically.
  console.warn(`[Resume] No checkpoint for ${sessionId} — restarting conversion from scratch`);
  upsertSession(sessionId, { status: 'converting', conversionProgress: 0, pauseTimemark: undefined });

  convertVideo({
    sessionId,
    mpdPath,
    outputPath,
    onProgress: (progress) => {
      conversionProgress.set(sessionId, progress);
      upsertSession(sessionId, { conversionProgress: progress });
    },
    onTimemark: (timemark) => {
      conversionTimemark.set(sessionId, timemark);
    },
    onComplete: (convertedPath) => {
      conversionProgress.delete(sessionId);
      conversionTimemark.delete(sessionId);
      upsertSession(sessionId, { status: 'done', conversionProgress: 100, convertedPath, pauseTimemark: undefined });
    },
    onError: (error) => {
      conversionProgress.delete(sessionId);
      conversionTimemark.delete(sessionId);
      upsertSession(sessionId, { status: 'error', conversionProgress: 0, errorMessage: error });
      console.error(`[Resume→Restart] Failed for ${sessionId}:`, error);
    },
  });

  return { status: 'restarted' };
});

ipcMain.handle('upload:start', async (_event, sessionId: string, convertedPath: string, title: string, description = '') => {
  console.log('[Upload] upload:start called');
  console.log('[Upload] sessionId:', sessionId);
  console.log('[Upload] convertedPath:', convertedPath);
  console.log('[Upload] title:', title);

  const settings = loadSettings();
  console.log('[Upload] youtubeRefreshToken present:', !!settings.youtubeRefreshToken);

  // Credentials come from .env (google-oauth-config), not settings.json
  let oauthConfig: { clientId: string; clientSecret: string };
  try {
    oauthConfig = getGoogleOAuthConfig();
    console.log('[Upload] OAuth credentials loaded OK');
  } catch (err) {
    const msg = 'Google OAuth credentials missing — check .env file';
    console.error('[Upload] ✗', msg, err);
    upsertSession(sessionId, { status: 'error', errorMessage: msg });
    return { status: 'error' };
  }

  if (!settings.youtubeRefreshToken) {
    const msg = 'YouTube not authorized. Please connect your account in Settings.';
    console.error('[Upload] ✗', msg);
    upsertSession(sessionId, { status: 'error', errorMessage: msg });
    return { status: 'error' };
  }

  const fs = await import('node:fs');
  if (!fs.existsSync(convertedPath)) {
    const msg = `Converted file not found: ${convertedPath}`;
    console.error('[Upload] ✗', msg);
    upsertSession(sessionId, { status: 'error', errorMessage: msg });
    return { status: 'error' };
  }

  console.log('[Upload] Starting upload to YouTube...');
  upsertSession(sessionId, { status: 'uploading', conversionProgress: 0 });

  uploadVideoToYouTube({
    clientId: oauthConfig.clientId,
    clientSecret: oauthConfig.clientSecret,
    refreshToken: settings.youtubeRefreshToken,
    filePath: convertedPath,
    title,
    description,
    privacy: settings.defaultPrivacy,
    onProgress: (progress) => {
      console.log(`[Upload] Progress: ${progress}%`);
      upsertSession(sessionId, { conversionProgress: progress });
    },
  }).then((videoId) => {
    console.log('[Upload] ✓ Upload complete, videoId:', videoId);
    upsertSession(sessionId, { status: 'done', youtubeVideoId: videoId, conversionProgress: 100 });
  }).catch((err: Error) => {
    console.error('[Upload] ✗ Upload failed:', err.message);
    upsertSession(sessionId, { status: 'error', errorMessage: `Upload failed: ${err.message ?? 'Unknown error'}` });
  });

  return { status: 'started' };
});

ipcMain.handle('youtube:authorize', async () => {
  try {
    console.log('Starting YouTube authorization...');
    const config = getGoogleOAuthConfig();
    const result = await authorizeYouTube(config.clientId, config.clientSecret);
    console.log(`YouTube authorization successful for channel: ${result.channelName}`);
    const settings = loadSettings();
    saveSettings({
      ...settings,
      youtubeRefreshToken: result.refreshToken,
      youtubeChannelId: result.channelId,
      youtubeChannelName: result.channelName,
      youtubeChannelThumbnail: result.channelThumbnail,
    });
    return result;
  } catch (err) {
    console.error('YouTube authorization failed:', err);
    throw err;
  }
});

ipcMain.handle('youtube:disconnect', () => {
  try {
    console.log('Disconnecting YouTube account...');
    const settings = loadSettings();
    saveSettings({
      ...settings,
      youtubeRefreshToken: '',
      youtubeChannelId: undefined,
      youtubeChannelName: undefined,
      youtubeChannelThumbnail: undefined,
    });
    console.log('YouTube account disconnected');
  } catch (err) {
    console.error('Failed to disconnect YouTube account:', err);
    throw err;
  }
});

ipcMain.handle('youtube:cancel', () => {
  try {
    console.log('Cancelling YouTube authorization...');
    cancelYouTubeAuth();
    console.log('YouTube authorization cancelled');
  } catch (err) {
    console.error('Failed to cancel YouTube authorization:', err);
    throw err;
  }
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
