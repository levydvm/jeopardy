/**
 * Export, import, and Google Drive. The board keeps saving to localStorage
 * either way. Drive is an extra copy the host can open on another browser.
 */
import { configuredClientId, DRIVE_FOLDER_NAME } from './config.js';
import { DriveError, createDriveApi } from './drive.js';
import { fileNameFromTitle, parseGameText, serializeGame } from './files.js';
import {
  accountLabel,
  fetchAccount,
  getAccessToken,
  hasFreshToken,
  prepareGoogleAuth,
  requestInteractiveToken,
  signOutGoogle,
} from './google-auth.js';

const LINK_KEY = 'jeopardy-drive-link-v1';
const MAX_IMPORT_BYTES = 1_500_000;

const note = document.getElementById('library-note');
const message = document.getElementById('library-message');
const signInButton = document.getElementById('google-sign-in');
const signOutButton = document.getElementById('google-sign-out');
const accountNode = document.getElementById('google-account');
const saveButton = document.getElementById('drive-save');
const openButton = document.getElementById('drive-open');
const exportButton = document.getElementById('export-json');
const importButton = document.getElementById('import-json');
const importInput = document.getElementById('import-file');
const saveDialog = document.getElementById('drive-save-dialog');
const saveHint = document.getElementById('drive-save-hint');
const saveName = document.getElementById('drive-file-name');
const saveError = document.getElementById('drive-save-error');
const saveCancel = document.getElementById('drive-save-cancel');
const saveNew = document.getElementById('drive-save-new');
const saveConfirm = document.getElementById('drive-save-confirm');
const openDialog = document.getElementById('drive-open-dialog');
const openStatus = document.getElementById('drive-open-status');
const fileList = document.getElementById('drive-file-list');
const openClose = document.getElementById('drive-open-close');

let getState = () => null;
let replaceGame = () => {};
let driveFile = null;
let account = null;
let gisReady = false;
let busy = false;
let folderId = '';

const drive = createDriveApi({
  getToken: (options) => getAccessToken(options),
});

function requireNode(node, id) {
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}

function setMessage(text, kind = 'ok') {
  if (!text) {
    message.hidden = true;
    message.textContent = '';
    message.className = 'status';
    return;
  }
  message.hidden = false;
  message.textContent = text;
  message.className = kind === 'error' ? 'warning' : 'status';
}

function setSaveError(text) {
  saveError.hidden = !text;
  saveError.textContent = text || '';
}

function readLink() {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.name !== 'string') return null;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(parsed.id)) return null;
    return { id: parsed.id, name: parsed.name.slice(0, 120) };
  } catch {
    return null;
  }
}

function writeLink(link) {
  try {
    if (!link) localStorage.removeItem(LINK_KEY);
    else localStorage.setItem(LINK_KEY, JSON.stringify(link));
  } catch {
    // The game itself already warns when localStorage is blocked.
  }
}

export function clearLinkedDriveFile() {
  driveFile = null;
  writeLink(null);
  renderChrome();
}

function rememberDriveFile(file) {
  driveFile = { id: file.id, name: file.name };
  writeLink(driveFile);
  renderChrome();
}

function renderChrome() {
  const configured = Boolean(configuredClientId());
  signInButton.hidden = !configured || Boolean(account);
  signOutButton.hidden = !account;
  accountNode.hidden = !account;
  saveButton.hidden = !account;
  openButton.hidden = !account;
  signInButton.disabled = !gisReady || busy;
  saveButton.disabled = busy;
  openButton.disabled = busy;
  exportButton.disabled = busy;
  importButton.disabled = busy;
  if (account) accountNode.textContent = `Signed in as ${accountLabel(account)}`;
  else accountNode.textContent = '';
}

function formatModified(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function downloadGame(game) {
  const blob = new Blob([serializeGame(game)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameFromTitle(game.title);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function readChosenFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMPORT_BYTES) {
      reject(new Error('That file is too large to import.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsText(file);
  });
}

function confirmReplace(name) {
  return window.confirm(
    `Replace the current game with “${name}”? Your current questions and scores will be replaced.`,
  );
}

function errorText(error) {
  if (error instanceof DriveError || error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

function withToken(action) {
  if (hasFreshToken()) {
    action();
    return;
  }
  let pending;
  try {
    pending = requestInteractiveToken();
  } catch (error) {
    setMessage(errorText(error), 'error');
    return;
  }
  pending.then(async (token) => {
    account = await fetchAccount(token);
    renderChrome();
    action();
  }).catch((error) => {
    setMessage(errorText(error), 'error');
  });
}

function openSaveDialog() {
  const state = getState();
  saveName.value = fileNameFromTitle(state?.title);
  setSaveError('');
  const linked = Boolean(driveFile);
  saveNew.hidden = !linked;
  saveConfirm.textContent = linked ? 'Save' : 'Save to Drive';
  saveHint.textContent = linked
    ? `Save updates “${driveFile.name}” in ${DRIVE_FOLDER_NAME}. Save as new keeps that file and adds another.`
    : `This adds a file to the ${DRIVE_FOLDER_NAME} folder in your Drive.`;
  if (!saveDialog.open) saveDialog.showModal();
  saveName.focus();
  saveName.select();
}

function startUpload(asNew) {
  const go = () => {
    upload(asNew);
  };
  if (hasFreshToken()) {
    go();
    return;
  }
  let pending;
  try {
    pending = requestInteractiveToken();
  } catch (error) {
    setSaveError(errorText(error));
    return;
  }
  pending.then(go).catch((error) => setSaveError(errorText(error)));
}

async function upload(asNew) {
  const name = fileNameFromTitle(saveName.value);
  saveName.value = name;
  setSaveError('');
  const fileId = !asNew && driveFile ? driveFile.id : '';
  saveConfirm.disabled = true;
  saveNew.disabled = true;
  saveCancel.disabled = true;
  try {
    if (!folderId) folderId = await drive.ensureFolder();
    const saved = await drive.saveGameFile({
      folderId,
      fileId,
      name,
      jsonText: serializeGame(getState()),
    });
    rememberDriveFile({ id: saved.id, name: saved.name || name });
    saveDialog.close();
    setMessage(
      asNew || !fileId
        ? `Saved a new copy, “${saved.name || name}”, to ${DRIVE_FOLDER_NAME}.`
        : `Saved “${saved.name || name}” to ${DRIVE_FOLDER_NAME}.`,
      'ok',
    );
  } catch (error) {
    if (error instanceof DriveError && error.status === 404 && fileId) {
      clearLinkedDriveFile();
      saveNew.hidden = true;
      saveConfirm.textContent = 'Save to Drive';
      saveHint.textContent = `That Drive file is gone. Saving now adds a new file in ${DRIVE_FOLDER_NAME}.`;
      setSaveError('That Drive file is no longer there. Save again to create a new one.');
    } else {
      setSaveError(errorText(error));
    }
  } finally {
    saveConfirm.disabled = false;
    saveNew.disabled = false;
    saveCancel.disabled = false;
  }
}

function renderFileList(files) {
  fileList.replaceChildren();
  if (files.length === 0) {
    openStatus.textContent = `No saved games in ${DRIVE_FOLDER_NAME} yet.`;
    return;
  }
  openStatus.textContent = `${files.length} saved game${files.length === 1 ? '' : 's'}.`;
  for (const file of files) {
    const row = document.createElement('li');
    row.className = 'file-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'file-open';
    const title = document.createElement('span');
    title.textContent = file.name;
    const when = document.createElement('small');
    when.textContent = formatModified(file.modifiedTime);
    open.append(title, when);
    open.addEventListener('click', () => loadDriveFile(file));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${file.name}`);
    remove.addEventListener('click', () => deleteDriveFile(file, row));
    row.append(open, remove);
    fileList.append(row);
  }
}

async function refreshList() {
  openStatus.textContent = 'Loading saved games…';
  fileList.replaceChildren();
  try {
    if (!folderId) folderId = await drive.ensureFolder();
    const files = await drive.listGames(folderId);
    renderFileList(files);
  } catch (error) {
    openStatus.textContent = errorText(error);
  }
}

function openBrowser() {
  if (!openDialog.open) openDialog.showModal();
  refreshList();
}

async function loadDriveFile(file) {
  openStatus.textContent = `Opening “${file.name}”…`;
  try {
    const text = await drive.readGameFile(file.id);
    const parsed = parseGameText(text);
    if (!parsed.game) {
      openStatus.textContent = parsed.error;
      return;
    }
    if (!confirmReplace(file.name)) {
      openStatus.textContent = 'Open cancelled.';
      return;
    }
    replaceGame(parsed.game);
    rememberDriveFile({ id: file.id, name: file.name });
    openDialog.close();
    setMessage(`Opened “${file.name}” from ${DRIVE_FOLDER_NAME}.`, 'ok');
  } catch (error) {
    openStatus.textContent = errorText(error);
  }
}

async function deleteDriveFile(file, row) {
  const ok = window.confirm(`Delete “${file.name}” from Google Drive? This cannot be undone.`);
  if (!ok) return;
  row.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  try {
    await drive.removeGameFile(file.id);
    if (driveFile?.id === file.id) clearLinkedDriveFile();
    row.remove();
    const remaining = fileList.children.length;
    openStatus.textContent = remaining
      ? `Deleted “${file.name}”.`
      : `No saved games in ${DRIVE_FOLDER_NAME} yet.`;
    setMessage(`Deleted “${file.name}” from ${DRIVE_FOLDER_NAME}.`, 'ok');
  } catch (error) {
    row.querySelectorAll('button').forEach((button) => {
      button.disabled = false;
    });
    openStatus.textContent = errorText(error);
  }
}

function onExport() {
  downloadGame(getState());
  setMessage(`Exported ${fileNameFromTitle(getState().title)}.`, 'ok');
}

async function onImportFile() {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  try {
    const text = await readChosenFile(file);
    const parsed = parseGameText(text);
    if (!parsed.game) {
      setMessage(parsed.error, 'error');
      return;
    }
    if (!confirmReplace(file.name)) return;
    replaceGame(parsed.game);
    setMessage(`Imported “${file.name}”.`, 'ok');
  } catch (error) {
    setMessage(errorText(error), 'error');
  }
}

function bind() {
  signInButton.addEventListener('click', () => {
    setMessage('');
    let pending;
    try {
      pending = requestInteractiveToken();
    } catch (error) {
      setMessage(errorText(error), 'error');
      return;
    }
    pending
      .then(async (token) => {
        account = await fetchAccount(token);
        setMessage(`Signed in as ${accountLabel(account)}.`, 'ok');
        renderChrome();
      })
      .catch((error) => {
        account = null;
        setMessage(errorText(error), 'error');
        renderChrome();
      });
  });

  signOutButton.addEventListener('click', () => {
    signOutGoogle();
    account = null;
    folderId = '';
    setMessage('Signed out of Google. This browser still has the current game.', 'ok');
    renderChrome();
  });

  saveButton.addEventListener('click', () => {
    setMessage('');
    withToken(openSaveDialog);
  });
  openButton.addEventListener('click', () => {
    setMessage('');
    withToken(openBrowser);
  });
  saveCancel.addEventListener('click', () => saveDialog.close());
  saveConfirm.addEventListener('click', () => startUpload(false));
  saveNew.addEventListener('click', () => startUpload(true));
  openClose.addEventListener('click', () => openDialog.close());
  exportButton.addEventListener('click', onExport);
  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', onImportFile);
}

export function initLibrary({ getState: readState, replaceGame: swapGame }) {
  requireNode(note, 'library-note');
  requireNode(message, 'library-message');
  getState = readState;
  replaceGame = swapGame;
  driveFile = readLink();
  bind();
  renderChrome();

  if (!configuredClientId()) {
    note.hidden = false;
    note.textContent = 'Google sign-in is off until a Client ID is added in js/config.js. Export and Import still work on this device.';
    return;
  }
  note.hidden = true;

  prepareGoogleAuth()
    .then(async () => {
      gisReady = true;
      renderChrome();
      try {
        const token = await getAccessToken({ interactive: false });
        account = await fetchAccount(token);
      } catch {
        account = null;
      }
      renderChrome();
    })
    .catch((error) => {
      gisReady = false;
      renderChrome();
      setMessage(errorText(error), 'error');
    });
}
