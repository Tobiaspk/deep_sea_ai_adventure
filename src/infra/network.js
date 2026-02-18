/**
 * WebSocket client wrapper for multiplayer communication.
 * Provides a thin API to connect, send actions, and receive state updates.
 */

let ws = null;
let onState = null;      // (state, playerId, event) => void
let onLobby = null;      // ({ code, names, you }) => void
let onError = null;      // (message) => void
let onCreated = null;    // (code) => void
let onDisconnect = null; // (name) => void
let onClose = null;      // () => void

/* ── connection ───────────────────────────────────────────── */

export const connect = (callbacks) => {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}`;

  onState      = callbacks.onState      || (() => {});
  onLobby      = callbacks.onLobby      || (() => {});
  onError      = callbacks.onError      || (() => {});
  onCreated    = callbacks.onCreated    || (() => {});
  onDisconnect = callbacks.onDisconnect || (() => {});
  onClose      = callbacks.onClose      || (() => {});

  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);

    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));

    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'state':
          onState(msg.state, msg.playerId, msg.event || {});
          break;
        case 'lobby':
          onLobby(msg);
          break;
        case 'created':
          onCreated(msg.code);
          break;
        case 'error':
          onError(msg.message);
          break;
        case 'player-disconnected':
          onDisconnect(msg.name);
          break;
      }
    });

    ws.addEventListener('close', () => {
      onClose();
    });
  });
};

/* ── send helpers ─────────────────────────────────────────── */

const send = (msg) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

export const createRoom = (name) => send({ type: 'create', name });
export const joinRoom = (code, name) => send({ type: 'join', code, name });
export const startOnlineGame = () => send({ type: 'start' });
export const restartOnlineGame = () => send({ type: 'restart' });

export const sendAction = (action, payload = {}) =>
  send({ type: 'action', action, payload });

export const disconnect = () => {
  if (ws) { ws.close(); ws = null; }
};

export const isConnected = () => ws && ws.readyState === WebSocket.OPEN;
