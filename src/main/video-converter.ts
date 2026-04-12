import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import { loadSettings } from './settings';
import { getEncoderInfo, getBestAvailableEncoder } from './gpu-detection';

// Get FFmpeg paths - use bundled version or user-configured path
function getFfmpegPaths(): { ffmpeg: string; ffprobe: string } {
  const settings = loadSettings();

  // If user has configured a custom path, use it
  if (settings.ffmpegPath && fs.existsSync(settings.ffmpegPath)) {
    const ffmpegExe = path.join(settings.ffmpegPath, 'ffmpeg.exe');
    const ffprobeExe = path.join(settings.ffmpegPath, 'ffprobe.exe');
    if (fs.existsSync(ffmpegExe) && fs.existsSync(ffprobeExe)) {
      console.log('Using custom FFmpeg path:', settings.ffmpegPath);
      return { ffmpeg: ffmpegExe, ffprobe: ffprobeExe };
    }
  }

  // Try to use bundled FFmpeg from npm packages
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

    if (fs.existsSync(ffmpegInstaller.path) && fs.existsSync(ffprobeInstaller.path)) {
      console.log('Using bundled FFmpeg from npm package');
      return { ffmpeg: ffmpegInstaller.path, ffprobe: ffprobeInstaller.path };
    }
  } catch (e) {
    console.warn('Failed to load bundled FFmpeg:', e);
  }

  // Fallback - assume FFmpeg is in system PATH
  console.warn('Using FFmpeg from system PATH (may not be available)');
  return {
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe'
  };
}

// Paths are applied lazily before each conversion so settings changes take effect without restart
function applyFfmpegPaths(): void {
  const { ffmpeg: ffmpegExe, ffprobe: ffprobeExe } = getFfmpegPaths();
  ffmpeg.setFfmpegPath(ffmpegExe);
  ffmpeg.setFfprobePath(ffprobeExe);
}

interface FFmpegProgress {
  percent?: number;
  frames?: number;
  currentFps?: number;
  currentKbps?: number;
  totalSize?: number;
  out_time_ms?: number;
  out_time?: string;
  timemark?: string;
}

interface ConversionJob {
  sessionId: string;
  mpdPath: string;
  outputPath: string;
  onProgress: (progress: number) => void;
  onTimemark?: (timemark: string) => void; // called every progress tick with current HH:MM:SS.ms position
  onError: (error: string) => void;
  onComplete?: (outputPath: string) => void;
}

const activeJobs = new Map<string, ffmpeg.FfmpegCommand>();
const pausedJobs = new Set<string>();

function videoOutputDir(): string {
  const settings = loadSettings();
  if (settings.convertedFolder && settings.convertedFolder.trim()) {
    return settings.convertedFolder;
  }
  return path.join(app.getPath('videos'), 'SteamAutoUploader');
}

interface EncodingConfig {
  inputOptions: string[];
  outputOptions: string[];
}

function getEncodingOptions(): EncodingConfig {
  const settings = loadSettings();
  let encoderType = settings.gpuEncoder || 'cpu';

  // Look up the codec name for this encoder type.
  // NOTE: getEncoderInfo() returns entries from the *static* AVAILABLE_ENCODERS template
  // where all GPU types have supported=false — do NOT use .supported here.
  // The user already confirmed availability via the Settings UI detect step.
  let encoderInfo = getEncoderInfo(encoderType as any);
  if (!encoderInfo) {
    // Completely unknown type — fall back to CPU
    console.warn(`[Converter] Unknown encoder type '${encoderType}', falling back to CPU`);
    encoderInfo = getBestAvailableEncoder();
    encoderType = encoderInfo.type;
  }

  const codec = encoderInfo?.videoCodec || 'libx264';
  const audio = ['-c:a aac', '-b:a 192k'];
  const movflags = '-movflags +faststart';

  console.log(`[Converter] Encoder: ${encoderInfo?.name} (${codec}) [type=${encoderType}]`);

  switch (encoderType) {
    case 'nvidia':
      // hwaccel cuda: decode on GPU. hwaccel_output_format cuda: keep frames in GPU memory
      // so encode never has to copy back to CPU. Cuts CPU load from ~90% to ~15%.
      return {
        inputOptions: ['-hwaccel cuda', '-hwaccel_output_format cuda'],
        outputOptions: [
          `-c:v ${codec}`,
          '-preset p4',     // p1=fastest … p7=best quality (p4 = balanced)
          '-tune hq',       // high-quality NVENC tuning
          '-rc vbr',        // variable bitrate
          '-cq 23',         // quality target (lower = better, 0-51)
          '-b:v 0',         // let -cq control rate, no hard bitrate cap
          ...audio,
          movflags,
        ],
      };

    case 'amd':
      return {
        inputOptions: ['-hwaccel d3d11va'],
        outputOptions: [
          `-c:v ${codec}`,
          '-quality quality',
          '-rc vbr_latency',
          '-qp_i 22', '-qp_p 24',
          ...audio,
          movflags,
        ],
      };

    case 'intel':
      return {
        inputOptions: ['-hwaccel qsv', '-qsv_device auto'],
        outputOptions: [
          `-c:v ${codec}`,
          '-preset fast',
          '-global_quality 23',
          '-look_ahead 1',
          ...audio,
          movflags,
        ],
      };

    case 'videotoolbox':
      return {
        inputOptions: [],
        outputOptions: [
          `-c:v ${codec}`,
          '-q:v 65',
          ...audio,
          movflags,
        ],
      };

    case 'cpu':
    default:
      return {
        inputOptions: [],
        outputOptions: [
          `-c:v ${codec}`,
          '-preset veryfast',
          '-crf 23',
          ...audio,
          movflags,
        ],
      };
  }
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

/** Path of the in-progress partial file while conversion/pause is active. */
export function getPartialOutputPath(sessionId: string): string {
  return path.join(videoOutputDir(), `${sessionId}.mp4.part`);
}

/**
 * Steam MPDs are often type="dynamic" (live DASH), which causes FFmpeg to stop
 * after one segment window (~1 min). This patches a copy to type="static" and
 * ensures mediaPresentationDuration is preserved so FFmpeg reads the full file.
 */
function patchMpdForOffline(mpdPath: string): string {
  try {
    let xml = fs.readFileSync(mpdPath, 'utf-8');
    const isDynamic = xml.includes('type="dynamic"');
    const hasDuration = xml.includes('mediaPresentationDuration=');

    console.log(`[Converter] MPD type=${isDynamic ? 'dynamic' : 'static'}, hasDuration=${hasDuration}`);

    if (!isDynamic) return mpdPath; // Already static, use as-is

    // Patch dynamic → static
    xml = xml.replace(/type="dynamic"/, 'type="static"');

    // Remove live-only attributes that confuse FFmpeg
    xml = xml.replace(/\s*minimumUpdatePeriod="[^"]*"/, '');
    xml = xml.replace(/\s*timeShiftBufferDepth="[^"]*"/, '');
    xml = xml.replace(/\s*suggestedPresentationDelay="[^"]*"/, '');
    xml = xml.replace(/\s*publishTime="[^"]*"/, '');
    xml = xml.replace(/\s*availabilityStartTime="[^"]*"/, '');

    const tempPath = mpdPath.replace('session.mpd', 'session_patched.mpd');
    fs.writeFileSync(tempPath, xml, 'utf-8');
    console.log('[Converter] Patched MPD written to:', tempPath);
    return tempPath;
  } catch (err) {
    console.warn('[Converter] Could not patch MPD, using original:', err);
    return mpdPath;
  }
}

function runFfmpegConversion(job: ConversionJob): void {
  const mpdSource = patchMpdForOffline(job.mpdPath);
  const { inputOptions, outputOptions } = getEncodingOptions();

  // Write to .mp4.part during conversion so the scanner never mistakes an
  // incomplete file for a finished one.  On success we rename to .mp4.
  const partialPath = job.outputPath.replace(/\.mp4$/, '.mp4.part');

  console.log(`[Converter] Starting conversion: ${job.sessionId}`);
  console.log(`[Converter] Input: ${mpdSource}`);
  console.log(`[Converter] Output (partial): ${partialPath}`);
  if (inputOptions.length) console.log(`[Converter] HW decode flags: ${inputOptions.join(' ')}`);

  const command = ffmpeg(mpdSource)
    .inputOptions(inputOptions)
    .output(partialPath)
    .outputOptions([...outputOptions, '-f mp4']) // force mp4 container — FFmpeg can't infer from .mp4.part
    .on('start', (cmdLine: string) => {
      console.log('[Converter] FFmpeg command:', cmdLine);
      // Capture PID for Windows pause/resume
      const proc = (command as any).ffmpegProc;
      if (proc?.pid) {
        jobPids.set(job.sessionId, proc.pid);
        console.log(`[Converter] FFmpeg PID: ${proc.pid}`);
      }
      job.onProgress(1);
    })
    .on('stderr', (line: string) => {
      if (line.includes('Duration') || line.includes('Stream #') || line.includes('Error') || line.includes('error')) {
        console.log('[Converter] FFmpeg:', line.trim());
      }
    })
    .on('progress', (progress: FFmpegProgress) => {
      const percent = Math.min(Math.round(progress.percent || 0), 99);
      if (percent > 0) console.log(`[Converter] Progress: ${percent}% @ ${progress.timemark}`);
      job.onProgress(percent);
      if (progress.timemark) job.onTimemark?.(progress.timemark);
    })
    .on('end', () => {
      if (mpdSource !== job.mpdPath) { try { fs.unlinkSync(mpdSource); } catch { /* ignore */ } }
      activeJobs.delete(job.sessionId);
      jobPids.delete(job.sessionId);

      // If the user requested a graceful pause, do NOT call onComplete.
      // Keep the .mp4.part file as the checkpoint for partial resume.
      // The IPC pause handler already saved the timemark and set status='paused'.
      if (gracefulPauseJobs.has(job.sessionId)) {
        gracefulPauseJobs.delete(job.sessionId);
        console.log(`[Converter] Graceful pause finalised for ${job.sessionId} — checkpoint: ${partialPath}`);
        return;
      }

      // Rename .mp4.part → .mp4 now that the file is complete.
      try {
        fs.renameSync(partialPath, job.outputPath);
      } catch (renameErr: any) {
        console.error('[Converter] Failed to rename partial file:', renameErr.message);
        job.onError(`Failed to finalise output file: ${renameErr.message}`);
        return;
      }

      job.onProgress(100);
      console.log(`[Converter] ✓ Done: ${job.outputPath}`);
      job.onComplete?.(job.outputPath);
    })
    .on('error', (err: Error) => {
      if (mpdSource !== job.mpdPath) { try { fs.unlinkSync(mpdSource); } catch { /* ignore */ } }
      activeJobs.delete(job.sessionId);
      jobPids.delete(job.sessionId);
      console.error('[Converter] ✗ Error:', err.message);
      if (fs.existsSync(partialPath)) { try { fs.unlinkSync(partialPath); } catch { /* ignore */ } }
      job.onError(err.message || 'Conversion failed');
    });

  activeJobs.set(job.sessionId, command);
  command.run();
}

export function convertVideo(job: ConversionJob): void {
  // Cancel if already running
  if (activeJobs.has(job.sessionId)) {
    job.onError('Conversion already in progress');
    return;
  }

  applyFfmpegPaths();
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

  runFfmpegConversion(job);
}

export function cancelConversion(sessionId: string, keepPartialFile = false): void {
  const command = activeJobs.get(sessionId);
  if (command) {
    command.kill('SIGKILL');
    activeJobs.delete(sessionId);
    pausedJobs.delete(sessionId);

    // Clean up remaining-segment temp file if this was a partial resume job.
    // Always safe to delete — it's a temp file, not the checkpoint.
    const remainingPath = remainingFilePaths.get(sessionId);
    if (remainingPath) {
      remainingFilePaths.delete(sessionId);
      try { fs.unlinkSync(remainingPath); } catch { /* ignore */ }
    }

    if (!keepPartialFile) {
      // Delete the .mp4.part checkpoint file (in-progress files always use this extension now).
      const partialPath = getPartialOutputPath(sessionId);
      if (fs.existsSync(partialPath)) {
        try {
          fs.unlinkSync(partialPath);
          console.log(`[Converter] Deleted partial checkpoint: ${partialPath}`);
        } catch (error) {
          console.error(`[Converter] Failed to delete partial checkpoint ${partialPath}:`, error);
        }
      }
    }
  } else if (pausedJobs.has(sessionId)) {
    pausedJobs.delete(sessionId);
    console.log(`[Converter] Cleared paused status for ${sessionId}`);
  } else {
    console.log(`[Converter] cancelConversion called but no active job for ${sessionId} — ignoring`);
  }
}

export function convertVideoForce(job: ConversionJob): void {
  // Cancel if already running
  if (activeJobs.has(job.sessionId)) {
    job.onError('Conversion already in progress');
    return;
  }

  applyFfmpegPaths();
  ensureVideoDir();

  // Check if source exists
  if (!fs.existsSync(job.mpdPath)) {
    job.onError('Source MPD file not found');
    return;
  }

  // Delete final .mp4 and any leftover .mp4.part checkpoint before re-encoding.
  const partialPath = job.outputPath.replace(/\.mp4$/, '.mp4.part');
  for (const p of [job.outputPath, partialPath]) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (error) {
        job.onError(`Failed to remove existing file: ${error}`);
        return;
      }
    }
  }

  runFfmpegConversion(job);
}

export function isConversionActive(sessionId: string): boolean {
  return activeJobs.has(sessionId);
}

// Tracks sessionId → remaining-segment temp path so cancelConversion can clean it up
const remainingFilePaths = new Map<string, string>();

/**
 * Resume a conversion from a saved checkpoint.
 *
 * Strategy:
 *  1. Encode the portion AFTER resumeTimemark using CPU (libx264) with PTS-reset filters
 *     so the remaining segment always starts at t=0 in the output file.
 *  2. Concat the already-encoded partial file + remaining segment via the FFmpeg concat
 *     demuxer (stream copy — fast, no re-encode of the done portion).
 *  3. Replace the partial file with the concatenated result.
 *
 * Progress is remapped to continue from progressOffset → 100%.
 */
export function startPartialResume(
  job: ConversionJob,
  resumeTimemark: string,
  progressOffset: number,
): void {
  if (activeJobs.has(job.sessionId)) {
    job.onError('Conversion already in progress');
    return;
  }

  applyFfmpegPaths();

  if (!fs.existsSync(job.mpdPath)) {
    job.onError('Source MPD file not found');
    return;
  }
  if (!fs.existsSync(partialPath)) {
    job.onError('Partial checkpoint file (.mp4.part) missing — cannot resume. Please reconvert from scratch.');
    return;
  }

  // The checkpoint file is the .mp4.part written during the original conversion.
  const partialPath = job.outputPath.replace(/\.mp4$/, '.mp4.part');
  const remainingPath = job.outputPath.replace(/\.mp4$/, '_remaining.mp4');
  const concatListPath = job.outputPath.replace(/\.mp4$/, '_concat_list.txt');
  const concatOutputPath = job.outputPath.replace(/\.mp4$/, '_concat.mp4');
  remainingFilePaths.set(job.sessionId, remainingPath);

  const mpdSource = patchMpdForOffline(job.mpdPath);

  console.log(`[Converter] Partial resume from ${resumeTimemark} (${progressOffset}% done)`);
  console.log(`[Converter] Checkpoint: ${partialPath}`);
  console.log(`[Converter] Remaining → ${remainingPath}`);

  // CPU encode with PTS-reset so remaining segment timestamps always start at 0.
  // This makes the concat demuxer work correctly without timestamp gaps.
  const command = ffmpeg(mpdSource)
    .inputOptions([`-ss ${resumeTimemark}`])
    .output(remainingPath)
    .outputOptions([
      '-c:v libx264',
      '-preset veryfast',
      '-crf 20',
      '-c:a aac',
      '-b:a 192k',
      '-movflags +faststart',
      '-vf setpts=PTS-STARTPTS',
      '-af asetpts=PTS-STARTPTS',
    ])
    .on('start', (cmdLine: string) => {
      console.log('[Converter] Resume FFmpeg command:', cmdLine);
      const proc = (command as any).ffmpegProc;
      if (proc?.pid) {
        jobPids.set(job.sessionId, proc.pid);
        console.log(`[Converter] Resume PID: ${proc.pid}`);
      }
      job.onProgress(progressOffset);
    })
    .on('stderr', (line: string) => {
      if (line.includes('Error') || line.includes('error')) {
        console.log('[Converter] Resume FFmpeg:', line.trim());
      }
    })
    .on('progress', (progress: FFmpegProgress) => {
      const remaining = 100 - progressOffset;
      const pct = Math.min(Math.round(progress.percent || 0), 99);
      const overall = Math.round(progressOffset + (pct / 100) * remaining);
      if (pct > 0) console.log(`[Converter] Resume progress: ${pct}% (overall ${overall}%) @ ${progress.timemark}`);
      job.onProgress(overall);
      if (progress.timemark) job.onTimemark?.(progress.timemark);
    })
    .on('end', () => {
      activeJobs.delete(job.sessionId);
      jobPids.delete(job.sessionId);
      remainingFilePaths.delete(job.sessionId);
      if (mpdSource !== job.mpdPath) { try { fs.unlinkSync(mpdSource); } catch { /* ignore */ } }

      console.log('[Converter] Remaining segment done, concatenating (async)…');

      // Write concat list — forward slashes required by FFmpeg concat demuxer even on Windows
      const partialFwd = partialPath.replace(/\\/g, '/');
      const remaining = remainingPath.replace(/\\/g, '/');
      fs.writeFileSync(concatListPath, `file '${partialFwd}'\nfile '${remaining}'\n`, 'utf-8');
      console.log('[Converter] Concat list:\n', fs.readFileSync(concatListPath, 'utf-8'));

      // Use async ffmpeg (not execSync) so we don't block the Electron event loop.
      // Blocking would prevent the renderer from ever seeing the 'converting' state.
      const concatCmd = ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .output(concatOutputPath)
        .on('start', (cmd: string) => console.log('[Converter] Concat command:', cmd))
        .on('end', () => {
          try {
            fs.unlinkSync(partialPath);          // remove the .mp4.part checkpoint
            fs.renameSync(concatOutputPath, job.outputPath); // promote concat result to .mp4
            try { fs.unlinkSync(remainingPath); } catch { /* ignore */ }
            try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
            console.log(`[Converter] ✓ Partial resume complete: ${job.outputPath}`);
            job.onProgress(100);
            job.onComplete?.(job.outputPath);
          } catch (swapErr: any) {
            console.error('[Converter] Concat swap failed:', swapErr.message ?? swapErr);
            try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
            try { fs.unlinkSync(concatOutputPath); } catch { /* ignore */ }
            job.onError(`Concat swap failed: ${swapErr.message ?? 'unknown'}`);
          }
        })
        .on('error', (concatErr: Error) => {
          console.error('[Converter] Concat FFmpeg error:', concatErr.message);
          try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
          try { fs.unlinkSync(concatOutputPath); } catch { /* ignore */ }
          job.onError(`Concat failed: ${concatErr.message}`);
        });
      concatCmd.run();
    })
    .on('error', (err: Error) => {
      activeJobs.delete(job.sessionId);
      jobPids.delete(job.sessionId);
      remainingFilePaths.delete(job.sessionId);
      if (mpdSource !== job.mpdPath) { try { fs.unlinkSync(mpdSource); } catch { /* ignore */ } }
      try { fs.unlinkSync(remainingPath); } catch { /* ignore */ }
      console.error('[Converter] ✗ Resume error:', err.message);
      job.onError(err.message || 'Resume conversion failed');
    });

  activeJobs.set(job.sessionId, command);
  command.run();
}

// Store PIDs for pause/resume (kept for reference, no longer used for NtSuspend)
const jobPids = new Map<string, number>();

// Sessions where the user requested a graceful pause via stdin "q".
// The 'end' event in runFfmpegConversion checks this to avoid calling onComplete.
const gracefulPauseJobs = new Set<string>();

/**
 * Pause a conversion by sending FFmpeg a graceful quit signal via stdin.
 * This lets FFmpeg finish the current GOP and properly close the MP4 container,
 * producing a valid (partial) file — unlike SIGKILL/NtSuspendProcess which can
 * leave the file in a corrupt state mid-write.
 *
 * The 'end' event will fire once FFmpeg exits.  runFfmpegConversion's 'end' handler
 * detects gracefulPauseJobs and skips onComplete so the session stays 'paused'.
 */
export function pauseConversion(sessionId: string): void {
  const command = activeJobs.get(sessionId);
  if (!command) {
    console.warn(`[Converter] pauseConversion: no active job for ${sessionId}`);
    return;
  }

  gracefulPauseJobs.add(sessionId);
  pausedJobs.add(sessionId);

  const proc = (command as any).ffmpegProc;
  if (proc?.stdin && !proc.stdin.destroyed) {
    try {
      proc.stdin.write('q\n');
      console.log(`[Converter] Sent graceful quit to FFmpeg PID ${proc.pid ?? '?'} for ${sessionId}`);
    } catch (err) {
      console.warn(`[Converter] stdin write failed, falling back to SIGTERM:`, err);
      command.kill('SIGTERM');
    }
  } else {
    console.warn(`[Converter] FFmpeg stdin not available, using SIGTERM for ${sessionId}`);
    command.kill('SIGTERM');
  }
}

/**
 * resumeConversion is now only called from the IPC handler in the rare case
 * where the user resumes while FFmpeg is mid-graceful-quit (isConversionActive=true).
 * In practice, after a graceful pause completes, isConversionActive returns false
 * and the IPC handler goes through startPartialResume instead.
 */
export function resumeConversion(sessionId: string): void {
  // No-op: graceful pause exits FFmpeg, so there's nothing to resume in-process.
  // The IPC handler falls through to startPartialResume for all real resumes.
  console.log(`[Converter] resumeConversion called for ${sessionId} (no-op — use startPartialResume)`);
}

export function isPaused(sessionId: string): boolean {
  return pausedJobs.has(sessionId);
}
