/**
 * Host/phone messaging. Production uses PeerJS's free public broker
 * (WebRTC, no account). Tests and a same-computer fallback use
 * BroadcastChannel when the page is opened with ?bus=local.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_KEY = 'jeopardy-buzz-room-v1';

export const PEER_OPTIONS = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
};

export function makeRoomCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function peerIdFor(code) {
  return `jg${String(code || '').toUpperCase()}`;
}

export function loadRoomCode() {
  try {
    const code = localStorage.getItem(ROOM_KEY) || '';
    return /^[A-Z2-9]{4}$/.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function saveRoomCode(code) {
  try {
    localStorage.setItem(ROOM_KEY, code);
  } catch {
    // The game already warns when storage is blocked.
  }
}

export function transportMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('bus') === 'local' ? 'local' : 'peer';
}

export function joinUrl(code) {
  const url = new URL('buzz.html', window.location.href);
  url.search = '';
  url.searchParams.set('room', code);
  if (transportMode() === 'local') url.searchParams.set('bus', 'local');
  return url.toString();
}

function channelName(code) {
  return `jeopardy-buzz-${code}`;
}

export function startLocalHost(code, { onMessage, onStatus }) {
  const channel = new BroadcastChannel(channelName(code));
  const phones = new Map();
  channel.onmessage = (event) => {
    const data = event.data;
    if (!data || data.from === 'host' || !data.from) return;
    if (!phones.has(data.from)) phones.set(data.from, { teamIndex: null, open: true });
    onMessage(data.from, data.payload);
  };
  onStatus('ready');
  return {
    kind: 'local',
    phones,
    send(id, payload) {
      channel.postMessage({ from: 'host', to: id, payload });
    },
    broadcast(payload) {
      channel.postMessage({ from: 'host', to: '*', payload });
    },
    close() {
      channel.close();
    },
  };
}

export function startLocalPhone(code, { onMessage, onStatus }) {
  const channel = new BroadcastChannel(channelName(code));
  const id = `phone-${Math.random().toString(36).slice(2, 10)}`;
  channel.onmessage = (event) => {
    const data = event.data;
    if (!data || data.from !== 'host') return;
    if (data.to !== '*' && data.to !== id) return;
    onMessage(data.payload);
  };
  onStatus('ready');
  return {
    send(payload) {
      channel.postMessage({ from: id, payload });
    },
    close() {
      channel.close();
    },
  };
}

export function startPeerHost(code, { onMessage, onStatus }) {
  if (!window.Peer) {
    onStatus('error', 'The buzzer library did not load.');
    return { kind: 'peer', phones: new Map(), send() {}, broadcast() {}, close() {} };
  }
  const peer = new window.Peer(peerIdFor(code), PEER_OPTIONS);
  const phones = new Map();
  peer.on('open', () => onStatus('ready'));
  peer.on('disconnected', () => {
    onStatus('reconnecting');
    if (!peer.destroyed) peer.reconnect();
  });
  peer.on('error', (error) => {
    const type = error?.type || '';
    if (type === 'unavailable-id') onStatus('taken');
    else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
      onStatus('error', 'This network blocked the buzzer service. Phones cannot join from here.');
    } else onStatus('error', 'The buzzer connection failed. Try the Buzzers button again.');
  });
  peer.on('connection', (conn) => {
    const id = conn.peer + Math.random().toString(36).slice(2, 6);
    const record = { conn, teamIndex: null, open: false };
    phones.set(id, record);
    conn.on('open', () => {
      record.open = true;
    });
    conn.on('data', (payload) => onMessage(id, payload));
    const drop = () => {
      record.open = false;
      phones.delete(id);
      onMessage(id, { type: 'disconnect' });
    };
    conn.on('close', drop);
    conn.on('error', drop);
  });
  return {
    kind: 'peer',
    phones,
    send(id, payload) {
      const record = phones.get(id);
      if (record?.open) record.conn.send(payload);
    },
    broadcast(payload) {
      phones.forEach((record) => {
        if (record.open) record.conn.send(payload);
      });
    },
    close() {
      if (!peer.destroyed) peer.destroy();
    },
  };
}

export function startPeerPhone(code, { onMessage, onStatus }) {
  if (!window.Peer) {
    onStatus('error', 'The buzzer library did not load.');
    return { send() {}, close() {} };
  }
  let peer = new window.Peer(PEER_OPTIONS);
  let conn = null;
  let closed = false;
  const connect = () => {
    if (closed || !peer.open) return;
    conn = peer.connect(peerIdFor(code), { reliable: true });
    conn.on('open', () => onStatus('ready'));
    conn.on('data', (payload) => onMessage(payload));
    conn.on('close', () => onStatus('disconnected'));
    conn.on('error', () => onStatus('disconnected'));
  };
  peer.on('open', connect);
  peer.on('disconnected', () => {
    if (!closed && !peer.destroyed) peer.reconnect();
  });
  peer.on('error', (error) => {
    const type = error?.type || '';
    if (type === 'peer-unavailable') onStatus('error', 'That room is not open. Check the code with the host.');
    else onStatus('error', 'This network blocked the buzzer connection.');
  });
  return {
    send(payload) {
      if (conn?.open) conn.send(payload);
    },
    close() {
      closed = true;
      if (conn) conn.close();
      if (!peer.destroyed) peer.destroy();
    },
  };
}
