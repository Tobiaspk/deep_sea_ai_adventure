/**
 * Bind player action buttons to the controller.
 */

import { getAvailableActions } from '../app/gameController.js';

export const bindControls = (container, state) => {
  container.innerHTML = '';

  if (state.gameOver) {
    container.innerHTML = '<button id="btn-restart" class="action-btn restart">🔄 New Game</button>';
    return;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const heading = document.createElement('div');
  heading.className = 'controls-heading';
  heading.textContent = `${currentPlayer.name}'s turn — ${phaseLabel(state.turnPhase)}`;
  container.appendChild(heading);

  const actions = getAvailableActions();
  actions.forEach(({ id, label, action }) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = `btn-${id}`;
    btn.textContent = label;
    btn.addEventListener('click', action);
    container.appendChild(btn);
  });
};

const phaseLabel = (phase) => {
  switch (phase) {
    case 'direction': return 'Choose direction';
    case 'roll': return 'Roll the dice';
    case 'pickup': return 'Pick up, drop, or skip';
    default: return '';
  }
};
