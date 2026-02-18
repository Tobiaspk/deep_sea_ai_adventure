/**
 * Render the HUD — message box, oxygen gauge, round info, player panels.
 * Also exports renderGameLog for rendering below controls.
 */

import { PLAYER_COLORS } from '../infra/constants.js';
import { playerScore } from '../domain/scoring.js';
import { scoreboard } from '../domain/scoring.js';

/** Track whether the user wants the log visible (persists across re-renders). */
let logVisible = false;

export const renderHud = (container, state) => {
  container.innerHTML = '';

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

  // ── Co-op mission status panel ──
  if (state.coop) {
    const coopPanel = document.createElement('div');
    coopPanel.className = 'coop-status-panel';

    if (state.mission === 'treasure') {
      const pct = state.coopTarget > 0 ? Math.min(100, Math.round((state.coopScore / state.coopTarget) * 100)) : 0;
      coopPanel.innerHTML = `
        <div class="coop-mission-label">🤝 Co-op: Treasure Haul</div>
        <div class="coop-score-row">
          <span>Team Score: <strong>${state.coopScore}</strong> / ${state.coopTarget}</span>
        </div>
        <div class="coop-bar-track">
          <div class="coop-bar-fill" style="width:${pct}%"></div>
        </div>
      `;
    } else {
      coopPanel.innerHTML = `
        <div class="coop-mission-label">🤝 Co-op: Monster Hunt</div>
        <div class="coop-score-row">
          <span>Monsters: <strong>${state.monstersRemaining}</strong> remaining</span>
          <span>Team Pool: <strong>${state.coopScore}</strong> pts</span>
        </div>
      `;
    }
    container.appendChild(coopPanel);
  }

  // ── Player panels ──
  const panels = document.createElement('div');
  panels.className = 'player-panels';

  state.players.forEach((p, idx) => {
    const panel = document.createElement('div');
    panel.className = 'player-panel' + (idx === state.currentPlayerIndex ? ' active' : '');
    panel.style.borderColor = PLAYER_COLORS[p.id];

    const posLabel = p.dead ? '☠️ Dead' : (p.position === -1 ? '🚢 Sub' : `Space ${p.position + 1}`);
    if (p.dead) panel.classList.add('dead');
    const carryLabel = p.carried.length > 0
      ? `Carrying: ${p.carried.length} chip(s)`
      : 'Carrying: 0 chip(s)';
    const bombLabel = state.coop && state.mission === 'monsters' ? `<div class="panel-bombs">💣 Bombs: ${p.bombs || 0}</div>` : '';
    const anchorIndicator = p.anchorActive ? ' ⚓' : '';
    const scoreLabel = state.coop
      ? (anchorIndicator ? `<div class="panel-score">${anchorIndicator}</div>` : '')
      : `<div class="panel-score">Score: ${playerScore(p)}${anchorIndicator}</div>`;
    panel.innerHTML = `
      <div class="panel-name" style="color:${PLAYER_COLORS[p.id]}">${p.name}</div>
      <div class="panel-pos">${posLabel} ${p.dead ? '' : (p.direction === 'up' ? '↑' : '↓')}</div>
      <div class="panel-carry">${carryLabel}</div>
      ${scoreLabel}
      ${bombLabel}
    `;
    panels.appendChild(panel);
  });
  container.appendChild(panels);

  // ── Game over scoreboard ──
  if (state.gameOver) {
    const sb = document.createElement('div');
    sb.className = 'scoreboard';

    if (state.coop) {
      const result = state.coopWin ? '🎉 MISSION COMPLETE!' : '💀 MISSION FAILED';
      const resultClass = state.coopWin ? 'coop-win' : 'coop-lose';
      sb.innerHTML = `<h2 class="${resultClass}">${result}</h2>` +
        `<div class="score-row">Team Score: ${state.coopScore} pts</div>` +
        (state.mission === 'treasure' ? `<div class="score-row">Target: ${state.coopTarget} pts</div>` : '') +
        (state.mission === 'monsters' ? `<div class="score-row">Monsters remaining: ${state.monstersRemaining}</div>` : '');
    } else {
      sb.innerHTML = '<h2>🏆 Final Scores</h2>' +
        scoreboard(state.players)
          .map((s, i) => `<div class="score-row${i === 0 ? ' winner' : ''}">${i + 1}. ${s.name}: ${s.score} pts</div>`)
          .join('');
    }
    container.appendChild(sb);
  }
};

/**
 * Render the game log section (recent summary + toggleable full log).
 * This is rendered below #controls so it appears at the very bottom.
 */
export const renderGameLog = (container, state) => {
  container.innerHTML = '';

  // ── Recent log lines (always visible, last 3) ──
  const recentLines = state.log.slice(-3);
  if (recentLines.length > 0) {
    const recentBox = document.createElement('div');
    recentBox.className = 'log-recent';
    recentLines.forEach((msg) => {
      const line = document.createElement('div');
      line.className = 'log-recent-line';
      line.textContent = msg;
      recentBox.appendChild(line);
    });
    container.appendChild(recentBox);
  }

  // ── Toggleable full log ──
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
