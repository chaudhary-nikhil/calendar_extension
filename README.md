# Calendar Quick Add - Chrome Extension

A Chrome extension that allows you to quickly add events to Google Calendar by selecting text on any webpage.

## Features

- **Text Selection**: Select text on any webpage and right-click to see "Add to Google Calendar" option
- **Smart Parsing**: Automatically extracts dates, times, and event titles from selected text
- **Direct Integration**: Adds events directly to your Google Calendar using the Google Calendar API
- **Manual Entry**: Use the popup to manually create events with date/time pickers

## Setup Instructions

### 1. Google Cloud Console Setup

**⚠️ IMPORTANT: OAuth Setup Required**

If you're getting an "OAuth2 request failed: bad client id" error, follow the detailed guide in **[SETUP_OAUTH.md](./SETUP_OAUTH.md)**.

Quick steps:
1. Get your Extension ID from `chrome://extensions/`
2. Create a new OAuth 2.0 Client ID in Google Cloud Console
   - Choose "Chrome App" type and enter your Extension ID
   - OR choose "Web application" and add redirect URI: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
3. Enable Google Calendar API
4. Configure OAuth Consent Screen
5. Update the `client_id` in `manifest.json` with your new Client ID

See **[SETUP_OAUTH.md](./SETUP_OAUTH.md)** for detailed step-by-step instructions with troubleshooting.

### 2. Install the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the extension directory
5. The extension should now be installed

### 3. First Use

1. Click the extension icon in the Chrome toolbar
2. Select text on any webpage
3. Right-click and choose "Add to Google Calendar"
4. The first time you use it, you'll be prompted to authenticate with Google
5. Grant calendar permissions
6. The event will be added to your calendar automatically

## Usage

### Method 1: Context Menu (Recommended)

1. Select text on any webpage that contains event information
   - Example: "Meeting tomorrow at 3:00 PM"
   - Example: "Dentist appointment on 12/25/2024 at 10:00 AM"
   - Example: "Team standup January 15, 2024 9:00am"

2. Right-click on the selected text
3. Choose "Add to Google Calendar" from the context menu
4. The extension will:
   - Parse the text for dates and times
   - Extract the event title
   - Add the event to your Google Calendar
   - Show a notification confirming the addition

### Method 2: Extension Popup

1. Click the extension icon in the Chrome toolbar
2. Fill in the event details:
   - Event Title (required)
   - Date (defaults to today)
   - Time (defaults to 1 hour from now)
3. Click "Add to Calendar"
4. The event will be added to your Google Calendar

## Supported Date/Time Formats

The extension can parse various date and time formats:

### Dates
- MM/DD/YYYY or MM-DD-YYYY: `12/25/2024`, `01-15-2024`
- YYYY-MM-DD: `2024-12-25`
- Month Day, Year: `January 15, 2024`, `Jan 15 2024`
- Relative dates: `today`, `tomorrow`
- Relative phrases: `next week`, `in 3 days`

### Times
- 12-hour format: `3:00 PM`, `10:30am`, `2:15 PM`
- 24-hour format: `15:00`, `09:30`

## File Structure

- `manifest.json` - Extension configuration and permissions
- `background.js` - Service worker for context menu, API calls, and event creation
- `content.js` - Content script for detecting text selection
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality and UI logic

## Permissions

The extension requires the following permissions:
- `identity` - For Google OAuth authentication
- `contextMenus` - To add the right-click menu option
- `storage` - To store parsed event data temporarily
- `activeTab` - To access the current webpage
- `notifications` - To show success/error messages

## Troubleshooting

### Authentication Issues

If you see authentication errors:
1. Check that your Client ID in `manifest.json` matches your Google Cloud Console credentials
2. Ensure the Google Calendar API is enabled in your Google Cloud project
3. Try signing out and signing back in using the "Sign Out" button in the popup

### Events Not Being Created

1. Check the browser console for error messages
2. Verify you've granted calendar permissions
3. Try signing out and signing back in
4. Check that your Google account has access to Google Calendar

### Date/Time Not Parsed Correctly

The extension uses pattern matching to extract dates and times. If your format isn't recognized:
- Use the popup to manually enter the date and time
- Try formatting your text more explicitly (e.g., "Meeting on 12/25/2024 at 3:00 PM")

## Notes

- The extension requires an internet connection to communicate with Google Calendar API
- Events are added to your primary calendar
- Default event duration is 1 hour if no end time is specified
- The extension respects your browser's timezone settings

