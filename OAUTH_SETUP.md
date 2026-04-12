# Google OAuth Setup for Steam Auto Uploader

## Required Configuration

This app uses **fixed port 9874** for OAuth redirect. You must configure this in Google Cloud Console.

## Steps to Configure Google Cloud Credentials

### 1. Go to Google Cloud Console
- Visit: https://console.cloud.google.com
- Select your project

### 2. Navigate to OAuth Credentials
- Left menu: **APIs & Services** → **Credentials**

### 3. Edit OAuth 2.0 Client ID
- Find your "OAuth 2.0 Client ID" (type: "Desktop application")
- Click **Edit**

### 4. Add Authorized Redirect URI
Under **Authorized redirect URIs**, make sure you have:
```
http://127.0.0.1:9874
```

**Important:** Must include the port number `:9874`

### 5. Save and Copy Credentials
- Click **Save**
- Click on the OAuth client to view details
- Copy the credentials (you'll see "Client ID" and "Client Secret")

## Setting Environment Variables

### Create/Edit `.env` file
In the root of the project, create or edit `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_OAUTH_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

Replace with your actual Client ID and Secret from Google Cloud Console.

## Troubleshooting

### "Redirect URI mismatch" error
- Check that `http://127.0.0.1:9874` is in Google Cloud's Authorized Redirect URIs
- The port number is critical — cannot omit it

### "Authorization code not received"
- Make sure you're logged into Google with the correct account
- Clear browser cache/cookies if you see cached auth screens
- Try in an incognito window if issues persist

### App says "getToken() timed out"
- Check internet connectivity
- Verify Client ID and Secret are correct
- Ensure the credentials are for a valid Google Cloud project with YouTube API enabled

## Verifying Setup

When you launch the app and click "Authorize with Google":
1. Your browser opens Google's login screen
2. You see permission request for YouTube scopes
3. After consent, you're redirected to `http://127.0.0.1:9874`
4. The browser shows "✓ Authorization successful!"
5. The app displays your YouTube channel info

If you see an error instead, check the app's Developer Console (press F12) for detailed error messages prefixed with `[OAuth]`.
