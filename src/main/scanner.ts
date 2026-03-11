import path from 'node:path';
import fs from 'node:fs';
import type { VideoFile } from '../shared/types';
import { getSession, getAllSessions, removeSession, upsertSession } from './db';
import { loadSettings } from './settings';
import { app } from 'electron';
import { getGameInfo } from './steam';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Parse ISO 8601 duration (PT1H48M46.232S) to seconds */
function parsePTDuration(pt: string): number {
  const match = pt.match(/PT(?:(\d+)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return 0;
  const hours = parseFloat(match[1] || '0');
  const minutes = parseFloat(match[2] || '0');
  const seconds = parseFloat(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

interface SessionInfo {
  durationSeconds: number;
  width: string;
  height: string;
  codec: string;
}

function parseMPD(xml: string): SessionInfo | null {
  const durationMatch = xml.match(/mediaPresentationDuration="([^"]+)"/);
  if (!durationMatch) return null;

  const durationSeconds = parsePTDuration(durationMatch[1]);

  const videoAdaptation = xml.match(/<AdaptationSet[^>]*contentType="video"[^>]*>([\s\S]*?)<\/AdaptationSet>/);
  let width = '0';
  let height = '0';
  let codec = 'unknown';

  if (videoAdaptation) {
    const rep = videoAdaptation[1].match(/<Representation[^>]*/);
    if (rep) {
      width = rep[0].match(/\swidth="(\d+)"/)?.[1] ?? '0';
      height = rep[0].match(/\sheight="(\d+)"/)?.[1] ?? '0';
      codec = rep[0].match(/codecs="([^"]+)"/)?.[1] ?? 'unknown';
    }
  }

  return { durationSeconds, width, height, codec };
}

/** Extract Steam App ID from session folder name like bg_944080_20260305_230352 */
function extractAppId(folderName: string): string {
  const match = folderName.match(/^bg_(\d+)_/);
  return match ? match[1] : '';
}

/**
 * Scan a Steam recording folder.
 *
 * Expected structure:
 *   recordingFolder/
 *     video/
 *       bg_<appId>_<date>_<time>/
 *         session.mpd
 *         *.m4s
 *     timelines/
 *     gamerecording.pb
 */
export async function scanFolder(folderPath: string): Promise<VideoFile[]> {
  if (!folderPath || !fs.existsSync(folderPath)) return [];

  const videoDir = path.join(folderPath, 'video');
  if (!fs.existsSync(videoDir)) return [];

  let sessionDirs: fs.Dirent[];
  try {
    sessionDirs = fs.readdirSync(videoDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessions: VideoFile[] = [];
  const foundIds = new Set<string>();

  for (const entry of sessionDirs) {
    if (!entry.isDirectory()) continue;

    const sessionDir = path.join(videoDir, entry.name);
    const mpdPath = path.join(sessionDir, 'session.mpd');

    if (!fs.existsSync(mpdPath)) continue;

    let xml: string;
    let mpdStat: fs.Stats;
    try {
      xml = fs.readFileSync(mpdPath, 'utf-8');
      mpdStat = fs.statSync(mpdPath);
    } catch {
      continue;
    }

    const info = parseMPD(xml);
    if (!info) continue;

    const appId = extractAppId(entry.name);
    const id = Buffer.from(mpdPath).toString('base64url').slice(-20);
    foundIds.add(id);
    const dbRecord = getSession(id);

    // Check if converted file exists
    const settings = loadSettings();
    const convertedFolder = settings.convertedFolder && settings.convertedFolder.trim()
      ? settings.convertedFolder
      : app.getPath('videos') + '/SteamAutoUploader';
    const videoOutputPath = path.join(convertedFolder, `${id}.mp4`);
    let status = dbRecord?.status ?? 'waiting';
    // Always use the correct converted path based on settings
    let convertedPath = fs.existsSync(videoOutputPath) ? videoOutputPath : undefined;
    if (status === 'done' && !convertedPath) {
      // Converted file missing, update DB status
      status = 'waiting';
      convertedPath = undefined;
      // Update DB
      if (dbRecord) {
        upsertSession(id, { status: 'waiting', convertedPath: undefined });
      }
    }
    // Fetch game info and thumbnail
    let gameName = appId || path.basename(folderPath);
    let thumbnailUrl = '';
    let thumbnailPath = '';
    let gameInfo = null;
    try {
      gameInfo = await getGameInfo(appId);
    } catch {}
    if (gameInfo) {
      gameName = gameInfo.name || gameName;
      thumbnailUrl = gameInfo.thumbnailUrl || '';
      thumbnailPath = gameInfo.thumbnailPath || '';
    }
    sessions.push({
      id,
      appId,
      game: gameName,
      thumbnailUrl: thumbnailPath || thumbnailUrl,
      sessionIndex: sessions.length,
      duration: formatDuration(info.durationSeconds),
      durationSeconds: info.durationSeconds,
      resolution: `${info.width}x${info.height}`,
      codec: info.codec,
      mpdPath,
      videoDir: sessionDir,
      status,
      progress: status === 'done' ? 100 : 0,
      conversionProgress: dbRecord?.conversionProgress ?? 0,
      convertedPath,
      modifiedAt: mpdStat.mtimeMs,
    });
  }

  // Remove DB records for files that no longer exist
  const allDb = getAllSessions();
  for (const dbId of Object.keys(allDb)) {
    if (!foundIds.has(dbId)) {
      removeSession(dbId);
    }
  }

  return sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
}
