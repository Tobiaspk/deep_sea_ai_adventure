/**
 * Game controller — orchestrates user actions and state transitions.
 * Bridges domain logic with the UI layer.
 */

import { createGameState } from '../domain/gameState.js';
import {
  applyOxygenCost,
  chooseDirection,
  applyMovement,
  pickUpChip,
  dropChip,
  skipPickup,
  endTurn,
  playerScore,
  applyTridentAttack,
} from '../domain/turnEngine.js';
import { rollDice } from '../infra/rng.js';
import { canPickUp, canDrop, isOnSubmarine, adjacentTargets } from '../domain/rules.js';
import {
  sfxDiceRoll, sfxMove, sfxReturnToSub, sfxPickup, sfxDrop,
  sfxTridentAttack, sfxTridentKill, sfxTridentBackfire, sfxTridentMiss,
  sfxOxygenLow, sfxRoundEnd, sfxGameOver, sfxClick,
} from '../infra/sounds.js';

let state = null;
let onStateChange = null; // callback for UI re-render

/* ── public API ───────────────────────────────────────────── */

export const startGame = (playerNames, renderCallback) => {
  state = createGameState(playerNames);
  onStateChange = renderCallback;
  state.log.push(`=== Round 1 begins. Oxygen: ${state.oxygen} ===`);
  notify();
};

export const getState = () => state;

/** Player chooses direction: 'down' or 'up'. */
export const actionChooseDirection = (direction) => {
  if (!state || state.turnPhase !== 'direction') return;
  const player = state.players[state.currentPlayerIndex];

  // Players on the submarine must go down
  if (player.position === -1) direction = 'down';

  sfxClick();
  chooseDirection(state, direction);

  // Consume oxygen before rolling
  applyOxygenCost(state);

  // Oxygen warning
  if (state.oxygen > 0 && state.oxygen <= 5) sfxOxygenLow();

  // Check if oxygen ran out
  if (state.oxygen <= 0) {
    sfxRoundEnd();
    state.turnPhase = 'endTurn';
    endTurn(state);
    if (state.gameOver) sfxGameOver();
    notify();
    return;
  }

  notify();
};

/** Roll dice and move the current player. */
export const actionRoll = () => {
  if (!state || state.turnPhase !== 'roll') return;
  sfxDiceRoll();
  const { total } = rollDice();
  const player = state.players[state.currentPlayerIndex];
  applyMovement(state, total);

  // If player returned to sub, skip pickup and end turn
  if (state.turnPhase === 'endTurn') {
    sfxReturnToSub();
    endTurn(state);
    if (state.gameOver) sfxGameOver();
  } else {
    setTimeout(() => sfxMove(), 250); // after dice rattle
  }
  notify();
};

/** Player picks up a chip at their position. */
export const actionPickUp = () => {
  if (!state || state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canPickUp(player, state.chips)) return;
  sfxPickup();
  pickUpChip(state);
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Player drops a chip at their position (swap). */
export const actionDrop = () => {
  if (!state || state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canDrop(player, state.chips)) return;
  sfxDrop();
  dropChip(state);
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Player skips pickup/drop. */
export const actionSkip = () => {
  if (!state || state.turnPhase !== 'pickup') return;
  sfxClick();
  skipPickup(state);
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Player uses Poseidon's Trident on an adjacent target. */
export const actionTrident = (targetId) => {
  if (!state || state.turnPhase !== 'pickup') return;
  sfxTridentAttack();
  const target = state.players.find((p) => p.id === targetId);
  const attacker = state.players[state.currentPlayerIndex];
  applyTridentAttack(state, targetId);

  // Record kill for animation
  if (target && target.dead) {
    state.lastKill = { victim: target.name, killer: attacker.name };
  } else if (attacker.dead) {
    state.lastKill = { victim: attacker.name, killer: target.name, backfire: true };
  } else {
    state.lastKill = null;
  }

  // Play outcome sound after initial stab
  setTimeout(() => {
    if (target && target.dead) sfxTridentKill();
    else if (attacker.dead) sfxTridentBackfire();
    else sfxTridentMiss();
  }, 300);
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Get contextual actions available for the current state. */
export const getAvailableActions = () => {
  if (!state) return [];
  const player = state.players[state.currentPlayerIndex];
  const actions = [];

  switch (state.turnPhase) {
    case 'direction':
      if (player.position === -1) {
        actions.push({ id: 'direction-down', label: 'Dive ↓', action: () => actionChooseDirection('down') });
      } else {
        actions.push({ id: 'direction-down', label: 'Continue ↓', action: () => actionChooseDirection('down') });
        actions.push({ id: 'direction-up', label: 'Turn back ↑', action: () => actionChooseDirection('up') });
      }
      break;
    case 'roll':
      actions.push({ id: 'roll', label: '🎲 Roll Dice', action: () => actionRoll() });
      break;
    case 'pickup': {
      if (canPickUp(player, state.chips)) {
        actions.push({ id: 'pickup', label: '💎 Pick Up Chip', action: () => actionPickUp() });
      }
      if (canDrop(player, state.chips) && player.carried.length > 0) {
        actions.push({ id: 'drop', label: '⬇ Drop Chip', action: () => actionDrop() });
      }
      // Poseidon's Trident — attack adjacent players
      const targets = adjacentTargets(player, state.players);
      targets.forEach((t) => {
        actions.push({ id: `trident-${t.id}`, label: `🔱 Attack ${t.name}`, action: () => actionTrident(t.id), trident: true });
      });
      actions.push({ id: 'skip', label: 'Skip', action: () => actionSkip() });
      break;
    }
    default:
      break;
  }
  return actions;
};

/* ── internal ─────────────────────────────────────────────── */

const notify = () => {
  if (onStateChange) onStateChange(state);
};
