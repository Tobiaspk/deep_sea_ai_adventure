/**
 * Render the HUD — message box, oxygen gauge, round info, player panels, and toggleable log.
 */

import { PLAYER_COLORS } from '../infra/constants.js';
import { playerScore } from '../domain/scoring.js';
import { scoreboard } from '../domain/scoring.js';

/** Track whether the user wants the log visible (persists across re-renders). */
let logVisible = false;

export const renderHud = (container, state) => {
  container.innerHTML = '';

  // ── Last-action message box ──
  const lastMessages = state.log.slice(-3);
  if (lastMessages.length > 0) {
    const msgBox = document.createElement('div');
    msgBox.className = 'message-box';
    lastMessages.forEach((msg) => {
      const line = document.createElement('div');
      line.className = 'message-line';
      line.textContent = msg;
      msgBox.appendChild(line);
    });
    container.appendChild(msgBox);
  }

  // ── Oxygen & round info ──
  const info = document.createElement('div');
  info.className = 'hud-info';
  info.innerHTML = `
    <div class="hud-round">Round <strong>${state.round}</strong> / ${state.maxRounds}</div>
    <div class="hud-oxygen">
      <span class="oxygen-label">Oxygen</span>
      <div class="oxygen-bar-track">
        <div class="oxygen-bar-fill" style="width:${(state.oxygen / 25) * 100}%"></div>
      </div>
      <span class="oxygen-value">${state.oxygen}</span>
    </div>
  `;
  container.appendChild(info);

  // ── Player panels ──
  const panels = document.createElement('div');
  panels.className = 'player-panels';

  state.players.forEach((p, idx) => {
    const panel = document.createElement('div');
    panel.className = 'player-panel' + (idx === state.currentPlayerIndex ? ' active' : '');
    panel.style.borderColor = PLAYER_COLORS[p.id];

    const posLabel = p.dead ? '☠️ Dead' : (p.position === -1 ? '🚢 Sub' : `Space ${p.position + 1}`);
    if (p.dead) panel.classList.add('dead');
    panel.innerHTML = `
      <div class="panel-name" style="color:${PLAYER_COLORS[p.id]}">${p.name}</div>
      <div class="panel-pos">${posLabel} ${p.dead ? '' : (p.direction === 'up' ? '↑' : '↓')}</div>
      <div class="panel-carry">Carrying: ${p.carried.length} chip(s)</div>
      <div class="panel-score">Score: ${playerScore(p)}${p.anchorActive ? ' ⚓' : ''}</div>
    `;
    panels.appendChild(panel);
  });
  container.appendChild(panels);

  // ── Game over scoreboard ──
  if (state.gameOver) {
    const sb = document.createElement('div');
    sb.className = 'scoreboard';
    sb.innerHTML = '<h2>🏆 Final Scores</h2>' +
      scoreboard(state.players)
        .map((s, i) => `<div class="score-row${i === 0 ? ' winner' : ''}">${i + 1}. ${s.name}: ${s.score} pts</div>`)
        .join('');
    container.appendChild(sb);
  }

  // ── Toggleable log ──
  const logWrapper = document.createElement('div');
  logWrapper.className = 'game-log-wrapper';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'log-toggle-btn';
  toggleBtn.textContent = logVisible ? '▼ Hide Log' : '▶ Show Log';
  toggleBtn.addEventListener('click', () => {
    logVisible = !logVisible;
    toggleBtn.textContent = logVisible ? '▼ Hide Log' : '▶ Show Log';
    logEntries.style.display = logVisible ? 'block' : 'none';
  });
  logWrapper.appendChild(toggleBtn);

  const logEntries = document.createElement('div');
  logEntries.className = 'log-entries';
  logEntries.style.display = logVisible ? 'block' : 'none';
  const recent = state.log.slice(-30);
  recent.forEach((msg) => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = msg;
    logEntries.appendChild(entry);
  });
  logWrapper.appendChild(logEntries);
  container.appendChild(logWrapper);
};
