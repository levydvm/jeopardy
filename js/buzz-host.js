/**
 * Host buzzer panel, countdown, and the link to phone clicks.
 * Scoring still goes through the normal team buttons when no phone has joined.
 */
import {
  allowsTeamBuzz,
  fractionLeft,
  freshBuzz,
  isDailyDoubleClue,
  markCorrect,
  markIncorrect,
  noteEarlyBuzz,
  openBuzzWindow,
  phoneStatus,
  receiveBuzz,
  secondsLeft,
  startAnswerClock,
  tickBuzz,
} from './buzzer.js';
import { teamLabel } from './game.js';
import { normalizeTimers } from './timers.js';
import {
  joinUrl,
  loadRoomCode,
  makeRoomCode,
  saveRoomCode,
  startLocalHost,
  startPeerHost,
  transportMode,
} from './room.js';
import { setBuzzHighlight } from './ui.js';

const panel = document.getElementById('buzz-panel');
const openButton = document.getElementById('open-buzzers');
const codeNode = document.getElementById('buzz-code');
const urlNode = document.getElementById('buzz-url');
const qrCanvas = document.getElementById('buzz-qr');
const linkList = document.getElementById('buzz-links');
const statusNode = document.getElementById('buzz-status');
const meter = document.getElementById('buzz-meter');
const meterFill = document.getElementById('buzz-meter-fill');
const meterLabel = document.getElementById('buzz-meter-label');
const banner = document.getElementById('buzz-banner');
const openBuzzing = document.getElementById('open-buzzing');
const closeBuzzing = document.getElementById('close-buzzing');
const timersEnabled = document.getElementById('timers-enabled');
const buzzSeconds = document.getElementById('timers-buzz');
const answerSeconds = document.getElementById('timers-answer');
const ddSeconds = document.getElementById('timers-dd');
const autoMark = document.getElementById('timers-auto');
const earlySeconds = document.getElementById('timers-early');

let getState = () => null;
let persist = () => {};
let applyIncorrect = () => {};
let buzz = freshBuzz();
let room = null;
let roomCode = '';
let clueKey = '';
let ddDeadline = 0;
let ddTotal = 0;
let ddSignaled = false;
let bannerText = '';

function timersOf(state) {
  return normalizeTimers(state?.timers);
}

function drawQr(text) {
  if (!qrCanvas || !window.qrcode) return;
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = 180;
  const cell = size / count;
  qrCanvas.width = size;
  qrCanvas.height = size;
  const context = qrCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#071033';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) context.fillRect(col * cell, row * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

function publicState(state, teamIndex) {
  const clue = allowsTeamBuzz(state);
  const dailyDouble = isDailyDoubleClue(state);
  return {
    type: 'state',
    teams: state.teams.map((team, index) => ({ index, name: teamLabel(state, index) })),
    phase: buzz.phase,
    winner: buzz.winner,
    lockedOut: buzz.lockedOut,
    secondsLeft: clockSeconds(state),
    status: phoneStatus(buzz, teamIndex, Boolean(state.openClue), dailyDouble && !clue),
    clueOpen: Boolean(state.openClue) && (state.openClue.stage || 'clue') === 'clue',
    dailyDouble,
    earlyLockoutSeconds: timersOf(state).earlyLockoutSeconds,
    fraction: clockFraction(state),
  };
}

function clockFraction(state) {
  const now = Date.now();
  if (isDailyDoubleClue(state) && ddTotal) {
    return Math.max(0, Math.min(1, (ddDeadline - now) / ddTotal));
  }
  return fractionLeft(buzz, now);
}

function clockSeconds(state) {
  const now = Date.now();
  if (isDailyDoubleClue(state) && ddDeadline) {
    return Math.max(0, Math.ceil((ddDeadline - now) / 1000));
  }
  return secondsLeft(buzz, now);
}

function broadcast() {
  if (!room) return;
  const state = getState();
  room.phones.forEach((record, id) => {
    room.send(id, publicState(state, record.teamIndex));
  });
}

function renderLinks(state) {
  linkList.replaceChildren();
  const byTeam = new Map();
  room?.phones.forEach((record) => {
    if (record.teamIndex != null && record.open !== false) byTeam.set(record.teamIndex, true);
  });
  state.teams.forEach((team, index) => {
    const item = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = byTeam.has(index) ? 'buzz-dot on' : 'buzz-dot';
    const label = document.createElement('span');
    label.textContent = `${teamLabel(state, index)}${byTeam.has(index) ? ' · phone connected' : ' · no phone'}`;
    item.append(dot, label);
    linkList.append(item);
  });
  if (state.teams.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No teams yet. A phone can type a name.';
    linkList.append(item);
  }
}

function renderMeter(state) {
  const now = Date.now();
  const daily = isDailyDoubleClue(state);
  const active = daily ? Boolean(ddDeadline) && !ddSignaled : buzz.phase === 'window' || buzz.phase === 'answering';
  meter.hidden = !active;
  if (!active) return;
  let fraction = 1;
  let label = '';
  if (daily) {
    fraction = ddTotal ? Math.max(0, Math.min(1, (ddDeadline - now) / ddTotal)) : 0;
    label = `Answer ${Math.max(0, Math.ceil((ddDeadline - now) / 1000))}`;
    meter.dataset.kind = 'answer';
  } else if (buzz.phase === 'window') {
    fraction = buzz.deadline ? fractionLeft(buzz, now) : 1;
    const left = secondsLeft(buzz, now);
    label = left == null ? 'Buzzing open' : `Buzz ${left}`;
    meter.dataset.kind = 'buzz';
  } else {
    fraction = buzz.deadline ? fractionLeft(buzz, now) : 1;
    const left = secondsLeft(buzz, now);
    const who = buzz.winner == null ? 'Team' : teamLabel(state, buzz.winner);
    label = left == null ? `${who} is answering` : `${who} ${left}`;
    meter.dataset.kind = 'answer';
  }
  meterFill.style.transform = `scaleX(${fraction})`;
  meterLabel.textContent = label;
}

function syncView() {
  const state = getState();
  if (!state) return;
  syncClue(state);
  renderSettings(state);
  renderLinks(state);
  renderMeter(state);
  renderBanner(state);
  if (room) broadcast();
}

function renderBanner(state) {
  banner.hidden = !bannerText;
  banner.textContent = bannerText;
  const highlight = buzz.phase === 'answering' || buzz.phase === 'closed' ? buzz.winner : null;
  setBuzzHighlight(highlight);
  const canBuzz = allowsTeamBuzz(state);
  openBuzzing.hidden = !canBuzz || buzz.phase === 'window' || buzz.phase === 'answering';
  closeBuzzing.hidden = buzz.phase !== 'window';
  openButton.hidden = state.mode !== 'play';
}

function renderSettings(state) {
  const timers = timersOf(state);
  if (document.activeElement !== timersEnabled) timersEnabled.checked = timers.enabled;
  if (document.activeElement !== autoMark) autoMark.checked = timers.autoMarkOnTimeout;
  if (document.activeElement !== buzzSeconds) buzzSeconds.value = String(timers.buzzSeconds);
  if (document.activeElement !== answerSeconds) answerSeconds.value = String(timers.answerSeconds);
  if (document.activeElement !== ddSeconds) ddSeconds.value = String(timers.dailyDoubleSeconds);
  if (document.activeElement !== earlySeconds) earlySeconds.value = String(timers.earlyLockoutSeconds);
}

function setStatus(text) {
  statusNode.textContent = text;
}

function ensureRoom() {
  if (room) return;
  roomCode = loadRoomCode() || makeRoomCode();
  saveRoomCode(roomCode);
  const hooks = {
    onMessage: onPhoneMessage,
    onStatus: (kind, detail) => {
      if (kind === 'ready') setStatus('Room is open. Phones can join.');
      else if (kind === 'taken') {
        room?.close();
        room = null;
        roomCode = makeRoomCode();
        saveRoomCode(roomCode);
        ensureRoom();
      } else if (kind === 'reconnecting') setStatus('Reconnecting the buzzer room…');
      else if (kind === 'error') setStatus(detail || 'Buzzers are unavailable on this network.');
    },
  };
  room = transportMode() === 'local' ? startLocalHost(roomCode, hooks) : startPeerHost(roomCode, hooks);
  const url = joinUrl(roomCode);
  codeNode.textContent = roomCode;
  urlNode.textContent = url;
  urlNode.href = url;
  drawQr(url);
}

function claimTeam(id, payload) {
  const state = getState();
  const record = room.phones.get(id);
  if (!record) return;
  let teamIndex = Number.isInteger(payload.teamIndex) ? payload.teamIndex : null;
  if (teamIndex == null && payload.name && state.teams.length === 0) {
    teamIndex = null;
  } else if (teamIndex == null && typeof payload.name === 'string') {
    const wanted = payload.name.trim().toLowerCase();
    teamIndex = state.teams.findIndex((team, index) => teamLabel(state, index).toLowerCase() === wanted);
  }
  if (state.teams.length > 0 && (teamIndex == null || !state.teams[teamIndex])) {
    room.send(id, { type: 'reject', reason: 'Pick a team from the list.' });
    return;
  }
  room.phones.forEach((other, otherId) => {
    if (otherId !== id && other.teamIndex === teamIndex) {
      other.teamIndex = null;
      room.send(otherId, { type: 'reject', reason: 'This team was opened on another phone.' });
    }
  });
  record.teamIndex = teamIndex;
  record.open = true;
  room.send(id, publicState(state, teamIndex));
  renderLinks(state);
}

function onPhoneMessage(id, payload) {
  if (!payload || typeof payload !== 'object') return;
  const state = getState();
  if (payload.type === 'disconnect') {
    renderLinks(state);
    broadcast();
    return;
  }
  if (payload.type === 'hello' || payload.type === 'join') {
    if (payload.type === 'join') claimTeam(id, payload);
    else room.send(id, publicState(state, room.phones.get(id)?.teamIndex ?? null));
    renderLinks(state);
    return;
  }
  if (payload.type === 'early') {
    const teamIndex = room.phones.get(id)?.teamIndex;
    buzz = noteEarlyBuzz(buzz, teamIndex, timersOf(state), Date.now());
    const view = publicState(state, teamIndex);
    view.status = 'too-early';
    room.send(id, view);
    return;
  }
  if (payload.type !== 'buzz') return;
  const teamIndex = room.phones.get(id)?.teamIndex;
  const buzzingClosed = buzz.phase === 'idle' || buzz.phase === 'closed';
  if (buzzingClosed && allowsTeamBuzz(state)) {
    buzz = noteEarlyBuzz(buzz, teamIndex, timersOf(state), Date.now());
    const view = publicState(state, teamIndex);
    view.status = 'too-early';
    room.send(id, view);
    return;
  }
  const result = receiveBuzz(buzz, teamIndex, Date.now());
  if (!result.accepted) {
    const view = publicState(state, teamIndex);
    if (result.reason === 'early') view.status = 'too-early';
    room.send(id, view);
    return;
  }
  buzz = startAnswerClock(result.buzz, timersOf(state), Date.now());
  bannerText = `${teamLabel(state, teamIndex)} buzzed in.`;
  syncView();
}

function applyTick(state) {
  const now = Date.now();
  const timers = timersOf(state);
  if (isDailyDoubleClue(state) && ddDeadline && !ddSignaled && timers.enabled && now >= ddDeadline) {
    ddSignaled = true;
    ddDeadline = 0;
    const teamIndex = state.openClue?.wagerTeam;
    if (timers.autoMarkOnTimeout && teamIndex != null) {
      bannerText = `Time is up. ${teamLabel(state, teamIndex)} is marked incorrect.`;
      applyIncorrect(teamIndex);
    } else {
      bannerText = `Time is up${teamIndex == null ? '' : ` for ${teamLabel(state, teamIndex)}`}. You can mark the answer incorrect.`;
    }
    return;
  }
  const ticked = tickBuzz(buzz, timers, now, state.teams.length);
  if (!ticked.event) return;
  buzz = ticked.buzz;
  if (ticked.event.type === 'buzz-expired') {
    bannerText = 'No one buzzed. You can reveal the answer.';
  } else if (ticked.event.type === 'auto-incorrect') {
    bannerText = `Time is up. ${teamLabel(state, ticked.event.teamIndex)} is marked incorrect.`;
    applyIncorrect(ticked.event.teamIndex);
  } else if (ticked.event.type === 'time-up') {
    bannerText = `Time is up for ${teamLabel(state, ticked.event.teamIndex)}. Mark them incorrect, or leave the score. Buzzing is open for the others.`;
  }
  broadcast();
}

function syncClue(state) {
  const open = state.openClue;
  const key = open ? `${open.categoryIndex}:${open.rowIndex}:${open.stage || 'clue'}` : '';
  if (key === clueKey) return;
  clueKey = key;
  buzz = freshBuzz();
  ddDeadline = 0;
  ddTotal = 0;
  ddSignaled = false;
  bannerText = '';
  if (isDailyDoubleClue(state)) {
    const timers = timersOf(state);
    if (timers.enabled) {
      ddTotal = timers.dailyDoubleSeconds * 1000;
      ddDeadline = Date.now() + ddTotal;
    }
  }
}

export function installBuzzers({ getState: readState, persist: save, applyIncorrect: mark }) {
  getState = readState;
  persist = save;
  applyIncorrect = mark;

  openButton.addEventListener('click', () => {
    if (getState().mode !== 'play') return;
    ensureRoom();
    if (!panel.open) panel.showModal();
    syncView();
  });
  document.getElementById('buzz-panel-close').addEventListener('click', () => panel.close());
  openBuzzing.addEventListener('click', () => {
    const state = getState();
    if (!allowsTeamBuzz(state) || buzz.phase === 'window' || buzz.phase === 'answering') return;
    buzz = openBuzzWindow(buzz, timersOf(state), Date.now(), state.teams.length);
    bannerText = buzz.phase === 'window' ? 'Buzzing is open.' : 'Every team is locked out.';
    syncView();
  });
  closeBuzzing.addEventListener('click', () => {
    buzz = { ...buzz, phase: 'closed', deadline: 0, totalMs: 0 };
    bannerText = 'Buzzing is closed.';
    syncView();
  });

  const writeTimers = (patch) => {
    const state = getState();
    state.timers = normalizeTimers({ ...timersOf(state), ...patch });
    persist();
    renderSettings(state);
    if (room) broadcast();
  };
  timersEnabled.addEventListener('change', () => writeTimers({ enabled: timersEnabled.checked }));
  autoMark.addEventListener('change', () => writeTimers({ autoMarkOnTimeout: autoMark.checked }));
  for (const [input, key] of [
    [buzzSeconds, 'buzzSeconds'],
    [answerSeconds, 'answerSeconds'],
    [ddSeconds, 'dailyDoubleSeconds'],
  ]) {
    input.addEventListener('change', () => {
      const value = input.valueAsNumber;
      if (!Number.isInteger(value)) {
        renderSettings(getState());
        return;
      }
      writeTimers({ [key]: value });
    });
  }
  earlySeconds.addEventListener('change', () => {
    const value = earlySeconds.valueAsNumber;
    if (!Number.isFinite(value)) {
      renderSettings(getState());
      return;
    }
    writeTimers({ earlyLockoutSeconds: value });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'b' && event.key !== 'B') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const state = getState();
    if (state.mode !== 'play' || !allowsTeamBuzz(state)) return;
    if (buzz.phase === 'window' || buzz.phase === 'answering') return;
    event.preventDefault();
    buzz = openBuzzWindow(buzz, timersOf(state), Date.now(), state.teams.length);
    bannerText = 'Buzzing is open.';
    syncView();
  });

  window.setInterval(() => {
    const state = getState();
    if (!state) return;
    const previousClue = clueKey;
    syncClue(state);
    applyTick(state);
    const live = buzz.phase === 'window' || buzz.phase === 'answering' || ddDeadline;
    if (room && (live || clueKey !== previousClue || state.openClue)) broadcast();
    renderMeter(state);
    renderBanner(state);
  }, 200);

  return {
    sync: syncView,
    afterScore(teamIndex, direction) {
      const state = getState();
      if (!allowsTeamBuzz(state)) return;
      if (buzz.phase === 'answering' && teamIndex === buzz.winner) {
        if (direction < 0) {
          buzz = markIncorrect(buzz, teamIndex, timersOf(state), Date.now(), state.teams.length);
          bannerText = buzz.phase === 'window'
            ? `${teamLabel(state, teamIndex)} is locked out. Buzzing is open again.`
            : `${teamLabel(state, teamIndex)} is locked out.`;
        } else {
          buzz = markCorrect(buzz);
          bannerText = `${teamLabel(state, teamIndex)} is correct.`;
        }
        syncView();
        return;
      }
      if (direction < 0 && teamIndex === buzz.signaledTeam) {
        bannerText = `${teamLabel(state, teamIndex)} is marked incorrect.`;
        buzz = { ...buzz, signaledTeam: null };
        syncView();
      }
    },
  };
}
