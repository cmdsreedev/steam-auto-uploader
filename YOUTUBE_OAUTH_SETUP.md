# Google OAuth Setup for YouTube Upload

This guide will help you set up Google OAuth credentials for the Steam Auto Uploader to upload videos to YouTube.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Create a new project:
   - Click the project dropdown at the top
   - Click "NEW PROJECT"
   - Enter a name (e.g., "Steam Auto Uploader")
   - Click "CREATE"
4. Wait for the project to be created, then select it

## Step 2: Enable the YouTube Data API v3

1. In the Cloud Console, go to **APIs & Services** → **Library**
2. Search for "YouTube Data API v3"
3. Click on it and click the **ENABLE** button
4. Wait for the API to be enabled

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** at the top
3. Select "OAuth client ID"
4. If prompted to create a consent screen:
   - Choose "External" user type
   - Click "CREATE"
   - Fill in the required fields:
     - App name: "Steam Auto Uploader"
     - User support email: Your email
     - Developer contact: Your email
   - Click "SAVE AND CONTINUE"
   - On the scopes page, click "ADD OR REMOVE SCOPES"
     - Search for "YouTube Data API v3"
     - Select the checkbox for "YouTube Data API v3"
     - Click "UPDATE"
   - Click "SAVE AND CONTINUE"
   - Review and click "BACK TO DASHBOARD"

5. Now create the OAuth client:
   - Click **+ CREATE CREDENTIALS**
   - Select "OAuth client ID"
   - Choose "Desktop application" as the application type
   - Enter a name (e.g., "Steam Auto Uploader Desktop")
   - Click "CREATE"

## Step 4: Copy Your Credentials

1. In the **Credentials** page, find your newly created OAuth client
2. Click the download icon (⬇️) to download the JSON file
3. Open the downloaded JSON file with a text editor
4. You'll need these two values:
   - `client_id` → Copy to "OAuth Client ID" in Settings
   - `client_secret` → Copy to "OAuth Client Secret" in Settings

## Step 5: Configure Steam Auto Uploader

1. Open Steam Auto Uploader
2. Click **Settings** (gear icon)
3. Scroll to the **YouTube** section
4. Paste your credentials:
   - **OAuth Client ID**: Paste the `client_id` from step 4
   - **OAuth Client Secret**: Paste the `client_secret` from step 4
5. Click **"Authorize with Google"**
6. A browser window will open asking you to sign in with your Google account
7. Review the permissions and click **"Allow"**
8. You'll see a success message - close that tab and return to the app
9. You should now see your YouTube channel name displayed
10. Click **"Save Settings"**

## Testing the Integration

1. After authorization, try uploading a video:
   - Right-click on a converted video in the main view
   - Select "Upload to YouTube"
   - Choose privacy settings
   - Click "Upload"
2. The upload progress will appear in the "Progress" column
3. Once complete, you can click the YouTube icon to view the video

## Troubleshooting

### "Authorization failed" or button doesn't work

**Check Developer Console:**
1. Open DevTools in the app: **Ctrl+Shift+I** (or **Cmd+Option+I** on Mac)
2. Go to the **Console** tab
3. Look for any error messages
4. Common issues:
   - **"Client ID and Client Secret are required"** - Make sure both fields are filled
   - **"Authorization denied"** - You may have declined permissions. Try again.
   - **"No channel found"** - Your account might not have a YouTube channel. Create one at YouTube.com

### "Invalid OAuth client" or "Forbidden"

- Make sure you're using credentials from the correct project
- Verify the OAuth client type is "Desktop application"
- Check that YouTube Data API v3 is enabled in your project

### Authorization times out

- Your firewall might be blocking the localhost callback
- Firewall rules might need to allow `127.0.0.1:*`
- Close the browser tab after 5 minutes and try again

### Upload fails with permission error

- Make sure YouTube Data API v3 is enabled in your project
- Try disconnecting and re-authorizing your account
- Check that your YouTube account has permission to upload videos

## Security Notes

- **Keep your Client Secret private** - Never share it or commit it to version control
- **Refresh tokens are stored locally** - They're encrypted in the app's local database
- **To revoke access:** Go to [Google Account permissions](https://myaccount.google.com/permissions) and remove "Steam Auto Uploader"

## API Quotas

Google's YouTube API has daily quotas:
- Standard quota: 10,000 units per day
- Each video upload costs approximately 1,600 quota units (depending on size)
- You can upload ~6 videos per day with the free quota
- For higher limits, apply for quota increase in the Cloud Console

## Still Having Issues?

1. Check the app's DevTools console (Ctrl+Shift+I) for detailed error messages
2. Verify all credentials are correct (copy-paste to avoid typos)
3. Make sure your Google account can upload videos to YouTube
4. Try disconnecting and re-authorizing
5. Restart the app and try again
