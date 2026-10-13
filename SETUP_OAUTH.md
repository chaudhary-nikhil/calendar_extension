# OAuth Setup Guide for Chrome Extension

## The Problem
You're seeing: `Error: OAuth2 request failed: Service responded with error: 'bad client id'`

This happens because the OAuth client ID needs to be properly configured for Chrome extensions.

## Solution: Create a New OAuth Client ID

### Step 1: Get Your Extension ID

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Find your extension "Calendar Quick Add"
4. Copy the **Extension ID** (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

### Step 2: Create OAuth Client ID in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** > **Credentials**
4. Click **+ CREATE CREDENTIALS** > **OAuth client ID**

### Step 3: Configure OAuth Client

**IMPORTANT:** For Chrome extensions with Manifest V3, you have two options:

#### Option A: Chrome App (Recommended for extensions)

1. Select **Application type**: **Chrome App**
2. In the **Application ID** field, paste your Extension ID from Step 1
3. Click **Create**
4. Copy the **Client ID** that's generated
5. Update `manifest.json` with the new Client ID

#### Option B: Web Application (Alternative)

1. Select **Application type**: **Web application**
2. In **Authorized redirect URIs**, add:
   ```
   https://YOUR_EXTENSION_ID.chromiumapp.org/
   ```
   (Replace `YOUR_EXTENSION_ID` with your actual extension ID from Step 1)
3. Click **Create**
4. Copy the **Client ID** that's generated
5. Update `manifest.json` with the new Client ID

### Step 4: Update manifest.json

Replace the `client_id` in `manifest.json` with your new Client ID:

```json
"oauth2": {
    "client_id": "YOUR_NEW_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
        "https://www.googleapis.com/auth/calendar"
    ]
}
```

### Step 5: Enable Google Calendar API

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google Calendar API"
3. Click on it and press **Enable**

### Step 6: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace account)
3. Fill in required fields:
   - App name: "Calendar Quick Add"
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - Click **Add or Remove Scopes**
   - Search for and add: `https://www.googleapis.com/auth/calendar`
5. Add test users (if in testing mode):
   - Add your Google account email
6. Click **Save and Continue** through all steps

### Step 7: Test the Extension

1. Reload the extension in `chrome://extensions/`
2. Try selecting text and right-clicking "Add to Google Calendar"
3. You should see the Google OAuth consent screen
4. Grant permissions

## Troubleshooting

### Still Getting "bad client id" Error?

1. **Double-check the Client ID**: Make sure there are no extra spaces or characters
2. **Verify Extension ID**: The Extension ID must match exactly (for Chrome App type)
3. **Check Redirect URI**: For Web Application type, the redirect URI must be exactly: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
4. **Wait a few minutes**: Google's changes can take a minute to propagate
5. **Clear cached tokens**: 
   - Click the extension icon
   - Click "Sign Out"
   - Try again

### "Access blocked: This app's request is invalid"

- Make sure you've added yourself as a test user in OAuth consent screen
- If in "Testing" mode, only test users can use the app
- Consider publishing the app or adding more test users

### Extension ID Changed After Reload?

- The Extension ID changes when you reload an unpacked extension
- You'll need to update the OAuth client configuration with the new Extension ID
- Or use a fixed Extension ID by publishing to Chrome Web Store (even unlisted)


