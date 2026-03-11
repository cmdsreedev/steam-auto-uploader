export function clearDB(): void {
  cache = {};
  persist();
}
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import type { FileStatus } from '../shared/types.js';

export interface SessionRecord {
  status: FileStatus;
  youtubeVideoId?: string;
  convertedPath?: string;
  conversionProgress?: number; // 0-100, tracks conversion progress
  errorMessage?: string; // error message for failed conversions
  updatedAt: number;
}

type DB = Record<string, SessionRecord>;

const dbPath = () => path.join(app.getPath('userData'), 'sessions-db.json');

let cache: DB | null = null;

function load(): DB {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(dbPath(), 'utf-8'));
    return cache!;
  } catch {
    cache = {};
    return cache;
  }
}

function persist(): void {
  fs.writeFileSync(dbPath(), JSON.stringify(cache, null, 2), 'utf-8');
}

export function getSession(id: string): SessionRecord | undefined {
  return load()[id];
}

export function getAllSessions(): DB {
  return { ...load() };
}

export function upsertSession(id: string, updates: Partial<SessionRecord>): void {
  const db = load();
  db[id] = { ...db[id], ...updates, updatedAt: Date.now() } as SessionRecord;
  persist();
}

export function removeSession(id: string): void {
  const db = load();
  delete db[id];
  persist();
}
