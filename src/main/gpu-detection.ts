/**
 * GPU Encoder Detection
 * Detects available hardware-accelerated video encoders
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings } from './settings';

export type GPUEncoder = 'cpu' | 'nvidia' | 'amd' | 'intel' | 'videotoolbox';

export interface EncoderInfo {
  type: GPUEncoder;
  name: string;
  videoCodec: string; // FFmpeg codec name (e.g., 'h264_nvenc')
  supported: boolean;
  description: string;
}

// Get FFmpeg path - checks settings, auto-downloaded location, common install paths, then system PATH
function getFfmpegPath(): string {
  const settings = loadSettings();

  // 1. User-configured path in settings
  if (settings.ffmpegPath && settings.ffmpegPath.trim()) {
    const ffmpegExe = path.join(settings.ffmpegPath, 'ffmpeg.exe');
    if (fs.existsSync(ffmpegExe)) {
      console.log(`[GPU Detection] Using settings path: ${ffmpegExe}`);
      return ffmpegExe;
    }
    console.warn(`[GPU Detection] Settings ffmpegPath set but exe not found: ${ffmpegExe}`);
  }

  // 2. Auto-downloaded location (walk subdirs in case of versioned folder)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron');
  const autoDir = path.join(app.getPath('userData'), 'ffmpeg');
  if (fs.existsSync(autoDir)) {
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
    const found = findExe(autoDir);
    if (found) {
      console.log(`[GPU Detection] Using auto-downloaded FFmpeg: ${found}`);
      return found;
    }
  }

  // 3. Common Windows install locations
  const commonPaths = [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      console.log(`[GPU Detection] Found FFmpeg at common path: ${p}`);
      return p;
    }
  }

  // 4. System PATH fallback
  console.warn('[GPU Detection] FFmpeg not found in any known location, trying system PATH');
  return 'ffmpeg';
}

const AVAILABLE_ENCODERS: EncoderInfo[] = [
  {
    type: 'nvidia',
    name: 'NVIDIA NVENC',
    videoCodec: 'h264_nvenc',
    supported: false,
    description: 'Hardware encoding using NVIDIA GPU (fastest)',
  },
  {
    type: 'amd',
    name: 'AMD VCE',
    videoCodec: 'h264_amf',
    supported: false,
    description: 'Hardware encoding using AMD GPU',
  },
  {
    type: 'intel',
    name: 'Intel Quick Sync',
    videoCodec: 'h264_qsv',
    supported: false,
    description: 'Hardware encoding using Intel integrated GPU',
  },
  {
    type: 'videotoolbox',
    name: 'Apple VideoToolbox',
    videoCodec: 'h264_videotoolbox',
    supported: false,
    description: 'Hardware encoding using macOS GPU',
  },
  {
    type: 'cpu',
    name: 'CPU (Software)',
    videoCodec: 'libx264',
    supported: true,
    description: 'Software encoding (fallback, slowest)',
  },
];

/**
 * Detect which hardware encoders are available on this system
 */
export function detectAvailableEncoders(): EncoderInfo[] {
  try {
    // Try to get list of available encoders from FFmpeg
    const ffmpegPath = getFfmpegPath();
    console.log(`[GPU Detection] Using FFmpeg: ${ffmpegPath}`);

    // Use -encoders (not -codecs) — directly lists available encoders including GPU ones
    const output = execSync(`"${ffmpegPath}" -encoders 2>&1`, { encoding: 'utf-8', timeout: 10000 });
    console.log(`[GPU Detection] FFmpeg encoders output (${output.length} chars)`);

    // Log lines that contain our target codecs
    const relevantLines = output.split('\n').filter(l =>
      l.includes('nvenc') || l.includes('amf') || l.includes('qsv') || l.includes('videotoolbox')
    );
    if (relevantLines.length > 0) {
      console.log('[GPU Detection] Found GPU encoder lines:', relevantLines.map(l => l.trim()));
    } else {
      console.log('[GPU Detection] No GPU encoder lines found in output');
      // Show a sample of output for debugging
      console.log('[GPU Detection] Sample output:', output.substring(0, 500));
    }

    const encoders = AVAILABLE_ENCODERS.map((encoder) => {
      const isSupported = output.includes(encoder.videoCodec);

      if (isSupported) {
        console.log(`✓ GPU encoder available: ${encoder.name} (${encoder.videoCodec})`);
      } else if (encoder.type !== 'cpu') {
        console.log(`✗ GPU encoder NOT available: ${encoder.name} (${encoder.videoCodec})`);
      }

      return {
        ...encoder,
        supported: encoder.type === 'cpu' ? true : isSupported, // CPU is always available
      };
    });

    console.log(`[GPU Detection] Summary:`, encoders.filter(e => e.supported).map(e => e.name).join(', '));
    return encoders;
  } catch (err) {
    console.error('[GPU Detection] Error detecting encoders:', err);
    console.error('[GPU Detection] Falling back to CPU-only encoding');
    // Fallback to CPU-only
    return AVAILABLE_ENCODERS.filter((e) => e.type === 'cpu');
  }
}

/**
 * Get the best available encoder (prefer GPU over CPU)
 */
export function getBestAvailableEncoder(): EncoderInfo {
  const encoders = detectAvailableEncoders();
  const supported = encoders.filter((e) => e.supported);

  // Prefer GPU encoders in order of speed
  const order: GPUEncoder[] = ['nvidia', 'intel', 'amd', 'videotoolbox', 'cpu'];

  for (const type of order) {
    const encoder = supported.find((e) => e.type === type);
    if (encoder) {
      return encoder;
    }
  }

  // Fallback to CPU (should always be available)
  return supported[0] || AVAILABLE_ENCODERS.find((e) => e.type === 'cpu')!;
}

/**
 * Get encoder info by type
 */
export function getEncoderInfo(type: GPUEncoder): EncoderInfo | undefined {
  return AVAILABLE_ENCODERS.find((e) => e.type === type);
}
