/**
 * Google sign-in settings. This is the only file you need to edit
 * to turn Drive saving on. A Client ID is public and safe to commit.
 * Leave GOOGLE_CLIENT_ID empty to play offline with no Google features.
 *
 * Setup steps are in the README, under "Google Drive".
 */
export const GOOGLE_CLIENT_ID = '1057652038968-qkqs8ogiin06rtlg2c64l1teik51ng5d.apps.googleusercontent.com';

/**
 * drive.file can only see files this app creates or opens.
 * The profile scopes are what let the page show the signed-in name and email.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export const DRIVE_FOLDER_NAME = 'Jeopardy Games';

export function configuredClientId() {
  return typeof GOOGLE_CLIENT_ID === 'string' ? GOOGLE_CLIENT_ID.trim() : '';
}
