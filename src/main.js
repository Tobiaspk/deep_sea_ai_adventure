/**
 * Application entry point.
 * Wires up mode selection, local setup, online lobby, and game rendering.
 */

import { startGame, startCoopGame, getState, receiveState, setMode, getMode, isMyTurn, setRenderCallback } from './app/gameController.js';
import { renderBoard } from './ui/renderBoard.js';
import { renderHud, renderGameLog } from './ui/renderHud.js';
import { bindControls } from './ui/bindControls.js';
import { connect, createRoom, createCoopRoom, joinRoom, startOnlineGame, restartOnlineGame, disconnect } from './infra/network.js';

const $board    = document.getElementById('board');
const $hud      = document.getElementById('hud');
const $controls = document.getElementById('controls');
const $gameLog  = document.getElementById('game-log');
const $setup    = document.getElementById('setup');
const $coopSetup = document.getElementById('coop-setup');
const $modeSelect = document.getElementById('mode-select');
const $modeTypeSelect = document.getElementById('mode-type-select');
const $lobby    = document.getElementById('lobby');
const $coopLobby = document.getElementById('coop-lobby');

/* ── Number popup animation ───────────────────────────────── */

let _prevOxygen = null;
let _prevDice = null;
let _prevScores = null;

const showNumberPopup = (text, x, y, color = '#f1c40f') => {
  const popup = document.createElement('div');
  popup.className = 'number-popup';
  popup.textContent = text;
  popup.style.color = color;
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 900);
};

const detectNumberChanges = (state) => {
  // Oxygen change
  if (_prevOxygen !== null && state.oxygen !== _prevOxygen) {
    const diff = state.oxygen - _prevOxygen;
    const oxyEl = document.querySelector('.oxygen-value');
    if (oxyEl) {
      const rect = oxyEl.getBoundingClientRect();
      const color = diff < 0 ? '#e74c3c' : '#2ecc71';
      showNumberPopup(`${diff > 0 ? '+' : ''}${diff}`, rect.left + rect.width / 2, rect.top, color);
    }
  }
  _prevOxygen = state.oxygen;

  // Dice roll
  if (state.diceResult && state.diceResult !== _prevDice) {
    const heading = document.querySelector('.controls-heading');
    if (heading) {
      const rect = heading.getBoundingClientRect();
      showNumberPopup(`🎲 ${state.diceResult}`, rect.left + rect.width / 2, rect.top - 10, '#3498db');
    }
  }
  _prevDice = state.diceResult;

  // Score changes per player
  const currentScores = state.players.map(p => p.scored.reduce((s, c) => s + c.value, 0));
  if (_prevScores) {
    state.players.forEach((p, i) => {
      if (currentScores[i] !== _prevScores[i]) {
        const diff = currentScores[i] - _prevScores[i];
        const panel = document.querySelectorAll('.player-panel')[i];
        if (panel) {
          const rect = panel.getBoundingClientRect();
          const color = diff > 0 ? '#2ecc71' : '#e74c3c';
          showNumberPopup(`${diff > 0 ? '+' : ''}${diff} pts`, rect.left + rect.width / 2, rect.top - 5, color);
        }
      }
    });
  }
  _prevScores = currentScores;
};

/* ── render callback ──────────────────────────────────────── */

const render = (state) => {
  renderBoard($board, state);
  renderHud($hud, state);
  bindControls($controls, state, { online: getMode() === 'online', isMyTurn: isMyTurn() });
  renderGameLog($gameLog, state);

  // Number popup animations for changed values
  requestAnimationFrame(() => detectNumberChanges(state));

  if (state.lastKill)      { showKillOverlay(state.lastKill);      state.lastKill = null; }
  if (state.lastAnchor)    { showAnchorOverlay(state.lastAnchor);  state.lastAnchor = null; }
  if (state.lastExplosion) { showExplosionOverlay(state.lastExplosion); state.lastExplosion = null; }
  if (state.lastEvent)     { showEventOverlay(state.lastEvent);    state.lastEvent = null; }
  if (state.lastSkip)      { showSkipAnimation();                  state.lastSkip = null; }

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

/** Show a quick skip whoosh animation. */
const showSkipAnimation = () => {
  const overlay = document.createElement('div');
  overlay.className = 'skip-overlay';
  overlay.innerHTML = `
    <div class="skip-content">
      <div class="skip-emoji">⏭️</div>
      <div class="skip-text">SKIP</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.classList.add('skip-fade-out'); setTimeout(() => overlay.remove(), 300); }, 600);
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
  coopWin:  { emoji: '🎉', title: 'MISSION COMPLETE!', color: '#2ecc71', duration: 5000 },
  coopLose: { emoji: '💀', title: 'MISSION FAILED',   color: '#e74c3c', duration: 5000 },
  'bomb-buy':{ emoji: '💣', title: 'BOMB PURCHASED!', color: '#e67e22', duration: 2000 },
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
  $modeTypeSelect.style.display = 'none';
  $setup.style.display = 'none';
  $coopSetup.style.display = 'none';
  $lobby.style.display = 'none';
  $coopLobby.style.display = 'none';
  $board.innerHTML = '';
  $hud.innerHTML = '';
  $controls.innerHTML = '';
  $gameLog.innerHTML = '';
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

const showCoopLobby = () => {
  hideAll();
  $coopLobby.style.display = '';
  document.getElementById('coop-lobby-connect').style.display = '';
  document.getElementById('coop-lobby-waiting').style.display = 'none';
  document.getElementById('coop-lobby-error').textContent = '';
};

/* ── mode selection (two-step flow) ────────────────────────── */

let selectedTransport = 'local'; // 'local' | 'online'

document.getElementById('mode-local-btn').addEventListener('click', () => {
  selectedTransport = 'local';
  hideAll();
  $modeTypeSelect.style.display = '';
});

document.getElementById('mode-online-btn').addEventListener('click', () => {
  selectedTransport = 'online';
  hideAll();
  $modeTypeSelect.style.display = '';
});

document.getElementById('type-versus-btn').addEventListener('click', () => {
  if (selectedTransport === 'local') {
    setMode('local');
    showSetup();
  } else {
    showLobby();
  }
});

document.getElementById('type-coop-btn').addEventListener('click', () => {
  if (selectedTransport === 'local') {
    setMode('local');
    hideAll();
    $coopSetup.style.display = '';
  } else {
    showCoopLobby();
  }
});

document.getElementById('back-to-step1-btn').addEventListener('click', showModeSelect);

document.getElementById('back-to-mode-btn').addEventListener('click', showModeSelect);
document.getElementById('back-to-mode-btn-coop').addEventListener('click', showModeSelect);
document.getElementById('back-to-mode-btn-2').addEventListener('click', () => {
  disconnect();
  showModeSelect();
});

document.getElementById('back-to-mode-btn-3').addEventListener('click', () => {
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

/* ── co-op setup ──────────────────────────────────────────── */

let coopMission = 'treasure';
let coopPlayerCount = 2;

// Mission card selection
document.querySelectorAll('#coop-setup .mission-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('#coop-setup .mission-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    coopMission = card.dataset.mission;
  });
});

// Add player button
const $coopPlayerList = document.getElementById('coop-player-list');
document.getElementById('coop-add-player-btn').addEventListener('click', () => {
  if (coopPlayerCount >= 6) return;
  coopPlayerCount++;
  const div = document.createElement('div');
  div.className = 'player-input';
  div.innerHTML = `<label>Player ${coopPlayerCount}: <input type="text" class="coop-player-name" placeholder="Name" maxlength="12" /></label>`;
  $coopPlayerList.appendChild(div);
  if (coopPlayerCount >= 6) document.getElementById('coop-add-player-btn').disabled = true;
});

// Start co-op mission
document.getElementById('coop-start-btn').addEventListener('click', () => {
  const nameInputs = document.querySelectorAll('.coop-player-name');
  const names = Array.from(nameInputs)
    .map((el) => el.value.trim())
    .filter((n) => n.length > 0);

  if (names.length < 2) {
    alert('Enter at least 2 player names.');
    return;
  }

  hideAll();
  startCoopGame(names, coopMission, render);
});

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

/* ── online co-op lobby ───────────────────────────────────── */

let onlineCoopMission = 'treasure';
let isCoopHost = false;

// Mission card selection (online co-op)
document.querySelectorAll('#coop-lobby .mission-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('#coop-lobby .mission-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    onlineCoopMission = card.dataset.mission;
  });
});

const $coopLobbyError = document.getElementById('coop-lobby-error');
const showCoopError = (msg) => { $coopLobbyError.textContent = msg; setTimeout(() => { $coopLobbyError.textContent = ''; }, 4000); };

document.getElementById('coop-create-room-btn').addEventListener('click', async () => {
  const name = document.getElementById('coop-create-name').value.trim();
  if (!name) { showCoopError('Enter your name.'); return; }

  try {
    await connect({
      onState:      (state, playerId, event) => { hideAll(); receiveState(state, playerId, event, render); },
      onLobby:      (msg) => showCoopLobbyWaiting(msg),
      onError:      (msg) => showCoopError(msg),
      onCreated:    () => {},
      onDisconnect: (n) => showCoopError(`${n} disconnected.`),
      onClose:      () => showCoopError('Connection lost.'),
    });
    isCoopHost = true;
    createCoopRoom(name, onlineCoopMission);
  } catch {
    showCoopError('Could not connect to server.');
  }
});

document.getElementById('coop-join-room-btn').addEventListener('click', async () => {
  const name = document.getElementById('coop-join-name').value.trim();
  const code = document.getElementById('coop-join-code').value.trim().toUpperCase();
  if (!name) { showCoopError('Enter your name.'); return; }
  if (!code || code.length !== 4) { showCoopError('Enter a 4-letter room code.'); return; }

  try {
    await connect({
      onState:      (state, playerId, event) => { hideAll(); receiveState(state, playerId, event, render); },
      onLobby:      (msg) => showCoopLobbyWaiting(msg),
      onError:      (msg) => showCoopError(msg),
      onCreated:    () => {},
      onDisconnect: (n) => showCoopError(`${n} disconnected.`),
      onClose:      () => showCoopError('Connection lost.'),
    });
    isCoopHost = false;
    joinRoom(code, name);
  } catch {
    showCoopError('Could not connect to server.');
  }
});

const showCoopLobbyWaiting = ({ code, names, you, coop, mission }) => {
  setMode('online');
  document.getElementById('coop-lobby-connect').style.display = 'none';
  const $waiting = document.getElementById('coop-lobby-waiting');
  $waiting.style.display = '';
  document.getElementById('coop-room-code-value').textContent = code;

  // Show mission label
  const missionLabel = mission === 'treasure' ? '💰 Treasure Haul' : '🐙 Monster Hunt';
  document.getElementById('coop-lobby-mission-label').textContent = `Mission: ${missionLabel}`;

  const $players = document.getElementById('coop-lobby-players');
  $players.innerHTML = '<h3>Teammates:</h3>' +
    names.map((n, i) => `<div class="lobby-player">${i + 1}. ${n}${n === you ? ' (you)' : ''}${i === 0 ? ' 👑' : ''}</div>`).join('');

  // Only host sees start button
  const $startBtn = document.getElementById('coop-start-online-btn');
  const $waitMsg  = document.getElementById('coop-lobby-wait-msg');
  if (isCoopHost) {
    $startBtn.style.display = '';
    $waitMsg.style.display = 'none';
  } else {
    $startBtn.style.display = 'none';
    $waitMsg.style.display = '';
  }
};

document.getElementById('coop-start-online-btn').addEventListener('click', () => {
  startOnlineGame();
});
