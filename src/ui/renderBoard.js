/**
 * Render the board — the linear path of treasure chips and player positions.
 */

import { PLAYER_COLORS } from '../infra/constants.js';

/**
 * Render the board into the given container element.
 */
export const renderBoard = (container, state) => {
  container.innerHTML = '';

  const submarine = document.createElement('div');
  submarine.className = 'submarine';
  submarine.innerHTML = '🚢 <span class="sub-label">Submarine</span>';

  // Show divers on sub
  const subDivers = state.players
    .filter((p) => p.position === -1)
    .map((p) => diverToken(p));
  if (subDivers.length) {
    const diverRow = document.createElement('div');
    diverRow.className = 'diver-row';
    subDivers.forEach((d) => diverRow.appendChild(d));
    submarine.appendChild(diverRow);
  }
  container.appendChild(submarine);

  // Board path
  const path = document.createElement('div');
  path.className = 'board-path';

  for (let i = 0; i < state.boardSize; i++) {
    const space = document.createElement('div');
    space.className = 'board-space';
    space.dataset.index = i;

    // Chip indicator
    const chip = state.chips[i];
    if (chip) {
      const chipEl = document.createElement('div');
      chipEl.className = `chip level-${chip.level}`;
      chipEl.textContent = chip.discovered ? chip.value : '?';
      chipEl.title = `Level ${chip.level}`;
      space.appendChild(chipEl);
    } else {
      const empty = document.createElement('div');
      empty.className = 'chip empty';
      empty.textContent = '·';
      space.appendChild(empty);
    }

    // Divers on this space
    const diversHere = state.players.filter((p) => p.position === i);
    if (diversHere.length) {
      const diverRow = document.createElement('div');
      diverRow.className = 'diver-row';
      diversHere.forEach((p) => diverRow.appendChild(diverToken(p)));
      space.appendChild(diverRow);
    }

    // Space number
    const num = document.createElement('span');
    num.className = 'space-num';
    num.textContent = i + 1;
    space.appendChild(num);

    path.appendChild(space);
  }

  container.appendChild(path);
};

/** Create a small diver token element. */
const diverToken = (player) => {
  const el = document.createElement('div');
  el.className = 'diver-token';
  el.style.backgroundColor = PLAYER_COLORS[player.id] || '#888';
  el.textContent = player.direction === 'up' ? '↑' : '↓';
  el.title = player.name;
  return el;
};
