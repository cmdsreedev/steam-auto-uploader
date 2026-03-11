import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import type { Settings } from '../shared/types';

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS: Settings = {
  recordingFolder: '',
  convertedFolder: '', // Default empty, will fallback to user videos
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeRefreshToken: '',
  defaultPrivacy: 'unlisted',
};

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}
