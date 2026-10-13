# Fix: "Access blocked: has not completed the Google verification process"

## The Problem

You're seeing: `Access blocked: Calendar Extension has not completed the Google verification process`

This happens because your OAuth consent screen is in **Testing** mode, which means only developer-approved test users can use the app.

## Quick Fix: Add Yourself as a Test User

### Step 1: Go to OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **OAuth consent screen**

### Step 2: Add Test Users

1. Scroll down to the **Test users** section
2. Click **+ ADD USERS**
3. Enter your email address: `reachnikhilc@gmail.com`
4. Click **Add**
5. You can add multiple test users if needed

### Step 3: Reload and Try Again

1. Go back to Chrome and try selecting text again
2. Right-click and choose "Add to Google Calendar"
3. You should now be able to authenticate!

## Important Notes

- **Test users only**: In Testing mode, only the emails you add as test users can use the extension
- **Add all users**: If you want family/friends to use it, add their emails as test users too
- **Publishing (optional)**: If you want anyone to use it without being added as a test user, you can publish the app (requires verification for sensitive scopes like Calendar)

## If You Still Have Issues

1. Make sure you clicked "Save" after adding test users
2. Wait a minute for changes to propagate
3. Try signing out in the extension popup and signing back in
4. Clear your browser cache or try incognito mode


