/**
 * Google OAuth Configuration
 * Loads client credentials from environment variables
 * These should be set via .env file during development
 * and via environment variables during distribution
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  // Try multiple naming conventions
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.VITE_GOOGLE_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[OAuth Config] Missing credentials:');
    console.error('[OAuth Config] GOOGLE_OAUTH_CLIENT_ID:', !!process.env.GOOGLE_OAUTH_CLIENT_ID);
    console.error('[OAuth Config] VITE_GOOGLE_CLIENT_ID:', !!process.env.VITE_GOOGLE_CLIENT_ID);
    console.error('[OAuth Config] GOOGLE_CLIENT_ID:', !!process.env.GOOGLE_CLIENT_ID);
    console.error('[OAuth Config] GOOGLE_OAUTH_CLIENT_SECRET:', !!process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    console.error('[OAuth Config] VITE_GOOGLE_CLIENT_SECRET:', !!process.env.VITE_GOOGLE_CLIENT_SECRET);
    console.error('[OAuth Config] GOOGLE_CLIENT_SECRET:', !!process.env.GOOGLE_CLIENT_SECRET);

    throw new Error(
      'Google OAuth credentials not configured. ' +
      'Please set environment variables:\n' +
      '  GOOGLE_OAUTH_CLIENT_ID\n' +
      '  GOOGLE_OAUTH_CLIENT_SECRET\n' +
      'in your .env file.'
    );
  }

  console.log('[OAuth Config] ✓ Credentials loaded');
  console.log('[OAuth Config] Client ID length:', clientId.length, 'characters');
  console.log('[OAuth Config] Client Secret length:', clientSecret.length, 'characters');
  console.log('[OAuth Config] Client ID starts with:', clientId.substring(0, 20) + '...');
  return {
    clientId,
    clientSecret,
  };
}
