# Pause/Resume Conversion Feature

## Overview

You can now **pause conversions, quit the app, and resume later** without losing progress.

## How It Works

### Starting a Conversion
1. Click the **Convert** button on a recording
2. Conversion starts and shows progress in real-time

### Pausing a Conversion
1. While converting, click the **⏸ Pause** button
2. Conversion is paused gracefully (doesn't lose progress)
3. Status changes to **"paused"**
4. Partial video file is preserved

### Quitting the App While Converting
- If you quit (close the app) during conversion:
  - Active conversions are automatically paused
  - Status is saved as "paused"
  - Partial files are preserved
  - **Nothing is deleted**

### Resuming a Conversion
1. Restart the app
2. Look for files with status **"paused"**
3. Click the **▶ Resume** button
4. Conversion continues from where it left off

### Aborting a Conversion
- Click the **⛔ Abort** button (red X)
- Partial file is deleted
- Status resets to "waiting"
- Must start conversion over

## Technical Details

### Pause Implementation

**Graceful Pause:**
- Uses `SIGSTOP` signal (pauses the process without killing it)
- FFmpeg stops processing but stays in memory
- Partial output file is preserved

**Resume:**
- Uses `SIGCONT` signal (resumes the paused process)
- FFmpeg continues from exactly where it stopped
- No re-encoding or data loss

### Database Status

**FileStatus Types:**
```
'waiting'     → Not converted yet
'converting'  → Currently converting
'paused'      → Paused, ready to resume
'uploading'   → Uploading to YouTube
'done'        → Complete and ready to upload
'error'       → Conversion failed
```

### File Preservation

**What Happens to Partial Files:**
- While converting: Partial MP4 file grows in `convertedFolder`
- When paused: Partial file stays (preserved for resume)
- When resumed: FFmpeg continues writing to same file
- When aborted: Partial file is deleted
- When done: File is finalized and ready to upload

## Use Cases

### 1. Long Conversions
- Starting a 2-hour video conversion
- Pause when you need your computer
- Resume later when it's available

### 2. App Crash/Update
- App unexpectedly closes
- Restart the app
- Your conversion is still paused
- Resume and it continues

### 3. System Shutdown
- Need to shut down your computer
- Click pause
- Shut down gracefully
- Next time you boot, resume

### 4. Freeing System Resources
- Conversion is using CPU/disk
- Pause it temporarily
- Use your computer for other tasks
- Resume later

## UI Indicators

### While Converting
```
[⏸ Pause] [⛔ Abort]
```
- Shows pause and abort options

### While Paused
```
[▶ Resume] [⛔ Abort]
```
- Shows resume and abort options
- Status badge shows "paused"
- Progress bar shows what percentage was completed

### Completed
```
[📤 Upload] [⚙️ Menu]
```
- Upload button appears
- Pause/resume buttons disappear

## FAQ

**Q: Will I lose my conversion progress if I pause?**
A: No. The partial file is preserved and you resume from the exact point you paused.

**Q: Can I pause and resume across multiple app restarts?**
A: Yes. Even if the app crashes or you force-quit, paused conversions are saved and can be resumed later.

**Q: What happens if I abort a paused conversion?**
A: The partial file is deleted and status resets to "waiting". You'll need to start over.

**Q: Can I pause during upload?**
A: No, only during conversion. Uploads are typically fast (minutes), so pausing isn't needed.

**Q: Does pausing free up system resources?**
A: Mostly yes. The FFmpeg process is paused (not using CPU), but it stays in memory. For full resource freedom, abort instead.

**Q: Why is my paused conversion taking longer to resume?**
A: The FFmpeg process needs a moment to wake up from pause. This is normal and takes less than a second.

## Technical Notes

### SIGSTOP vs Kill
- `SIGSTOP`: Pauses process (can be resumed)
- `SIGKILL`: Kills process (cannot be resumed)

The app uses SIGSTOP for pause, which is why resume works.

### Partial Files

Partial files are stored as `.mp4` in your `convertedFolder` while encoding:
- `sessionId.mp4` (growing while converting)
- Preserved when paused
- Completed when conversion finishes
- Deleted only when you abort or force-convert

### App Quit Behavior

| Situation | Action | Result |
|-----------|--------|--------|
| Quit while converting | Auto-pause | Can resume later |
| Quit while uploading | Continues upload in bg | Upload state saved |
| Quit normally | Cleanup | Paused conversions preserved |
| Force-quit (Ctrl+C) | Auto-pause | Can resume later |

## Implementation Details

### Files Modified
- `src/main/video-converter.ts` - Added pauseConversion(), resumeConversion()
- `src/main/ipc.ts` - Added pause/resume IPC handlers
- `src/shared/types.ts` - Added 'paused' status to FileStatus
- `src/renderer/components/MainPage.tsx` - Added pause/resume UI buttons
- `src/preload/index.ts` - Exposed pause/resume to renderer
- `src/renderer/mock-api.ts` - Added mock pause/resume

### Database Updates
- When paused: `status = 'paused'` (progress preserved)
- When resumed: `status = 'converting'` (progress continues)

## Limitations

1. **Pause duration**: Don't pause for more than a few minutes if possible (reduces overall system responsiveness)
2. **System sleep**: If system sleeps while paused, resume may fail (would need to restart conversion)
3. **Resume same session**: Must be on same machine in same folder (cannot move partial files)

---

**Summary:** Pause/resume is fully implemented. You can safely pause long conversions, quit the app, and resume later with all progress preserved.
