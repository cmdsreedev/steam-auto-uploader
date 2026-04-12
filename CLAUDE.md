# Steam Auto Uploader — Steering Docs

Electron app that scans Steam recording sessions, converts DASH video to MP4 via FFmpeg, and uploads to YouTube.

## Dev Commands

```bash
npm start          # Launch Electron app (dev mode, opens DevTools)
npm run package    # Package app binaries (no installer)
npm run make       # Build platform installers
npm run lint       # ESLint on all .ts/.tsx files
```

## Architecture

Three Electron processes with strict separation:

```
src/main/       — Node.js main process (file I/O, FFmpeg, Steam API, DB)
src/preload/    — Context bridge (maps window.api to ipcRenderer.invoke)
src/renderer/   — React 19 UI (no Node access, communicates only via window.api)
src/shared/     — Types shared across all three (types.ts only)
```

The renderer never imports from `main/` or calls Node APIs directly. All cross-process calls go through the typed `window.api` bridge defined in `src/shared/types.ts` (ElectronAPI interface) and wired in `src/preload/index.ts`.

## IPC Conventions

- Channel naming: `noun:verb` (e.g. `conversion:start`, `files:scan`, `settings:load`)
- Async RPC: `ipcMain.handle()` / `ipcRenderer.invoke()` — all handlers in `src/main/ipc.ts`
- One-way events: `ipcMain.on()` / `ipcRenderer.send()` — used only for window controls (minimize/maximize/close)
- Every new IPC method must be added in three places: `ipc.ts` (handler), `preload/index.ts` (bridge), `shared/types.ts` (ElectronAPI interface)

## Data Flow

```
scanner.ts → scanFolder() → merges file metadata + DB records → VideoFile[]
                                                                     ↓
                                                              App.tsx (state)
                                                                     ↓
                                            MainPage.tsx ← user actions → window.api calls
                                                                     ↓
                                              ipc.ts handlers → db.ts / video-converter.ts
```

Session state is persisted in `userData/sessions-db.json` via `db.ts`. Every `upsertSession()` call persists to disk immediately. The renderer re-scans on demand (refresh button, after save settings) — there is no push/event from main to renderer.

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/types.ts` | Single source of truth for all interfaces (VideoFile, Settings, FileStatus, ElectronAPI) |
| `src/main/ipc.ts` | All ipcMain.handle/on registrations — no business logic, delegates to other modules |
| `src/main/db.ts` | In-memory + JSON persistence for session state (status, convertedPath, progress) |
| `src/main/scanner.ts` | Scans recording folder, parses MPD XML, merges DB state, syncs stale records |
| `src/main/video-converter.ts` | fluent-ffmpeg wrapper; active jobs tracked per sessionId in a Map |
| `src/main/steam.ts` | Steam store API + thumbnail download; rate-limited (200–800ms stagger) |
| `src/main/media-server.ts` | Local HTTP server for DASH playback; prevents path traversal via `path.basename()` |
| `src/main/settings.ts` | JSON settings in `userData/settings.json`; always merges with defaults on load |

## Persistence Files (userData/)

- `settings.json` — user settings (folder paths, YouTube credentials)
- `sessions-db.json` — session workflow state (status, convertedPath, conversionProgress)
- `steam-game-info.json` — cached Steam game names and thumbnail paths
- `steam-thumbnails/<appId>.<ext>` — downloaded Steam header images

## Session ID Generation

Session IDs are derived from the MPD path: `Buffer.from(mpdPath).toString('base64url').slice(-20)`. Always use this scheme — do not generate random IDs.

## File Status Lifecycle

```
waiting → converting → done
        ↘ error ↗
waiting ← (cancel)
done → uploading → done (with youtubeVideoId)
```

`FileStatus` is `'waiting' | 'converting' | 'uploading' | 'done' | 'error'`. Status transitions always go through `upsertSession()` in `db.ts`, never mutated directly on VideoFile objects in the renderer.

## Steam Recording Folder Structure

```
<recordingFolder>/
  video/
    bg_<appId>_<YYYYMMDD>_<HHMMSS>/
      session.mpd
      *.m4s   (video/audio chunks)
```

AppId is extracted from folder name with regex `bg_(\d+)_`. MPD XML is parsed with regex (not a DOM parser) — keep this consistent.

## Video Conversion

- `convertVideo()` — skips silently if output file already exists (idempotent)
- `convertVideoForce()` — deletes existing output, then converts
- Active jobs: `Map<sessionId, FfmpegCommand>` in `video-converter.ts`
- Encoding: H.264 + AAC, `-preset veryfast`, `-movflags +faststart` (YouTube-optimised)
- Output path: `<convertedFolder>/<sessionId>.mp4` — always derived this way
- FFmpeg binary: hardcoded to `D:/Projects/ffmpeg/bin/` — needs to be made configurable before distribution
- On app quit, `before-quit` resets any in-progress conversions to `waiting` and deletes partial output files

## React Patterns

- State lives in `App.tsx`; child components receive props and call callbacks
- `useCallback` used for functions that depend on settings or trigger re-scans
- No external state library — plain useState/useCallback
- Settings page uses a local draft state; saves on explicit button click
- Thumbnail fallback: if `thumbnailUrl` fails to load, falls back to `/assets/steam-placeholder.png`
- Progress polling: conversionProgress comes from DB via re-scan, not a live event stream

## TypeScript

- `noImplicitAny: true` — all parameters must be typed
- `moduleResolution: bundler` — use ES imports, not `require()` (except where Electron forces it)
- `skipLibCheck: true` — do not rely on this; write correct types
- Avoid `require()` in new code; use ES module imports throughout

## What to Watch Out For

- **Hardcoded FFmpeg path** (`D:/Projects/ffmpeg/bin/`) in `video-converter.ts` — do not replicate this pattern; needs settings integration before release
- **No YouTube upload implementation** — `upload:start` IPC handler only marks status as `uploading`; actual YouTube API integration is not built yet
- **`CLEAR_DB_ON_START` flag** in `index.ts` — development only, must be `false` (or removed) before release
- **MPD parsing via regex** — intentional, but fragile; do not switch to a full XML parser without understanding the chunk format
- **Steam API rate limiting** — the stagger delay in `steam.ts` is intentional; do not remove it
- **No retry logic** on Steam API failures — `getGameInfo()` returns null on error; scanner falls back to folder name
