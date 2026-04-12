# Steam Auto Uploader - Distribution Setup

## Overview

The app is now configured for distribution with **embedded Google OAuth credentials**. Users simply click "Sign in with Google" and the OAuth flow handles everything automatically.

## What Changed

### Before (User Setup Required)
```
Settings Page:
├─ OAuth Client ID input
├─ OAuth Client Secret input
└─ "Authorize with Google" button
```
❌ Users had to set up their own Google Cloud project

### After (Seamless for Users)
```
Settings Page:
└─ "Sign in with Google" button
```
✅ Credentials embedded in app - users just click and authorize

## Development Setup

### 1. Environment Variables

The app reads Google OAuth credentials from environment variables:

```bash
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_SECRET=
```

**Files:**
- `.env` - Your actual credentials (NOT committed to git)
- `.env.example` - Template showing the format

### 2. How It Works

**In Development:**
```bash
npm start
# App reads from .env file automatically
```

**In Production:**
```bash
npm run make
# Environment variables are baked into the executable
# Or set them via system environment
```

## Building for Distribution

### Option A: Bake Credentials into Build

The credentials are already in `.env` and will be used during build:

```bash
# Build for Windows
npm run make

# Build for macOS
npm run make

# Build for Linux
npm run make
```

The credentials from `.env` are embedded in the compiled app.

### Option B: Use System Environment Variables

Set environment variables before building:

```bash
# Windows (PowerShell)
$env:VITE_GOOGLE_CLIENT_ID = "..."
$env:VITE_GOOGLE_CLIENT_SECRET = "..."
npm run make

# macOS/Linux (Bash)
export VITE_GOOGLE_CLIENT_ID="..."
export VITE_GOOGLE_CLIENT_SECRET="..."
npm run make
```

## Security Considerations

### ✅ Good Practices

1. **During Development:**
   - `.env` file is gitignored (kept private)
   - Only you have access to credentials

2. **During Distribution:**
   - Credentials are compiled into the executable
   - Users cannot see or modify them
   - Quota is shared across all users (you manage it)

3. **OAuth Flow:**
   - Users authenticate with their own Google account
   - They grant permission to upload videos
   - Refresh token is stored locally in `sessions-db.json`

### ⚠️ Important

- **The credentials in this `.env` are YOUR project's credentials**
- Keep `.env` private - it's in `.gitignore` for a reason
- If you distribute this app, the quota is shared among ALL users
- Monitor your YouTube API quota at Google Cloud Console
- If you revoke the project, the app stops working for all users

## User Experience

### First Time Using the App

1. User opens Steam Auto Uploader
2. Goes to Settings
3. Clicks "Sign in with Google"
4. Browser opens → Google sign-in page
5. User signs in and grants permission
6. Browser closes → App shows "YouTube channel connected"
7. User can now upload videos!

### Uploading Videos

1. Convert a Steam recording to MP4
2. Right-click → "Upload to YouTube"
3. Choose privacy (public/unlisted/private)
4. Click "Upload"
5. Video uploads using the connected YouTube channel

## Troubleshooting

### "Authorization failed"
- Check DevTools console (Ctrl+Shift+I) for detailed error
- Make sure YouTube Data API v3 is enabled in Google Cloud project
- Verify credentials haven't been revoked

### "No channel found"
- User's Google account doesn't have a YouTube channel
- User should create one at YouTube.com

### Upload quota exceeded
- Too many users uploading simultaneously
- Check quotas at: Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas
- YouTube Data API v3 default daily quota: 10,000 units
- One upload costs ~1,600 units
- To increase quota: Request quota increase in Google Cloud Console

## File Structure

```
src/main/
├─ google-oauth-config.ts  ← NEW: Loads credentials from env
├─ youtube.ts              ← Enhanced OAuth flow
└─ ipc.ts                  ← Updated to use config

src/renderer/
├─ components/SettingsPage.tsx  ← Simplified (no credential inputs)
└─ mock-api.ts             ← Updated mock

.env                 ← Credentials (gitignored)
.env.example        ← Template
```

## Testing Before Distribution

```bash
# 1. Start dev server
npm start

# 2. Test OAuth flow
# Settings → "Sign in with Google"
# Should open browser and complete auth

# 3. Test video upload
# Create/convert a test video
# Right-click → "Upload to YouTube"
# Check if video appears on YouTube

# 4. Check console
# Press Ctrl+Shift+I to open DevTools
# Look for auth/upload logs
```

## Distributing to Others

When you distribute this app to other users:

1. **Credentials are already embedded** - they don't need to set anything up
2. **OAuth flow is automatic** - they just click "Sign in with Google"
3. **Quota is yours** - you're responsible for API usage
4. **Support the app** - users might need help troubleshooting

### Pre-Release Checklist

- [ ] Test OAuth flow completely
- [ ] Test upload flow completely
- [ ] Check DevTools console for errors
- [ ] Verify YouTube API quota is sufficient
- [ ] Document how to use the YouTube feature
- [ ] Provide support email for issues

## References

- Google Cloud Console: https://console.cloud.google.com
- YouTube Data API Quotas: APIs & Services → YouTube Data API v3 → Quotas
- OAuth Refresh Token Expiration: 6 months of inactivity
- Daily Quota: Resets at midnight Pacific Time

---

**Your Google OAuth Project:**
- Project ID: `steam-auto-uploader`
- Client ID: ``
- Credentials in: `.env` (private, gitignored)
