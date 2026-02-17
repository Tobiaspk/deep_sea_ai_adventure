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
    state.lastKill = null; // consume it
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
      <div class="kill-skull">☠️</div>
      <div class="kill-text">${backfire ? 'BACKFIRE!' : 'KILLED!'}</div>
      <div class="kill-detail">${victim} has been slain${backfire ? ' by their own trident!' : ` by ${killer}!`}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Auto-remove after animation
  setTimeout(() => {
    overlay.classList.add('kill-fade-out');
    setTimeout(() => overlay.remove(), 500);
  }, 1500);
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
