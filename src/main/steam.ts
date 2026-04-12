import { net, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {
  getStoredGameInfo,
  upsertGameInfo,
  GameInfo as StoredGameInfo,
} from './steam-game-info';
import { getMediaServerPort } from './media-server';

const memoryCache = new Map<string, StoredGameInfo>();
const thumbnailDir = path.join(app.getPath('userData'), 'steam-thumbnails');

function ensureThumbnailDir() {
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
}

async function downloadThumbnail(url: string, appId: string): Promise<string | undefined> {
  if (!url) return undefined;
  ensureThumbnailDir();
  const ext = path.extname(url).split('?')[0] || '.jpg';
  const filename = `${appId}${ext}`;
  const localPath = path.join(thumbnailDir, filename);
  if (fs.existsSync(localPath)) {
    // Only use if file is not empty
    try {
      const stat = fs.statSync(localPath);
      if (stat.size > 0) return filename;
    } catch (e) { /* ignore if stat fails */ }
  }
  try {
    const response = await net.fetch(url);
    if (!response.ok) return undefined;
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return undefined;
    fs.writeFileSync(localPath, Buffer.from(buffer));
    // Double-check file size
    const stat = fs.statSync(localPath);
    if (stat.size > 0) return filename;
    // Remove empty file
    fs.unlinkSync(localPath);
    return undefined;
  } catch {
    return undefined;
  }
}

function constructThumbnailUrl(filename: string): string {
  const port = getMediaServerPort();
  return `http://127.0.0.1:${port}/thumbnail/${encodeURIComponent(filename)}`;
}

function addThumbnailUrls(info: StoredGameInfo): StoredGameInfo {
  if (info.thumbnailPath && !info.thumbnailPath.startsWith('http')) {
    return { ...info, thumbnailPath: constructThumbnailUrl(info.thumbnailPath) };
  }
  return info;
}

export async function getGameInfo(appId: string): Promise<StoredGameInfo | null> {
  if (!appId) return null;

  // Check in-memory cache
  if (memoryCache.has(appId)) {
    return addThumbnailUrls(memoryCache.get(appId)!);
  }

  // Check persistent cache
  const stored = getStoredGameInfo(appId);
  if (stored) {
    memoryCache.set(appId, stored);
    return addThumbnailUrls(stored);
  }

  // Stagger API calls: wait random 200-800ms
  await new Promise(r => setTimeout(r, 200 + Math.random() * 600));

  try {
    const response = await net.fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}`
    );
    const json = await response.json();
    const data = json[appId];

    if (!data?.success || !data.data) return null;

    const info: StoredGameInfo = {
      name: data.data.name,
      thumbnailUrl: data.data.header_image || '',
    };

    // Download thumbnail and store locally
    const thumbnailFilename = await downloadThumbnail(info.thumbnailUrl, appId);
    if (thumbnailFilename) {
      // Store just the filename in the DB (not the full URL, to handle port changes)
      info.thumbnailPath = thumbnailFilename;
    }

    // Persist to DB
    upsertGameInfo(appId, info);
    memoryCache.set(appId, info);
    return addThumbnailUrls(info);
  } catch {
    return null;
  }
}
