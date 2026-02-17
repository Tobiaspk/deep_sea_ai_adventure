/**
 * Turn engine — advances the game state through each phase of a turn.
 * All functions receive state, mutate-in-place, and return it for chaining.
 */

import {
  consumeOxygen,
  computeDestination,
  occupiedBy,
  isRoundOver,
  isOnSubmarine,
} from './rules.js';
import { STARTING_OXYGEN, TOTAL_ROUNDS } from '../infra/constants.js';
import { createChips } from './gameState.js';

/* ── per-turn oxygen consumption ──────────────────────────── */

export const applyOxygenCost = (state) => {
  const player = state.players[state.currentPlayerIndex];
  // Players on the submarine don't consume oxygen
  if (isOnSubmarine(player)) return state;
  state.oxygen = consumeOxygen(state.oxygen, player);
  if (player.carried.length > 0) {
    addLog(state, `${player.name} uses ${player.carried.length} oxygen (carrying ${player.carried.length} chip(s)). Oxygen → ${state.oxygen}`);
  }
  return state;
};

/* ── direction choice ─────────────────────────────────────── */

export const chooseDirection = (state, direction) => {
  const player = state.players[state.currentPlayerIndex];
  // A player on the sub always goes down
  if (player.position === -1) {
    player.direction = 'down';
  } else {
    player.direction = direction; // 'down' or 'up'
  }
  state.turnPhase = 'roll';
  addLog(state, `${player.name} chooses to go ${player.direction}.`);
  return state;
};

/* ── movement ─────────────────────────────────────────────── */

export const applyMovement = (state, diceTotal) => {
  const player = state.players[state.currentPlayerIndex];
  const occupied = occupiedBy(state.players, player.id);

  // Reduce movement by number of carried chips
  const effectiveSteps = Math.max(1, diceTotal - player.carried.length);

  const dest = computeDestination(player.position, effectiveSteps, player.direction, occupied);
  const prevPos = player.position;
  player.position = dest;

  state.diceResult = diceTotal;

  if (dest === -1) {
    // Returned to submarine — score carried chips
    player.scored.push(...player.carried);
    player.carried = [];
    addLog(state, `${player.name} rolled ${diceTotal} (moves ${effectiveSteps}) and returned to the submarine! 🚢`);
  } else {
    addLog(state, `${player.name} rolled ${diceTotal} (moves ${effectiveSteps}), lands on space ${dest}.`);
  }

  state.turnPhase = dest >= 0 ? 'pickup' : 'endTurn';
  return state;
};

/* ── pickup / drop ────────────────────────────────────────── */

export const pickUpChip = (state) => {
  const player = state.players[state.currentPlayerIndex];
  const pos = player.position;
  if (pos < 0 || state.chips[pos] === null) return state;
  const chip = state.chips[pos];
  chip.discovered = true;
  player.carried.push(chip);
  state.chips[pos] = null; // remove from board
  addLog(state, `${player.name} picks up a level-${chip.level} chip from space ${pos}.`);
  state.turnPhase = 'endTurn';
  return state;
};

export const dropChip = (state) => {
  const player = state.players[state.currentPlayerIndex];
  const pos = player.position;
  if (player.carried.length === 0 || pos < 0) return state;
  if (state.chips[pos] !== null) return state; // space must be empty
  // Drop the most recently picked-up chip
  const chip = player.carried.pop();
  state.chips[pos] = chip;
  addLog(state, `${player.name} drops a level-${chip.level} chip on space ${pos}.`);
  state.turnPhase = 'endTurn';
  return state;
};

export const skipPickup = (state) => {
  state.turnPhase = 'endTurn';
  return state;
};

/* ── end turn / round ─────────────────────────────────────── */

export const endTurn = (state) => {
  // Check if round is over
  if (isRoundOver(state.oxygen, state.players)) {
    return endRound(state);
  }
  // Advance to next player
  advancePlayer(state);
  state.turnPhase = 'direction';
  return state;
};

const advancePlayer = (state) => {
  const n = state.players.length;
  let next = (state.currentPlayerIndex + 1) % n;
  state.currentPlayerIndex = next;
};

export const endRound = (state) => {
  addLog(state, `--- Round ${state.round} is over! ---`);

  // Players still underwater lose their carried chips
  for (const p of state.players) {
    if (p.position >= 0) {
      // Diver drowned — chips sink to the bottom (removed from game)
      if (p.carried.length > 0) {
        addLog(state, `${p.name} was underwater — loses ${p.carried.length} chip(s)!`);
      }
      p.carried = [];
    }
    // Reset position for next round
    p.position = -1;
    p.direction = 'down';
  }

  // Compact the board: remove nulls, chips stay in order but gaps close
  const remainingChips = state.chips.filter((c) => c !== null);
  // Re-index so the board is dense again
  state.chips = remainingChips.map((c, i) => ({ ...c, id: i }));
  state.boardSize = state.chips.length;

  if (state.round >= state.maxRounds) {
    state.gameOver = true;
    state.turnPhase = 'gameOver';
    determineWinner(state);
    addLog(state, `🏆 Game over! Winner: ${state.winner}!`);
    return state;
  }

  state.round += 1;
  state.oxygen = STARTING_OXYGEN;
  state.currentPlayerIndex = 0;
  state.turnPhase = 'direction';
  state.diceResult = null;
  addLog(state, `=== Round ${state.round} begins. Oxygen: ${state.oxygen} ===`);
  return state;
};

/* ── scoring ──────────────────────────────────────────────── */

export const playerScore = (player) =>
  player.scored.reduce((sum, chip) => sum + chip.value, 0);

const determineWinner = (state) => {
  let best = -1;
  let winnerName = '';
  for (const p of state.players) {
    const s = playerScore(p);
    if (s > best) {
      best = s;
      winnerName = p.name;
    }
  }
  state.winner = winnerName;
};

/* ── logging helper ───────────────────────────────────────── */

const addLog = (state, msg) => {
  state.log.push(msg);
};
