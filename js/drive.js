/**
 * Google Drive REST API v3 for the one folder this app owns.
 * Pass fetch and getToken so tests can substitute both.
 * Scope is drive.file: only files this app creates are visible.
 */
import { DRIVE_FOLDER_NAME } from './config.js';

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

export function messageForDriveStatus(status, detail = '') {
  if (status === 401) return 'Your Google sign-in expired. Sign in again, then retry.';
  if (status === 403) {
    return 'Google Drive refused this request. Confirm the Drive API is enabled for this project.';
  }
  if (status === 404) return 'That file is no longer in Google Drive.';
  const text = String(detail || '').trim();
  return text || 'Google Drive could not complete that request.';
}

function folderQuery() {
  return `mimeType = '${FOLDER_MIME}' and name = '${DRIVE_FOLDER_NAME}' and trashed = false`;
}

function gamesQuery(folderId) {
  return `'${folderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
}

function multipartBody(metadata, jsonText) {
  const boundary = `jeopardy_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    jsonText,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

async function errorFromResponse(response) {
  let detail = '';
  try {
    const data = await response.json();
    detail = data?.error?.message || '';
  } catch {
    detail = '';
  }
  return new DriveError(messageForDriveStatus(response.status, detail), response.status);
}

/**
 * @param {{ fetchImpl?: typeof fetch, getToken: (options?: { interactive?: boolean, force?: boolean }) => Promise<string> }} options
 */
export function createDriveApi({ fetchImpl = fetch, getToken }) {
  async function request(url, options = {}, allowRetry = true) {
    const token = await getToken({ interactive: false });
    let response;
    try {
      response = await fetchImpl(url, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
        body: options.body,
        cache: 'no-store',
      });
    } catch {
      throw new DriveError('Could not reach Google Drive. Check your connection and try again.');
    }

    if (response.status === 401 && allowRetry) {
      await getToken({ interactive: true, force: true });
      return request(url, options, false);
    }
    if (!response.ok) throw await errorFromResponse(response);
    if (response.status === 204 || options.raw === 'empty') return null;
    if (options.raw === 'text') return response.text();
    return response.json();
  }

  async function ensureFolder() {
    const listed = await request(
      `${FILES}?q=${encodeURIComponent(folderQuery())}&fields=files(id,name)&pageSize=1&spaces=drive`,
    );
    const existing = listed.files?.[0];
    if (existing?.id) return existing.id;
    const created = await request(`${FILES}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    if (!created?.id) throw new DriveError('Google Drive did not create the Jeopardy Games folder.');
    return created.id;
  }

  async function listGames(folderId) {
    const files = [];
    let pageToken = '';
    do {
      const url = new URL(FILES);
      url.searchParams.set('q', gamesQuery(folderId));
      url.searchParams.set('fields', 'nextPageToken,files(id,name,modifiedTime)');
      url.searchParams.set('orderBy', 'modifiedTime desc');
      url.searchParams.set('pageSize', '50');
      url.searchParams.set('spaces', 'drive');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await request(url.toString());
      files.push(...(page.files || []).filter((file) => file && file.id && file.name));
      pageToken = page.nextPageToken || '';
    } while (pageToken && files.length < 200);
    return files;
  }

  async function saveGameFile({ folderId, fileId, name, jsonText }) {
    const metadata = { name, mimeType: 'application/json' };
    if (!fileId) metadata.parents = [folderId];
    const { body, contentType } = multipartBody(metadata, jsonText);
    const target = fileId
      ? `${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime`
      : `${UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime`;
    const saved = await request(target, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });
    if (!saved?.id) throw new DriveError('Google Drive did not return the saved file.');
    return saved;
  }

  function readGameFile(fileId) {
    return request(`${FILES}/${encodeURIComponent(fileId)}?alt=media`, { raw: 'text' });
  }

  function removeGameFile(fileId) {
    return request(`${FILES}/${encodeURIComponent(fileId)}`, { method: 'DELETE', raw: 'empty' });
  }

  return { ensureFolder, listGames, saveGameFile, readGameFile, removeGameFile };
}
