/**
 * Application entry point.
 * Wires up the setup form, starts the game, and re-renders on every state change.
 */

import { startGame, getState } from './app/gameController.js';
import { renderBoard } from './ui/renderBoard.js';
import { renderHud } from './ui/renderHud.js';
import { bindControls } from './ui/bindControls.js';

const $board = document.getElementById('board');
const $hud = document.getElementById('hud');
const $controls = document.getElementById('controls');
const $setup = document.getElementById('setup');

/* ── render callback ──────────────────────────────────────── */

const render = (state) => {
  renderBoard($board, state);
  renderHud($hud, state);
  bindControls($controls, state);

  // Kill animation overlay
  if (state.lastKill) {
    showKillOverlay(state.lastKill);
    state.lastKill = null;
  }

  // Explosion animation overlay (Depth Charge)
  if (state.lastExplosion) {
    showExplosionOverlay(state.lastExplosion);
    state.lastExplosion = null;
  }

  // Event animation overlay
  if (state.lastEvent) {
    showEventOverlay(state.lastEvent);
    state.lastEvent = null;
  }

  // Attach restart handler if game over
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => showSetup());
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

  // Auto-remove after animation
  setTimeout(() => {
    overlay.classList.add('kill-fade-out');
    setTimeout(() => overlay.remove(), 500);
  }, 3000);
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

  // Shake the whole screen
  document.body.classList.add('screen-shake');
  setTimeout(() => document.body.classList.remove('screen-shake'), 600);

  setTimeout(() => {
    overlay.classList.add('explosion-fade-out');
    setTimeout(() => overlay.remove(), 600);
  }, 3000);
};

/** Show a themed event overlay that auto-dismisses. */
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

  setTimeout(() => {
    overlay.classList.add('event-fade-out');
    setTimeout(() => overlay.remove(), 500);
  }, cfg.duration);
};

/* ── setup screen ─────────────────────────────────────────── */

const showSetup = () => {
  $setup.style.display = '';
  $board.innerHTML = '';
  $hud.innerHTML = '';
  $controls.innerHTML = '';
};

document.getElementById('start-btn').addEventListener('click', () => {
  const nameInputs = document.querySelectorAll('.player-name');
  const names = Array.from(nameInputs)
    .map((el) => el.value.trim())
    .filter((n) => n.length > 0);

  if (names.length < 2) {
    alert('Enter at least 2 player names.');
    return;
  }

  $setup.style.display = 'none';
  startGame(names, render);
});

// Dynamic player name inputs
const $playerList = document.getElementById('player-list');
const $addPlayer = document.getElementById('add-player-btn');
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
