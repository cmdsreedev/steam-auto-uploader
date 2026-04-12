# Copilot Instructions

## Commands

```bash
npm start          # Launch Electron app in dev mode (opens DevTools)
npm run dev:web    # Serve renderer only in browser at http://localhost:5173 (mock API)
npm run lint       # ESLint on all .ts/.tsx files
npm run package    # Package app binaries
npm run make       # Build platform installers
```

There are no tests.

## Architecture

Three Electron processes with **strict separation** — the renderer has no Node.js access:

```
src/main/       — Node.js process: file I/O, FFmpeg, Steam API, DB, HTTP server
src/preload/    — Context bridge: maps window.api → ipcRenderer.invoke calls
src/renderer/   — React 19 UI: communicates only via window.api
src/shared/     — types.ts only (VideoFile, Settings, FileStatus, ElectronAPI)
```

The renderer imports nothing from `main/`. All cross-process calls go through `window.api` (typed via `ElectronAPI` in `shared/types.ts`, wired in `preload/index.ts`).

### Adding an IPC method

Three files must always be updated together:

1. **`src/main/ipc.ts`** — `ipcMain.handle('channel:name', handler)`
2. **`src/preload/index.ts`** — `channel: (...args) => ipcRenderer.invoke('channel:name', ...args)`
3. **`src/shared/types.ts`** — method signature on the `ElectronAPI` interface

### IPC channel naming

`noun:verb` — e.g. `conversion:start`, `files:scan`, `settings:load`.  
Window controls (minimize/maximize/close) use `ipcMain.on()` / `ipcRenderer.send()` and are the only one-way events.

## Key Conventions

### State & data flow

- All app state lives in `App.tsx` (files, settings, page). Children receive props and call callbacks — no external state library.
- The renderer re-scans on demand (refresh, after save settings). There is **no push/event** from main to renderer.
- Status transitions always go through `upsertSession()` in `db.ts`, never mutated on `VideoFile` objects in the renderer.

### Session IDs

Derived from the MPD path: `Buffer.from(mpdPath).toString('base64url').slice(-20)`. Never generate random IDs.

### File status lifecycle

```
waiting → converting → done
        ↘ error ↗
waiting ← (cancel)
done → uploading → done (with youtubeVideoId)
```

`FileStatus = 'waiting' | 'converting' | 'uploading' | 'done' | 'error'`

### Video conversion

- `convertVideo()` — idempotent, skips if output already exists
- `convertVideoForce()` — deletes existing output, then re-encodes
- Output path is always `<convertedFolder>/<sessionId>.mp4`
- Active jobs tracked in `Map<sessionId, FfmpegCommand>` in `video-converter.ts`
- On `before-quit`: resets in-progress sessions to `waiting`, deletes partial files

### Steam recording folder structure

```
<recordingFolder>/video/bg_<appId>_<YYYYMMDD>_<HHMMSS>/
  session.mpd
  *.m4s
```

AppId extracted with regex `bg_(\d+)_`. MPD XML parsed with regex — do not switch to a DOM parser.

### Settings

`settings.ts` always merges loaded JSON with defaults on read. The renderer settings page uses local draft state and saves only on explicit button click.

### Thumbnail fallback

If `thumbnailUrl` fails to load, fall back to `/assets/steam-placeholder.png`.

### Browser dev mode (mock API)

`src/renderer/mock-api.ts` provides a full `window.api` mock with 4 sample sessions covering all status states (waiting, converting, done, error). It is injected automatically by `index.tsx` when `window.api` is absent — no changes needed to run `npm run dev:web`. Use Playwright MCP at `http://localhost:5173` to inspect the UI.

## Known Limitations

- **FFmpeg path is hardcoded** to `D:/Projects/ffmpeg/bin/` in `video-converter.ts` — needs settings integration before distribution.
- **YouTube upload is not implemented** — `upload:start` only marks status as `uploading`.
- **`CLEAR_DB_ON_START`** flag in `src/main/index.ts` is for development only — must stay `false`.
- Steam API rate limiting in `steam.ts` (200–800 ms stagger) is intentional — do not remove it.
