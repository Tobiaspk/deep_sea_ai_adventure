/**
 * Bind player action buttons to the controller.
 * In online mode, buttons are only shown when it's the local player's turn.
 */

import { getAvailableActions } from '../app/gameController.js';

export const bindControls = (container, state, opts = {}) => {
  container.innerHTML = '';

  const online = opts.online || false;
  const myTurn = opts.isMyTurn !== undefined ? opts.isMyTurn : true;

  if (state.gameOver) {
    container.innerHTML = '<button id="btn-restart" class="action-btn restart">🔄 New Game</button>';
    return;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const heading = document.createElement('div');
  heading.className = 'controls-heading';

  if (online && !myTurn) {
    heading.textContent = `Waiting for ${currentPlayer.name}…`;
    container.appendChild(heading);
    return;
  }

  heading.textContent = `${currentPlayer.name}'s turn — ${phaseLabel(state.turnPhase)}`;
  container.appendChild(heading);

  const actions = getAvailableActions();
  actions.forEach(({ id, label, action, trident, depthCharge, anchor, bomb }) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn' + (trident ? ' trident' : '') + (depthCharge ? ' depth-charge' : '') + (anchor ? ' anchor' : '') + (bomb ? ' bomb' : '');
    btn.id = `btn-${id}`;
    btn.textContent = label;
    btn.addEventListener('click', action);
    container.appendChild(btn);
  });
};

const phaseLabel = (phase) => {
  switch (phase) {
    case 'direction': return 'Choose direction';
    case 'roll': return 'Rolling the dice…';
    case 'pickup': return 'Pick up, drop, attack, detonate, or skip';
    default: return '';
  }
};
