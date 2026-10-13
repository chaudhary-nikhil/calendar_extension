# How to Reload/Update the Extension

After making changes to `manifest.json` or any extension files:

1. **Open Chrome Extensions Page**
   - Go to `chrome://extensions/`
   - Or: Chrome Menu (three dots) → Extensions → Manage extensions

2. **Enable Developer Mode** (if not already enabled)
   - Toggle the switch in the top-right corner

3. **Reload the Extension**
   - Find "Calendar Quick Add" in your list of extensions
   - Click the **circular reload icon** (🔄) next to the extension
   - This reloads the extension with your updated `manifest.json`

4. **Verify the Update**
   - You should see the extension reload
   - Try selecting text and right-clicking "Add to Google Calendar"
   - The OAuth authentication should now work with your new Client ID

## Important Notes

- After reloading, you may need to re-authenticate (sign out and sign in again)
- If you get any errors, check the extension's service worker console:
  - Click "service worker" link under the extension details to see error messages
  - Or: Right-click extension icon → Inspect popup (for popup errors)

## If You Still Get "bad client id" Error

1. Double-check that the Client ID in `manifest.json` matches exactly what you copied from Google Cloud Console
2. Make sure you selected "Chrome App" type and entered your Extension ID correctly
3. Wait a minute or two - Google's changes sometimes take a moment to propagate
4. Check the service worker console for more detailed error messages


