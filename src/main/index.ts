import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import type { Settings, VideoFile } from '../shared/types.js';

if (started) app.quit();

// ── Settings persistence ──────────────────────────────────────────────────────

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS: Settings = {
  recordingFolder: '',
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeRefreshToken: '',
  defaultPrivacy: 'unlisted',
};

function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: Settings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

// ── File scanning ─────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm']);

function humanSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function scanFolder(folderPath: string): VideoFile[] {
  if (!folderPath || !fs.existsSync(folderPath)) return [];

  const files: VideoFile[] = [];

  function walk(dir: string, gameName: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, entry.name);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) continue;

      let stat: fs.Stats;
      try { stat = fs.statSync(fullPath); } catch { continue; }

      files.push({
        id: Buffer.from(fullPath).toString('base64url').slice(-16),
        name: entry.name,
        filePath: fullPath,
        size: humanSize(stat.size),
        sizeMB: stat.size / 1e6,
        game: gameName,
        status: 'waiting',
        progress: 0,
        modifiedAt: stat.mtimeMs,
      });
    }
  }

  walk(folderPath, 'Unknown');
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

function registerIPC(mainWindow: BrowserWindow) {
  ipcMain.handle('folder:select', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('files:scan', (_event, folder: string) => scanFolder(folder));

  ipcMain.handle('settings:load', () => loadSettings());

  ipcMain.handle('settings:save', (_event, settings: Settings) => saveSettings(settings));

  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindowInstance: BrowserWindow | null = null;

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindowInstance = mainWindow;
  return mainWindow;
};

app.on('ready', () => {
  const mainWindow = createWindow();
  registerIPC(mainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
