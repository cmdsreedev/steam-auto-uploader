import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

export interface GameInfo {
  name: string;
  thumbnailUrl: string;
  thumbnailPath?: string;
}

const gameInfoPath = () => path.join(app.getPath('userData'), 'steam-game-info.json');

function loadGameInfo(): Record<string, GameInfo> {
  try {
    return JSON.parse(fs.readFileSync(gameInfoPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveGameInfo(info: Record<string, GameInfo>): void {
  fs.writeFileSync(gameInfoPath(), JSON.stringify(info, null, 2), 'utf-8');
}

export function getStoredGameInfo(appId: string): GameInfo | undefined {
  const info = loadGameInfo();
  return info[appId];
}

export function upsertGameInfo(appId: string, updates: Partial<GameInfo>): void {
  const info = loadGameInfo();
  info[appId] = { ...info[appId], ...updates };
  saveGameInfo(info);
}

export function getAllGameInfo(): Record<string, GameInfo> {
  return loadGameInfo();
}
