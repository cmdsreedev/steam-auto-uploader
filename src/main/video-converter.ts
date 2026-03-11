import path from 'node:path';
import fs from 'node:fs';
import { ipcMain, app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import { loadSettings } from './settings';

// Set FFmpeg path from custom installation
const ffmpegPath = path.join('D:', 'Projects', 'ffmpeg', 'bin', 'ffmpeg.exe');
const ffprobePath = path.join('D:', 'Projects', 'ffmpeg', 'bin', 'ffprobe.exe');

try {
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  console.log('FFmpeg paths configured:', { ffmpegPath, ffprobePath });
} catch (e) {
  console.error('Failed to set FFmpeg paths:', e);
}

interface ConversionJob {
  sessionId: string;
  mpdPath: string;
  outputPath: string;
  onProgress: (progress: number) => void;
  onError: (error: string) => void;
  onComplete?: (outputPath: string) => void;
}

const activeJobs = new Map<string, ffmpeg.FfmpegCommand>();

function videoOutputDir(): string {
  const settings = loadSettings();
  if (settings.convertedFolder && settings.convertedFolder.trim()) {
    return settings.convertedFolder;
  }
  return path.join(app.getPath('videos'), 'SteamAutoUploader');
}

export function ensureVideoDir(): void {
  const dir = videoOutputDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getVideoOutputPath(sessionId: string): string {
  return path.join(videoOutputDir(), `${sessionId}.mp4`);
}

export function convertVideo(job: ConversionJob): void {
  // Cancel if already running
  if (activeJobs.has(job.sessionId)) {
    job.onError('Conversion already in progress');
    return;
  }

  ensureVideoDir();

  // Check if source exists
  if (!fs.existsSync(job.mpdPath)) {
    job.onError('Source MPD file not found');
    return;
  }

  // If already converted and file exists, treat as processed
  if (fs.existsSync(job.outputPath)) {
    job.onComplete?.(job.outputPath);
    return;
  }

  const command = ffmpeg(job.mpdPath)
    .output(job.outputPath)
    .outputOptions([
      '-c:v h264',        // H.264 codec (YouTube compatible)
      '-preset veryfast', // Fast encoding
      '-c:a aac',         // AAC audio codec
      '-b:a 128k',        // Audio bitrate
      '-movflags +faststart', // Enable streaming
    ])
    .on('start', () => {
      job.onProgress(1);
    })
    .on('progress', (progress: any) => {
      // Estimate progress based on timemark
      const percent = Math.min(Math.round(progress.percent || 0), 99);
      job.onProgress(percent);
    })
    .on('end', () => {
      activeJobs.delete(job.sessionId);
      job.onProgress(100);
      job.onComplete?.(job.outputPath);
    })
    .on('error', (err: any) => {
      activeJobs.delete(job.sessionId);
      // Clean up partial file
      if (fs.existsSync(job.outputPath)) {
        try {
          fs.unlinkSync(job.outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      job.onError(err.message || 'Conversion failed');
    });

  activeJobs.set(job.sessionId, command);
  command.run();
}

export function cancelConversion(sessionId: string): void {
  const command = activeJobs.get(sessionId);
  if (command) {
    command.kill('SIGKILL');
    activeJobs.delete(sessionId);
    
    // Clean up any partial output file
    const outputPath = getVideoOutputPath(sessionId);
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
        console.log(`Cleaned up partial file: ${outputPath}`);
      } catch (error) {
        console.error(`Failed to clean up partial file ${outputPath}:`, error);
      }
    }
  }
}

export function convertVideoForce(job: ConversionJob): void {
  // Cancel if already running
  if (activeJobs.has(job.sessionId)) {
    job.onError('Conversion already in progress');
    return;
  }

  ensureVideoDir();

  // Check if source exists
  if (!fs.existsSync(job.mpdPath)) {
    job.onError('Source MPD file not found');
    return;
  }

  // If file exists, delete it first (force replacement)
  if (fs.existsSync(job.outputPath)) {
    try {
      fs.unlinkSync(job.outputPath);
    } catch (error) {
      job.onError(`Failed to remove existing file: ${error}`);
      return;
    }
  }

  const command = ffmpeg(job.mpdPath)
    .output(job.outputPath)
    .outputOptions([
      '-c:v h264',        // H.264 codec (YouTube compatible)
      '-preset veryfast', // Fast encoding
      '-c:a aac',         // AAC audio codec
      '-b:a 128k',        // Audio bitrate
      '-movflags +faststart', // Enable streaming
    ])
    .on('start', () => {
      job.onProgress(1);
    })
    .on('progress', (progress: any) => {
      // Estimate progress based on timemark
      const percent = Math.min(Math.round(progress.percent || 0), 99);
      job.onProgress(percent);
    })
    .on('end', () => {
      activeJobs.delete(job.sessionId);
      job.onProgress(100);
      job.onComplete?.(job.outputPath);
    })
    .on('error', (err: any) => {
      activeJobs.delete(job.sessionId);
      // Clean up partial file
      if (fs.existsSync(job.outputPath)) {
        try {
          fs.unlinkSync(job.outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      job.onError(err.message || 'Conversion failed');
    });

  activeJobs.set(job.sessionId, command);
  command.run();
}

export function isConversionActive(sessionId: string): boolean {
  return activeJobs.has(sessionId);
}
