# Thumbnail Loading Security Fix

## Problem
When the app tried to load thumbnail images, Electron blocked them with the error:
```
Not allowed to load local resource: file:///C:/Users/.../steam-thumbnails/2015270.jpg
```

This happened because the renderer was attempting to load local files using `file://` URLs, which Electron blocks for security reasons.

## Solution
Changed the architecture to serve thumbnails through the local HTTP media server instead of using file:// URLs.

### Files Modified

#### 1. `src/main/media-server.ts`
- Added support for serving thumbnails via HTTP endpoint
- New route: `GET /thumbnail/<filename>`
- Added MIME types for `.jpg`, `.jpeg`, `.png`, `.gif`
- Serves files from `userData/steam-thumbnails/` directory
- Implements path traversal prevention using `path.basename()`
- Added Cache-Control headers for 1-day caching

#### 2. `src/main/steam.ts`
- **New imports**: `getMediaServerPort` from `./media-server`
- **Updated `downloadThumbnail()` function**:
  - Now returns just the filename instead of the full file path
  - Still saves thumbnails locally for caching
  - Returns filename only: `"2015270.jpg"` instead of `"/path/to/2015270.jpg"`

- **New helper functions**:
  - `constructThumbnailUrl(filename)`: Builds HTTP URL using current media server port
    - Returns: `http://127.0.0.1:<port>/thumbnail/<filename>`
  - `addThumbnailUrls(info)`: Adds HTTP URLs to GameInfo objects
    - Checks if thumbnailPath is a filename (non-http) and reconstructs URL if needed
    - Handles port changes on app restart automatically

- **Updated `getGameInfo()` function**:
  - Stores just filenames in persistent DB (handles port changes)
  - Returns full HTTP URLs to callers via `addThumbnailUrls()`
  - Applied to both cached and freshly-fetched game info

### How It Works

**Startup Flow:**
1. App starts → Media server starts listening on random port (e.g., 54321)
2. Scanner runs → Calls `getGameInfo(appId)`
3. `getGameInfo()` downloads thumbnail, stores as filename in DB
4. Returns HTTP URL: `http://127.0.0.1:54321/thumbnail/2015270.jpg`
5. Scanner sends this URL to renderer
6. Renderer loads image via HTTP (allowed) instead of file:// (blocked)

**App Restart Handling:**
- Media server starts on new port (e.g., 54399)
- Thumbnails are cached as just filenames in `steam-game-info.json`
- When `getGameInfo()` is called, `addThumbnailUrls()` automatically reconstructs URLs with new port
- No broken image links after restart

### Security Improvements
- Thumbnails served via HTTP from local server (secure)
- Path traversal protection via `path.basename()` prevents accessing files outside thumbnails directory
- No exposure of local file paths to renderer
- Proper CORS headers for local requests

### Testing
To verify the fix works:
1. Launch the app
2. Select a Steam recording folder
3. Thumbnails should load without "Not allowed to load local resource" errors
4. Restart the app and verify thumbnails still load (HTTP URLs auto-reconstructed with new port)
