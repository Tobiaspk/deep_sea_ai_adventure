/**
 * Application entry point.
 * Wires up mode selection, local setup, online lobby, and game rendering.
 */

import { startGame, getState, receiveState, setMode, getMode, isMyTurn, setRenderCallback } from './app/gameController.js';
import { renderBoard } from './ui/renderBoard.js';
import { renderHud } from './ui/renderHud.js';
import { bindControls } from './ui/bindControls.js';
import { connect, createRoom, joinRoom, startOnlineGame, restartOnlineGame, disconnect } from './infra/network.js';

const $board    = document.getElementById('board');
const $hud      = document.getElementById('hud');
const $controls = document.getElementById('controls');
const $setup    = document.getElementById('setup');
const $modeSelect = document.getElementById('mode-select');
const $lobby    = document.getElementById('lobby');

/* ── render callback ──────────────────────────────────────── */

const render = (state) => {
  renderBoard($board, state);
  renderHud($hud, state);
  bindControls($controls, state, { online: getMode() === 'online', isMyTurn: isMyTurn() });

  if (state.lastKill)      { showKillOverlay(state.lastKill);      state.lastKill = null; }
  if (state.lastAnchor)    { showAnchorOverlay(state.lastAnchor);  state.lastAnchor = null; }
  if (state.lastExplosion) { showExplosionOverlay(state.lastExplosion); state.lastExplosion = null; }
  if (state.lastEvent)     { showEventOverlay(state.lastEvent);    state.lastEvent = null; }

  // Attach restart handler if game over
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (getMode() === 'online') {
        restartOnlineGame();
      } else {
        showModeSelect();
      }
    });
  }
};

/** Show a dramatic kill overlay that auto-dismisses. */
const showKillOverlay = ({ victim, killer, backfire }) => {
  const overlay = document.createElement('div');
  overlay.className = 'kill-overlay';
  overlay.innerHTML = `
    <div class="kill-flash"></div>
    <div class="kill-content">
      <div class="kill-skull">🔱☠️</div>
      <div class="kill-text">${backfire ? 'BACKFIRE!' : 'KILLED!'}</div>
      <div class="kill-detail">${victim} has been slain${backfire ? ' by their own trident!' : ` by ${killer}!`}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.classList.add('kill-fade-out'); setTimeout(() => overlay.remove(), 500); }, 3000);
};

/** Show a dramatic sinking anchor overlay. */
const showAnchorOverlay = ({ player }) => {
  const overlay = document.createElement('div');
  overlay.className = 'anchor-overlay';
  overlay.innerHTML = `
    <div class="anchor-water">
      <div class="anchor-ripple anchor-ripple-1"></div>
      <div class="anchor-ripple anchor-ripple-2"></div>
      <div class="anchor-ripple anchor-ripple-3"></div>
    </div>
    <div class="anchor-chain"></div>
    <div class="anchor-icon">⚓</div>
    <div class="anchor-bubbles">
      ${Array.from({length: 10}, (_, i) => `<div class="anchor-bubble" style="--b:${i}"></div>`).join('')}
    </div>
    <div class="anchor-content">
      <div class="anchor-title">ANCHOR BOOST!</div>
      <div class="anchor-player">${player}</div>
      <div class="anchor-detail">Next roll ×5!</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.classList.add('anchor-fade-out'); setTimeout(() => overlay.remove(), 600); }, 3000);
};

/** Show an epic explosion overlay for Depth Charge. */
const showExplosionOverlay = ({ player, detail }) => {
  const overlay = document.createElement('div');
  overlay.className = 'explosion-overlay';
  overlay.innerHTML = `
    <div class="explosion-flash"></div>
    <div class="explosion-ring explosion-ring-1"></div>
    <div class="explosion-ring explosion-ring-2"></div>
    <div class="explosion-ring explosion-ring-3"></div>
    <div class="explosion-particles">
      ${Array.from({length: 12}, (_, i) => `<div class="explosion-particle" style="--i:${i}"></div>`).join('')}
    </div>
    <div class="explosion-content">
      <div class="explosion-emoji">💣</div>
      <div class="explosion-title">DEPTH CHARGE!</div>
      <div class="explosion-player">${player}</div>
      ${detail ? `<div class="explosion-detail">${detail}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('screen-shake');
  setTimeout(() => document.body.classList.remove('screen-shake'), 600);
  setTimeout(() => { overlay.classList.add('explosion-fade-out'); setTimeout(() => overlay.remove(), 600); }, 3000);
};

const EVENT_CONFIG = {
  pickup:   { emoji: '💎', title: 'TREASURE!',       color: '#f1c40f', duration: 4000 },
  drop:     { emoji: '⬇️',  title: 'DROPPED',         color: '#95a5a6', duration: 2000 },
  returnSub:{ emoji: '🚢', title: 'SAFE!',            color: '#2ecc71', duration: 2500 },
  drown:    { emoji: '🫧', title: 'DROWNED!',         color: '#3498db', duration: 3000 },
  roundEnd: { emoji: '🔔', title: 'NEW ROUND',        color: '#e67e22', duration: 2500 },
  gameOver: { emoji: '🏆', title: 'GAME OVER!',       color: '#f1c40f', duration: 4000 },
};

const showEventOverlay = ({ type, player, detail }) => {
  const cfg = EVENT_CONFIG[type];
  if (!cfg) return;
  const overlay = document.createElement('div');
  overlay.className = `event-overlay event-${type}`;
  overlay.innerHTML = `
    <div class="event-flash" style="background:radial-gradient(ellipse at center, ${cfg.color}44 0%, ${cfg.color}22 40%, transparent 70%)"></div>
    <div class="event-content">
      <div class="event-emoji">${cfg.emoji}</div>
      <div class="event-title" style="color:${cfg.color}">${cfg.title}</div>
      ${player ? `<div class="event-player">${player}</div>` : ''}
      ${detail ? `<div class="event-detail">${detail}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.classList.add('event-fade-out'); setTimeout(() => overlay.remove(), 500); }, cfg.duration);
};

/* ── screen management ────────────────────────────────────── */

const hideAll = () => {
  $modeSelect.style.display = 'none';
  $setup.style.display = 'none';
  $lobby.style.display = 'none';
  $board.innerHTML = '';
  $hud.innerHTML = '';
  $controls.innerHTML = '';
};

const showModeSelect = () => {
  hideAll();
  $modeSelect.style.display = '';
};

const showSetup = () => {
  hideAll();
  $setup.style.display = '';
};

const showLobby = () => {
  hideAll();
  $lobby.style.display = '';
  document.getElementById('lobby-connect').style.display = '';
  document.getElementById('lobby-waiting').style.display = 'none';
  document.getElementById('lobby-error').textContent = '';
};

/* ── mode selection ───────────────────────────────────────── */

document.getElementById('mode-local-btn').addEventListener('click', () => {
  setMode('local');
  showSetup();
});

document.getElementById('mode-online-btn').addEventListener('click', () => {
  showLobby();
});

document.getElementById('back-to-mode-btn').addEventListener('click', showModeSelect);
document.getElementById('back-to-mode-btn-2').addEventListener('click', () => {
  disconnect();
  showModeSelect();
});

/* ── local setup ──────────────────────────────────────────── */

document.getElementById('start-btn').addEventListener('click', () => {
  const nameInputs = document.querySelectorAll('.player-name');
  const names = Array.from(nameInputs)
    .map((el) => el.value.trim())
    .filter((n) => n.length > 0);

  if (names.length < 2) {
    alert('Enter at least 2 player names.');
    return;
  }

  hideAll();
  startGame(names, render);
});

const $playerList = document.getElementById('player-list');
const $addPlayer  = document.getElementById('add-player-btn');
let playerCount = 2;

const addPlayerInput = () => {
  if (playerCount >= 6) return;
  playerCount++;
  const div = document.createElement('div');
  div.className = 'player-input';
  div.innerHTML = `<label>Player ${playerCount}: <input type="text" class="player-name" placeholder="Name" maxlength="12" /></label>`;
  $playerList.appendChild(div);
  if (playerCount >= 6) $addPlayer.disabled = true;
};

$addPlayer.addEventListener('click', addPlayerInput);

/* ── online lobby ─────────────────────────────────────────── */

let isHost = false;

const $lobbyError = document.getElementById('lobby-error');
const showError = (msg) => { $lobbyError.textContent = msg; setTimeout(() => { $lobbyError.textContent = ''; }, 4000); };

document.getElementById('create-room-btn').addEventListener('click', async () => {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showError('Enter your name.'); return; }

  try {
    await connect({
      onState:      (state, playerId, event) => { hideAll(); receiveState(state, playerId, event, render); },
      onLobby:      (msg) => showLobbyWaiting(msg),
      onError:      (msg) => showError(msg),
      onCreated:    () => {},
      onDisconnect: (n) => showError(`${n} disconnected.`),
      onClose:      () => showError('Connection lost.'),
    });
    isHost = true;
    createRoom(name);
  } catch {
    showError('Could not connect to server.');
  }
});

document.getElementById('join-room-btn').addEventListener('click', async () => {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { showError('Enter your name.'); return; }
  if (!code || code.length !== 4) { showError('Enter a 4-letter room code.'); return; }

  try {
    await connect({
      onState:      (state, playerId, event) => { hideAll(); receiveState(state, playerId, event, render); },
      onLobby:      (msg) => showLobbyWaiting(msg),
      onError:      (msg) => showError(msg),
      onCreated:    () => {},
      onDisconnect: (n) => showError(`${n} disconnected.`),
      onClose:      () => showError('Connection lost.'),
    });
    isHost = false;
    joinRoom(code, name);
  } catch {
    showError('Could not connect to server.');
  }
});

const showLobbyWaiting = ({ code, names, you }) => {
  setMode('online');
  document.getElementById('lobby-connect').style.display = 'none';
  const $waiting = document.getElementById('lobby-waiting');
  $waiting.style.display = '';
  document.getElementById('room-code-value').textContent = code;

  const $players = document.getElementById('lobby-players');
  $players.innerHTML = '<h3>Players in Room:</h3>' +
    names.map((n, i) => `<div class="lobby-player">${i + 1}. ${n}${n === you ? ' (you)' : ''}${i === 0 ? ' 👑' : ''}</div>`).join('');

  // Only host sees start button
  const $startBtn = document.getElementById('start-online-btn');
  const $waitMsg  = document.getElementById('lobby-wait-msg');
  if (isHost) {
    $startBtn.style.display = '';
    $waitMsg.style.display = 'none';
  } else {
    $startBtn.style.display = 'none';
    $waitMsg.style.display = '';
  }
};

document.getElementById('start-online-btn').addEventListener('click', () => {
  startOnlineGame();
});
