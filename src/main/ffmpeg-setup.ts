/**
 * FFmpeg Auto-Setup
 * Automatically downloads and configures FFmpeg on first run if needed
 */

import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import { execSync } from 'node:child_process';
import { app } from 'electron';
import { loadSettings, saveSettings } from './settings';

const FFMPEG_DIR = path.join(app.getPath('userData'), 'ffmpeg');
const FFMPEG_BIN = path.join(FFMPEG_DIR, 'bin', 'ffmpeg.exe');

interface DownloadProgress {
  percent: number;
  size: number;
  downloaded: number;
}

// downloadProgress tracks download status (can be extended for UI updates in future)

/**
 * Check if FFmpeg is properly installed with GPU support
 */
export function checkFFmpegInstallation(): { installed: boolean; hasGPUSupport: boolean } {
  const settings = loadSettings();

  // Check if user configured a custom path
  if (settings.ffmpegPath && fs.existsSync(settings.ffmpegPath)) {
    const ffmpegExe = path.join(settings.ffmpegPath, 'ffmpeg.exe');
    if (fs.existsSync(ffmpegExe)) {
      try {
        const output = execSync(`"${ffmpegExe}" -codecs 2>&1`, { encoding: 'utf-8' });
        const hasGPUSupport = output.includes('h264_nvenc') || output.includes('h264_amf') || output.includes('h264_qsv');
        return { installed: true, hasGPUSupport };
      } catch {
        return { installed: false, hasGPUSupport: false };
      }
    }
  }

  // Check auto-download dir (walk subdirs — zip extracts into a versioned subfolder)
  if (fs.existsSync(FFMPEG_DIR)) {
    const findExe = (dir: string): string | null => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const found = findExe(path.join(dir, entry.name));
          if (found) return found;
        } else if (entry.name === 'ffmpeg.exe') {
          return path.join(dir, entry.name);
        }
      }
      return null;
    };
    const ffmpegExe = findExe(FFMPEG_DIR);
    if (ffmpegExe) {
      try {
        const output = execSync(`"${ffmpegExe}" -codecs 2>&1`, { encoding: 'utf-8' });
        const hasGPUSupport = output.includes('h264_nvenc') || output.includes('h264_amf') || output.includes('h264_qsv');
        return { installed: true, hasGPUSupport };
      } catch {
        return { installed: true, hasGPUSupport: false };
      }
    }
  }

  return { installed: false, hasGPUSupport: false };
}

// BtbN GitHub releases — stable, always available, includes GPU encoders
// Note: /releases/latest/download/ is the correct GitHub format for latest release assets
const FFMPEG_DOWNLOAD_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';
const ESTIMATED_SIZE = 90 * 1024 * 1024; // ~90MB

/**
 * Download a file from a URL, following redirects, with progress callbacks.
 */
function downloadUrl(url: string, onProgress?: (progress: DownloadProgress) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doGet = (targetUrl: string, redirectsLeft: number) => {
      // Pick http or https based on URL — GitHub CDN redirects to S3 over plain http
      const isHttps = targetUrl.startsWith('https://');
      const client = isHttps ? https : http;
      console.log(`[FFmpeg Setup] GET ${targetUrl.substring(0, 80)}...`);

      client.get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) { reject(new Error('Too many redirects')); return; }
          console.log('[FFmpeg Setup] Redirect →', res.headers.location.substring(0, 80));
          res.resume(); // drain
          doGet(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} from ${targetUrl}`));
          return;
        }
        const totalSize = parseInt(res.headers['content-length'] ?? '0', 10) || ESTIMATED_SIZE;
        console.log(`[FFmpeg Setup] Downloading ${Math.round(totalSize / 1024 / 1024)}MB...`);
        const chunks: Buffer[] = [];
        let downloaded = 0;

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          downloaded += chunk.length;
          onProgress?.({
            percent: Math.min(Math.round((downloaded / totalSize) * 100), 99),
            size: totalSize,
            downloaded,
          });
        });
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`[FFmpeg Setup] Download complete: ${Math.round(buffer.length / 1024 / 1024)}MB`);
          onProgress?.({ percent: 100, size: buffer.length, downloaded: buffer.length });
          resolve(buffer);
        });
        res.on('error', (err) => reject(new Error(`Stream error: ${err.message}`)));
      }).on('error', (err) => reject(new Error(`Request error: ${err.message}`)));
    };
    doGet(url, 10);
  });
}

/**
 * Download FFmpeg from GitHub BtbN releases.
 */
function downloadFFmpeg(onProgress?: (progress: DownloadProgress) => void): Promise<Buffer> {
  console.log('[FFmpeg Setup] Downloading FFmpeg from GitHub (BtbN/FFmpeg-Builds)...');
  console.log('[FFmpeg Setup] URL:', FFMPEG_DOWNLOAD_URL);
  console.log('[FFmpeg Setup] This may take 1-2 minutes (~90MB)...');
  return downloadUrl(FFMPEG_DOWNLOAD_URL, onProgress);
}

/**
 * Extract ZIP and locate the bin folder (handles nested versioned subdirectory).
 * BtbN zip structure: ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe
 */
function extractAndLocateBin(zipBuffer: Buffer, targetDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const tempZip = path.join(app.getPath('temp'), 'ffmpeg-temp.zip');
      fs.writeFileSync(tempZip, zipBuffer);

      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      console.log('[FFmpeg Setup] Extracting zip (this takes ~30s)...');
      try {
        execSync(
          `powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${targetDir}' -Force"`,
          { encoding: 'utf-8', timeout: 120000 },
        );
      } catch (err) {
        reject(new Error(`PowerShell extraction failed: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      try { fs.unlinkSync(tempZip); } catch { /* ignore */ }

      // Find bin/ffmpeg.exe anywhere inside the extracted folder (handles nested versioned dir)
      const findBin = (dir: string): string | null => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const sub = path.join(dir, entry.name);
            if (entry.name === 'bin') {
              const candidate = path.join(sub, 'ffmpeg.exe');
              if (fs.existsSync(candidate)) return sub;
            }
            const deeper = findBin(sub);
            if (deeper) return deeper;
          }
        }
        return null;
      };

      const binDir = findBin(targetDir);
      if (!binDir) {
        reject(new Error('Extracted zip but could not locate bin/ffmpeg.exe inside it'));
        return;
      }

      console.log('[FFmpeg Setup] Found bin directory:', binDir);
      resolve(binDir);
    } catch (err) {
      reject(err);
    }
  });
}

/** Find the resolved ffmpeg.exe path using the same priority as gpu-detection */
export function resolveFFmpegExe(): string | null {
  const settings = loadSettings();
  if (settings.ffmpegPath) {
    const exe = path.join(settings.ffmpegPath, 'ffmpeg.exe');
    if (fs.existsSync(exe)) return exe;
  }
  if (fs.existsSync(FFMPEG_DIR)) {
    const findExe = (dir: string): string | null => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { const f = findExe(path.join(dir, e.name)); if (f) return f; }
        else if (e.name === 'ffmpeg.exe') return path.join(dir, e.name);
      }
      return null;
    };
    const found = findExe(FFMPEG_DIR);
    if (found) return found;
  }
  return null;
}

/** Download + install FFmpeg — callable from IPC so Settings can trigger it with progress */
export async function downloadAndInstallFFmpeg(
  onProgress?: (pct: number, mb: number) => void
): Promise<{ success: boolean; binPath?: string; error?: string }> {
  try {
    const buffer = await downloadFFmpeg((p) => onProgress?.(p.percent, Math.round(p.downloaded / 1024 / 1024)));
    console.log('[FFmpeg Setup] Extracting...');
    const binDir = await extractAndLocateBin(buffer, FFMPEG_DIR);
    const exe = path.join(binDir, 'ffmpeg.exe');
    if (!fs.existsSync(exe)) return { success: false, error: 'ffmpeg.exe not found after extraction' };

    const settings = loadSettings();
    settings.ffmpegPath = binDir;
    saveSettings(settings);
    console.log('[FFmpeg Setup] ✓ Installed to', binDir);
    return { success: true, binPath: binDir };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[FFmpeg Setup] ✗ Download failed:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Initialize FFmpeg on app startup — non-blocking if already installed.
 */
export async function initializeFFmpeg(): Promise<void> {
  try {
    console.log('[FFmpeg Setup] Checking FFmpeg installation and GPU support...');
    const { installed, hasGPUSupport } = checkFFmpegInstallation();

    // If FFmpeg is installed with GPU support, we're done
    if (installed && hasGPUSupport) {
      console.log('[FFmpeg Setup] ✓ FFmpeg with GPU support is ready');
      return;
    }

    // If FFmpeg exists but lacks GPU support, or doesn't exist, download full build
    if (installed && !hasGPUSupport) {
      console.log('[FFmpeg Setup] ⚠ Existing FFmpeg missing GPU encoder support - downloading full build...');
    } else {
      console.log('[FFmpeg Setup] FFmpeg not found - downloading full build...');
    }

    // Download full FFmpeg build
    const buffer = await downloadFFmpeg((progress) => {
      if (progress.percent % 10 === 0 || progress.percent === 100) {
        console.log(`[FFmpeg Setup] Download: ${progress.percent}% (${Math.round(progress.downloaded / 1024 / 1024)}MB)`);
      }
    });

    // Extract and locate bin directory (handles nested versioned subfolder)
    console.log('[FFmpeg Setup] Extracting FFmpeg...');
    const binDir = await extractAndLocateBin(buffer, FFMPEG_DIR);

    // Verify installation
    const ffmpegExe = path.join(binDir, 'ffmpeg.exe');
    if (fs.existsSync(ffmpegExe)) {
      try {
        const output = execSync(`"${ffmpegExe}" -codecs 2>&1`, { encoding: 'utf-8' });
        const hasGPU = output.includes('h264_nvenc') || output.includes('h264_amf') || output.includes('h264_qsv');
        if (hasGPU) {
          console.log('[FFmpeg Setup] ✓ Full FFmpeg build with GPU support installed');
        } else {
          console.warn('[FFmpeg Setup] ⚠ FFmpeg installed but no GPU codecs detected (CPU-only)');
        }
      } catch {
        console.warn('[FFmpeg Setup] ⚠ Could not verify GPU support');
      }

      // Save the discovered bin path to settings
      const settings = loadSettings();
      settings.ffmpegPath = binDir;
      saveSettings(settings);
      console.log('[FFmpeg Setup] ✓ FFmpeg path saved to settings:', binDir);
    } else {
      console.error('[FFmpeg Setup] ✗ Extraction done but ffmpeg.exe not found at:', ffmpegExe);
    }
  } catch (err) {
    console.error(
      '[FFmpeg Setup] ✗ Auto-setup failed:',
      err instanceof Error ? err.message : String(err),
    );
    console.error('[FFmpeg Setup] ');
    console.error('[FFmpeg Setup] Options:');
    console.error('[FFmpeg Setup] 1. Check your internet connection');
    console.error('[FFmpeg Setup] 2. Download FFmpeg manually from: https://www.gyan.dev/ffmpeg/builds/');
    console.error('[FFmpeg Setup] 3. Extract to: C:\\ffmpeg\\bin');
    console.error('[FFmpeg Setup] 4. Configure path in Settings → FFmpeg');
    console.error('[FFmpeg Setup] ');
  }
}
