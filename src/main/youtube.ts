import { google } from 'googleapis';
import http from 'node:http';
import { shell } from 'electron';
import { URL } from 'node:url';
import fs from 'node:fs';

export interface YouTubeAuthResult {
  refreshToken: string;
  channelId: string;
  channelName: string;
  channelThumbnail: string;
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REDIRECT_PORT = 9874; // Fixed port for OAuth redirect URI

// Track active authorization session
let activeAuthServer: http.Server | null = null;
let activeAuthTimeout: NodeJS.Timeout | null = null;
let activeAuthReject: ((reason?: unknown) => void) | null = null;

export function cancelYouTubeAuth(): void {
  if (activeAuthServer) {
    try { activeAuthServer.close(); } catch (e) { /* ignore */ }
    activeAuthServer = null;
  }
  if (activeAuthTimeout) {
    clearTimeout(activeAuthTimeout);
    activeAuthTimeout = null;
  }
  if (activeAuthReject) {
    activeAuthReject(new Error('Authorization cancelled by user'));
    activeAuthReject = null;
  }
}

export async function authorizeYouTube(clientId: string, clientSecret: string): Promise<YouTubeAuthResult> {
  return new Promise((resolve, reject) => {
    // Validate inputs
    if (!clientId || !clientSecret) {
      reject(new Error('Client ID and Client Secret are required'));
      return;
    }

    const server = http.createServer();
    let handled = false;
    // These are set once the server starts listening, then used in the request handler
    let redirectUri = '';
    let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

    const cleanup = () => {
      try { server.close(); } catch (e) { /* ignore */ }
      activeAuthServer = null;
      activeAuthReject = null;
      if (activeAuthTimeout) clearTimeout(activeAuthTimeout);
      activeAuthTimeout = null;
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Authorization timed out after 5 minutes. Please try again.'));
    }, AUTH_TIMEOUT_MS);

    // Store for potential cancellation
    activeAuthServer = server;
    activeAuthTimeout = timeout;
    activeAuthReject = reject;

    // Register request handler before listen so it's always in scope
    server.on('request', async (req, res) => {
        if (handled) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('');
          return;
        }

        try {
          const addr = server.address();
          if (!addr || typeof addr === 'string') {
            throw new Error('Server address is not available');
          }
          const parsed = new URL(req.url!, `http://127.0.0.1:${addr.port}`);
          const code = parsed.searchParams.get('code');
          const error = parsed.searchParams.get('error');
          const errorDesc = parsed.searchParams.get('error_description');

          if (error) {
            handled = true;
            cleanup();
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlPage('Authorization cancelled', 'You can close this tab.'));
            const errorMsg = errorDesc ? `${error}: ${errorDesc}` : error;
            console.error(`Google OAuth error: ${errorMsg}`);
            reject(new Error(`Authorization denied: ${errorMsg}`));
            return;
          }

          if (!code) {
            // ignore non-code requests (e.g. favicon.ico)
            console.debug(`Ignoring non-code request: ${req.url}`);
            return;
          }

          handled = true;
          cleanup();

          try {
            console.log('[OAuth] Received authorization code, exchanging for tokens...');
            console.log('[OAuth] Code length:', code.length, 'characters');
            console.log('[OAuth] Redirect URI:', redirectUri);
            console.log('[OAuth] Client configured:', !!oauth2Client);

            if (!oauth2Client) {
              throw new Error('OAuth client not initialized — server may not have started yet');
            }

            if (!clientId || !clientSecret) {
              throw new Error('Client ID or Secret missing - check .env file');
            }

            console.log('[OAuth] Calling getToken()...');

            // Call getToken with a timeout to detect hangs
            const getTokenPromise = oauth2Client.getToken(code);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('getToken() timed out after 30 seconds')), 30000)
            );

            let tokenResult;
            try {
              tokenResult = await Promise.race([getTokenPromise, timeoutPromise]);
              console.log('[OAuth] ✓ getToken() returned successfully');
            } catch (err) {
              console.error('[OAuth] ✗ getToken() threw an error or timed out:');
              console.error('[OAuth] Error type:', err?.constructor?.name);
              console.error('[OAuth] Error message:', err instanceof Error ? err.message : String(err));
              console.error('[OAuth] Full error:', err);
              throw err;
            }

            console.log('[OAuth] ✓ Got token result');
            const { tokens } = tokenResult;
            console.log('[OAuth] ✓ Token exchange successful');
            console.log('[OAuth] Tokens received:', {
              hasAccessToken: !!tokens.access_token,
              hasRefreshToken: !!tokens.refresh_token,
              expiresIn: tokens.expiry_date,
            });

            if (!tokens.refresh_token) {
              console.warn('[OAuth] ⚠ No refresh token in response (offline access may not be set)');
            }

            oauth2Client.setCredentials(tokens);

            console.log('[OAuth] Retrieving channel information...');
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            const channelRes = await youtube.channels.list({ part: ['snippet'], mine: true });
            const channel = channelRes.data.items?.[0];

            if (!channel) {
              throw new Error('No channel found for the authenticated account');
            }

            console.log(`[OAuth] ✓ Authorization successful for channel: ${channel.snippet?.title}`);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlPage('✓ Authorization successful!', 'You can close this tab and return to Steam Auto Uploader.'));

            resolve({
              refreshToken: tokens.refresh_token ?? '',
              channelId: channel.id ?? '',
              channelName: channel.snippet?.title ?? '',
              channelThumbnail: channel.snippet?.thumbnails?.default?.url ?? '',
            });
          } catch (err) {
            // Always show the error — don't gate on `handled` here since we set it above
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlPage('Authorization failed', 'You can close this tab and check the app for the error.'));
            console.error('[OAuth] ✗ Error during token exchange or channel retrieval:');
            console.error('[OAuth] Details:', err instanceof Error ? err.message : String(err));

            if (err instanceof Error && err.message.includes('invalid_client')) {
              console.error('[OAuth] ⚠ invalid_client: Client ID/Secret are incorrect in .env file');
            } else if (err instanceof Error && err.message.includes('redirect_uri_mismatch')) {
              console.error('[OAuth] ⚠ redirect_uri_mismatch: Add http://127.0.0.1:' + REDIRECT_PORT + ' to Google Cloud Console Authorized Redirect URIs');
            } else if (err instanceof Error && err.message.includes('timed out')) {
              console.error('[OAuth] ⚠ Timed out — check internet connection');
            }

            reject(err);
          }
        } catch (err) {
          if (!handled) {
            handled = true;
            cleanup();
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlPage('Authorization failed', 'You can close this tab.'));
            console.error('[OAuth] ✗ Unexpected error:', err instanceof Error ? err.message : String(err));
            reject(err);
          }
        }
      });

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', async () => {
      try {
        const port = REDIRECT_PORT;
        redirectUri = `http://127.0.0.1:${port}`;
        oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        console.log('[OAuth] OAuth2Client initialized:');
        console.log('[OAuth] - Client ID length:', clientId.length, 'chars');
        console.log('[OAuth] - Client Secret length:', clientSecret.length, 'chars');
        console.log('[OAuth] - Redirect URI:', redirectUri);

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent',
        });

        console.log(`Opening Google OAuth URL on port ${port}`);
        await shell.openExternal(authUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });
}

export async function uploadVideoToYouTube(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  filePath: string;
  title: string;
  description?: string;
  privacy: 'public' | 'unlisted' | 'private';
  onProgress?: (progress: number) => void;
}): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(params.clientId, params.clientSecret);
  oauth2Client.setCredentials({ refresh_token: params.refreshToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const fileSize = fs.statSync(params.filePath).size;

  const res = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title: params.title, description: params.description ?? '' },
        status: { privacyStatus: params.privacy },
      },
      media: {
        mimeType: 'video/mp4',
        body: fs.createReadStream(params.filePath),
      },
    },
    {
      onUploadProgress: (evt: { bytesRead: number }) => {
        const progress = Math.round((evt.bytesRead / fileSize) * 100);
        params.onProgress?.(Math.min(progress, 99));
      },
    },
  );

  if (!res.data.id) throw new Error('Upload succeeded but no video ID was returned');
  return res.data.id;
}

function htmlPage(heading: string, body: string): string {
  return `<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#0f0f17;color:#e8e8f0;padding:48px;text-align:center"><h2>${heading}</h2><p style="color:#8888aa;margin-top:12px">${body}</p></body></html>`;
}
