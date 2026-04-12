# OAuth Cancel Flow Implementation

## Overview
Added ability to cancel YouTube OAuth authorization at any time during the authentication process. When the user clicks the cancel button while waiting for browser authorization, the HTTP server listening for the OAuth callback is closed and the authorization is aborted.

## User Experience
1. User clicks "Authorize with Google" button
2. Browser opens and user sees the Google OAuth consent screen
3. While waiting, a "Cancel" button appears next to the disabled "Waiting for browser authorization…" text
4. User can click "Cancel" to abort the OAuth flow without completing it
5. UI returns to normal state, user can try again

## Files Modified

### Frontend (`src/renderer/components/SettingsPage.tsx`)
- Added `handleCancel()` function that calls `window.api.youtubeCancel()`
- Updated button UI to show two states:
  - **Authorizing**: Disabled status button + "Cancel" button side-by-side
  - **Normal**: Single "Authorize with Google" button
- Uses flexbox layout for button grouping

### API Types (`src/shared/types.ts`)
- Added `youtubeCancel: () => Promise<void>` to `ElectronAPI` interface

### IPC Bridge (`src/preload/index.ts`)
- Exposed `youtubeCancel` method calling `ipcRenderer.invoke('youtube:cancel')`

### IPC Handler (`src/main/ipc.ts`)
- Added import for `cancelYouTubeAuth` from youtube module
- Added `ipcMain.handle('youtube:cancel')` handler
- Handler calls `cancelYouTubeAuth()` and logs the cancellation

### OAuth Implementation (`src/main/youtube.ts`)
- Added module-level tracking variables:
  - `activeAuthServer`: Stores the HTTP server instance
  - `activeAuthTimeout`: Stores the timeout ID
  - `activeAuthReject`: Stores the Promise reject function

- Added `cancelYouTubeAuth()` function that:
  - Closes the HTTP server
  - Clears the timeout
  - Rejects the pending Promise with "Authorization cancelled by user"
  - Cleans up all references

- Updated `authorizeYouTube()` to:
  - Store references to server, timeout, and reject
  - Call cleanup() on success/error to clear references

### Mock API (`src/renderer/mock-api.ts`)
- Added mock implementation of `youtubeCancel` for development/testing

## How It Works

### Normal Authorization Flow
1. User clicks "Authorize with Google"
2. `authorizeYouTube()` creates an HTTP server listening for OAuth callback
3. Browser window opens with Google OAuth consent page
4. User grants permission, browser redirects to `http://127.0.0.1:<port>?code=...`
5. Server receives authorization code, exchanges for tokens, and resolves Promise

### Cancelled Authorization Flow
1. User clicks "Cancel" button while `authorizeYouTube()` Promise is pending
2. `window.api.youtubeCancel()` is called
3. IPC sends `youtube:cancel` message to main process
4. Main process calls `cancelYouTubeAuth()`
5. HTTP server closes, timeout is cleared
6. Pending Promise is rejected with error
7. Frontend catches error, shows alert, and resets UI
8. User can now try again

## State Cleanup
The implementation ensures proper cleanup in all scenarios:
- **Successful auth**: cleanup() clears references after token exchange
- **Cancelled auth**: cleanup() clears references and closes server
- **Auth timeout**: cleanup() clears references and rejects Promise
- **OAuth error**: cleanup() clears references and rejects Promise
- **Network error**: cleanup() clears references and rejects Promise

## Security Considerations
- Cancellation only works if authorization is still in progress
- Once tokens are obtained, cancellation cannot affect the result
- The reject function prevents any further action on a cancelled authorization
- All references are cleared after completion to prevent memory leaks

## Testing
To test the cancel flow:
1. Launch the app
2. Go to Settings → YouTube
3. Click "Authorize with Google"
4. When the browser opens, return to the app before completing the OAuth
5. Click the "Cancel" button
6. Verify the UI returns to normal and shows no error
7. Try authorizing again to ensure the flow works
