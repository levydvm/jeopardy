/**
 * Google Identity Services token client. No client secret and no backend.
 * The access token stays in memory and is requested again when it expires.
 */
import { GOOGLE_SCOPES, configuredClientId } from './config.js';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

let scriptPromise = null;
let tokenClient = null;
let accessToken = '';
let expiresAt = 0;
let inflight = null;
let onToken = () => {};
let onTokenError = () => {};

export function messageForAuthError(type) {
  switch (type) {
    case 'popup_closed':
    case 'access_denied':
      return 'Google sign-in was cancelled.';
    case 'popup_failed_to_open':
      return 'The Google sign-in window was blocked. Allow pop-ups for this site and try again.';
    default:
      return 'Google sign-in did not finish. Try again.';
  }
}

export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error('Google sign-in loaded, but it was not ready. Refresh and try again.'));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not be loaded. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function requestToken(prompt) {
  if (inflight) return inflight;
  inflight = new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    if (prompt === 'none') {
      timer = setTimeout(() => finish(reject, new Error(messageForAuthError(''))), 8000);
    }
    onToken = (response) => {
      if (!response || response.error || !response.access_token) {
        finish(reject, new Error(messageForAuthError(response?.error)));
        return;
      }
      accessToken = response.access_token;
      const seconds = Number(response.expires_in) || 3600;
      expiresAt = Date.now() + seconds * 1000;
      finish(resolve, accessToken);
    };
    onTokenError = (error) => {
      finish(reject, new Error(messageForAuthError(error?.type || error?.message)));
    };
    tokenClient.callback = onToken;
    try {
      tokenClient.requestAccessToken({ prompt });
    } catch (error) {
      finish(reject, error instanceof Error ? error : new Error(messageForAuthError('')));
    }
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function prepareGoogleAuth() {
  const clientId = configuredClientId();
  if (!clientId) throw new Error('Add a Google Client ID in js/config.js before signing in.');
  await loadGoogleIdentity();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (response) => onToken(response),
      error_callback: (error) => onTokenError(error),
    });
  }
}

export function hasFreshToken() {
  return Boolean(accessToken) && Date.now() < expiresAt - 60_000;
}

/** Opens the account chooser. Call it directly from a click so the popup is allowed. */
export function requestInteractiveToken() {
  if (!tokenClient) throw new Error('Google sign-in is still loading. Try again in a moment.');
  accessToken = '';
  expiresAt = 0;
  return requestToken('select_account');
}

export async function getAccessToken({ interactive = false, force = false } = {}) {
  if (!force && hasFreshToken()) return accessToken;
  if (force) {
    accessToken = '';
    expiresAt = 0;
  }
  await prepareGoogleAuth();
  if (!interactive) {
    try {
      return await requestToken('none');
    } catch (error) {
      accessToken = '';
      expiresAt = 0;
      throw error;
    }
  }
  return requestToken('select_account');
}

export async function fetchAccount(token) {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return { name: '', email: '' };
    const data = await response.json();
    return {
      name: typeof data.name === 'string' ? data.name : '',
      email: typeof data.email === 'string' ? data.email : '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

export function accountLabel(account) {
  if (account?.name && account?.email) return `${account.name} (${account.email})`;
  if (account?.email) return account.email;
  if (account?.name) return account.name;
  return 'your Google account';
}

export function signOutGoogle() {
  const token = accessToken;
  accessToken = '';
  expiresAt = 0;
  if (!token || !window.google?.accounts?.oauth2?.revoke) return Promise.resolve();
  return new Promise((resolve) => {
    window.google.accounts.oauth2.revoke(token, () => resolve());
  });
}
