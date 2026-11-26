/**
 * Phone buzzer. The early-press lockout is timed on the phone so the
 * button reacts immediately, and the host rejects those presses too.
 */
import { startLocalPhone, startPeerPhone, transportMode } from './room.js';

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get('room') || '').toUpperCase();
const roomLabel = document.getElementById('phone-room');
const statusNode = document.getElementById('phone-status');
const detailNode = document.getElementById('phone-detail');
const teamsNode = document.getElementById('phone-teams');
const nameForm = document.getElementById('phone-name-form');
const nameInput = document.getElementById('phone-name');
const buzzButton = document.getElementById('phone-buzz');
const meter = document.getElementById('phone-meter');
const meterFill = document.getElementById('phone-meter-fill');

const COPY = {
  connecting: ['Connecting…', 'Stay on this page.'],
  waiting: ['Waiting', 'The host has not opened buzzing.'],
  open: ['Buzz!', 'First press wins.'],
  you: ['You buzzed first', 'Answer out loud.'],
  other: ['Too late', 'Another team buzzed first.'],
  'locked-out': ['Locked out', 'You cannot buzz for this clue.'],
  'too-early': ['Too early', 'Wait a moment, then you can buzz.'],
  error: ['Can’t connect', 'Check the room code and try again.'],
};

let link = null;
let snapshot = null;
let earlyMs = 250;
let earlyUntil = 0;
let joined = false;
const savedTeam = sessionStorage.getItem('jeopardy-buzz-team');

roomLabel.textContent = roomCode ? `Room ${roomCode}` : 'Missing room code';

function paint(status) {
  const [title, detail] = COPY[status] || COPY.waiting;
  statusNode.textContent = title;
  detailNode.textContent = detail;
  buzzButton.className = `phone-buzz is-${status === 'too-early' ? 'early' : status === 'locked-out' ? 'locked' : status}`;
  const clueOpen = Boolean(snapshot?.clueOpen) && !snapshot?.dailyDouble;
  const canPressEarly = clueOpen && earlyMs > 0 && status === 'waiting' && joined;
  const canBuzz = status === 'open' && joined;
  buzzButton.disabled = !(canBuzz || canPressEarly || (status === 'too-early' && earlyMs > 0));
  const seconds = snapshot?.secondsLeft;
  const showMeter = snapshot && (snapshot.phase === 'window' || snapshot.phase === 'answering') && seconds != null;
  meter.hidden = !showMeter;
  if (showMeter) {
    const fraction = Number.isFinite(snapshot.fraction) ? snapshot.fraction : 1;
    meterFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
  }
}

function renderTeams() {
  teamsNode.replaceChildren();
  const teams = snapshot?.teams || [];
  nameForm.hidden = teams.length > 0;
  teamsNode.hidden = teams.length === 0;
  teams.forEach((team) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = team.name;
    if (savedTeam === String(team.index)) button.classList.add('is-mine');
    button.addEventListener('click', () => join(team.index));
    teamsNode.append(button);
  });
}

function join(teamIndex, name) {
  joined = true;
  if (teamIndex != null) sessionStorage.setItem('jeopardy-buzz-team', String(teamIndex));
  if (snapshot?.teams?.length) renderTeams();
  link?.send({ type: 'join', teamIndex, name });
}

function currentStatus() {
  if (Date.now() < earlyUntil) return 'too-early';
  return snapshot?.status || 'waiting';
}

function onBuzz() {
  const now = Date.now();
  const clueOpen = Boolean(snapshot?.clueOpen) && !snapshot?.dailyDouble;
  const hostOpen = snapshot?.phase === 'window' && snapshot?.status === 'open';
  if (clueOpen && !hostOpen && earlyMs > 0) {
    earlyUntil = now + earlyMs;
    paint('too-early');
    link?.send({ type: 'early' });
    return;
  }
  if (now < earlyUntil) {
    paint('too-early');
    return;
  }
  if (snapshot?.status !== 'open') return;
  link?.send({ type: 'buzz' });
}

function onHost(payload) {
  if (!payload || payload.type === 'reject') {
    detailNode.textContent = payload?.reason || 'Try another team.';
    joined = false;
    return;
  }
  if (payload.type !== 'state') return;
  snapshot = payload;
  if (Number.isFinite(payload.earlyLockoutSeconds)) earlyMs = Math.round(payload.earlyLockoutSeconds * 1000);
  if (payload.status === 'too-early' && earlyMs > 0) earlyUntil = Math.max(earlyUntil, Date.now() + earlyMs);
  if (!joined && payload.teams) renderTeams();
  if (!snapshot.teams?.length && !joined) {
    nameForm.hidden = false;
    renderTeams();
  } else if (!teamsNode.childElementCount) renderTeams();
  paint(currentStatus());
}

function boot() {
  if (!/^[A-Z2-9]{4}$/.test(roomCode)) {
    statusNode.textContent = 'Missing room code';
    return;
  }
  const hooks = {
    onMessage: onHost,
    onStatus: (kind, detail) => {
      if (kind === 'ready') {
        link?.send({ type: 'hello' });
        if (savedTeam != null && savedTeam !== '') join(Number(savedTeam));
        paint('waiting');
      } else if (kind === 'disconnected') {
        paint('connecting');
        window.setTimeout(() => { if (!snapshot) boot(); }, 1200);
      } else if (kind === 'error') {
        statusNode.textContent = 'Can’t connect';
        detailNode.textContent = detail || '';
      }
    },
  };
  link = transportMode() === 'local'
    ? startLocalPhone(roomCode, hooks)
    : startPeerPhone(roomCode, hooks);
  if (transportMode() === 'local') {
    link.send({ type: 'hello' });
    if (savedTeam != null && savedTeam !== '') join(Number(savedTeam));
    paint('waiting');
  }
}

buzzButton.addEventListener('click', onBuzz);
nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  join(null, name);
});
window.setInterval(() => {
  if (!snapshot) link?.send({ type: 'hello' });
  else paint(currentStatus());
}, 200);
window.addEventListener('pagehide', () => link?.send({ type: 'disconnect' }));
boot();
