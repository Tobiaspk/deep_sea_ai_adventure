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
  adjacentTargets,
  resolveTridentRoll,
  getMonsterPositions,
  allPlayersOnSub,
} from './rules.js';
import { STARTING_OXYGEN, TOTAL_ROUNDS, DEPTH_CHARGE_OXYGEN_COST, DEPTH_CHARGES_PER_ROUND, ANCHOR_COST, ANCHOR_MULTIPLIER, COOP_BOMB_COST } from '../infra/constants.js';
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

/* ── Anchor Boost ─────────────────────────────────────────── */

export const buyAnchor = (state) => {
  const player = state.players[state.currentPlayerIndex];
  // Deduct ANCHOR_COST value from scored chips (remove cheapest chips first)
  let remaining = ANCHOR_COST;
  // Sort scored by value ascending so we burn cheapest first
  player.scored.sort((a, b) => a.value - b.value);
  while (remaining > 0 && player.scored.length > 0) {
    const chip = player.scored[0];
    if (chip.value <= remaining) {
      remaining -= chip.value;
      player.scored.shift();
    } else {
      // Chip is worth more than remaining cost — reduce its value
      chip.value -= remaining;
      remaining = 0;
    }
  }
  player.anchorActive = true;
  addLog(state, `⚓ ${player.name} purchases an Anchor Boost! (spent ${ANCHOR_COST} value)`);
  return state;
};

/** Co-op: Buy an anchor boost using the shared co-op score pool. */
export const buyAnchorCoop = (state) => {
  const player = state.players[state.currentPlayerIndex];
  state.coopScore -= ANCHOR_COST;
  player.anchorActive = true;
  addLog(state, `⚓ ${player.name} purchases an Anchor Boost! (spent ${ANCHOR_COST} pts from team pool, pool → ${state.coopScore})`);
  return state;
};

/* ── movement ─────────────────────────────────────────────── */

export const applyMovement = (state, diceTotal) => {
  const player = state.players[state.currentPlayerIndex];
  const occupied = occupiedBy(state.players, player.id);

  // Apply anchor multiplier if active
  let adjustedTotal = diceTotal;
  if (player.anchorActive) {
    adjustedTotal = diceTotal * ANCHOR_MULTIPLIER;
    player.anchorActive = false; // consumed
  }

  // Reduce movement by number of carried chips
  const effectiveSteps = Math.max(1, adjustedTotal - player.carried.length);

  // In co-op monster mission, pass monster positions to block movement
  const monsters = (state.coop && state.mission === 'monsters') ? getMonsterPositions(state.chips) : null;
  const dest = computeDestination(player.position, effectiveSteps, player.direction, occupied, state.boardSize, monsters);
  const prevPos = player.position;
  player.position = dest;

  state.diceResult = diceTotal;
  state.anchorUsedThisRoll = adjustedTotal !== diceTotal; // track if anchor was used for UI

  if (dest === -1) {
    // Returned to submarine — score carried chips
    if (state.coop) {
      // Co-op: add carried chip values to shared pool
      const value = player.carried.reduce((s, c) => s + c.value, 0);
      state.coopScore += value;
      player.carried = [];
    } else {
      player.scored.push(...player.carried);
      player.carried = [];
    }
    const anchorTag = adjustedTotal !== diceTotal ? ` ⚓×${ANCHOR_MULTIPLIER}→${adjustedTotal}` : '';
    addLog(state, `${player.name} rolled ${diceTotal}${anchorTag} (moves ${effectiveSteps}) and returned to the submarine! 🚢`);
  } else {
    const anchorTag = adjustedTotal !== diceTotal ? ` ⚓×${ANCHOR_MULTIPLIER}→${adjustedTotal}` : '';
    addLog(state, `${player.name} rolled ${diceTotal}${anchorTag} (moves ${effectiveSteps}), lands on space ${dest}.`);
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

/* ── Depth Charge ─────────────────────────────────────────── */

export const applyDepthCharge = (state) => {
  const player = state.players[state.currentPlayerIndex];
  const pos = player.position;
  if (pos < 0 || state.chips[pos] === null || player.depthCharges <= 0) return state;

  const chip = state.chips[pos];
  const chipLevel = chip.level;
  const chipValue = chip.value;

  // Destroy the chip
  state.chips[pos] = null;
  player.depthCharges -= 1;

  // Deduct oxygen cost
  state.oxygen = Math.max(0, state.oxygen - DEPTH_CHARGE_OXYGEN_COST);

  addLog(state, `💣 ${player.name} detonates a Depth Charge! Destroys a level-${chipLevel} chip (value: ${chipValue}) on space ${pos}. Oxygen -${DEPTH_CHARGE_OXYGEN_COST} → ${state.oxygen}`);

  state.turnPhase = 'endTurn';
  return state;
};

/* ── Poseidon's Trident ───────────────────────────────────── */

export const applyTridentAttack = (state, targetId) => {
  const attacker = state.players[state.currentPlayerIndex];
  const target = state.players.find((p) => p.id === targetId);
  if (!target || target.dead || target.position < 0) return state;

  const { roll, result } = resolveTridentRoll();

  if (result === 'kill') {
    addLog(state, `🔱 ${attacker.name} attacks ${target.name} with Poseidon's Trident! Rolled ${roll} — ${target.name} is slain! ☠️`);
    killPlayer(state, target);
  } else if (result === 'backfire') {
    addLog(state, `🔱 ${attacker.name} attacks ${target.name} with Poseidon's Trident! Rolled ${roll} — the trident backfires! ${attacker.name} dies! ☠️`);
    killPlayer(state, attacker);
  } else {
    addLog(state, `🔱 ${attacker.name} attacks ${target.name} with Poseidon's Trident! Rolled ${roll} — miss!`);
  }

  state.turnPhase = 'endTurn';
  return state;
};

const killPlayer = (state, player) => {
  // Carried chips are lost (sink to the abyss)
  if (player.carried.length > 0) {
    addLog(state, `  ${player.name} loses ${player.carried.length} carried chip(s) to the deep.`);
  }
  player.carried = [];
  player.dead = true;
  player.position = -99;  // removed from board, but not on sub
};

/* ── skip sub turn ────────────────────────────────────────── */

/** Skip the current player's turn while they are on the submarine. */
export const skipSubTurn = (state) => {
  const player = state.players[state.currentPlayerIndex];
  addLog(state, `${player.name} stays on the submarine. ⏭️`);
  state.turnPhase = 'endTurn';
  return state;
};

/** End the current round early (co-op: all players agreed). */
export const endRoundEarly = (state) => {
  addLog(state, `🚢 Team agrees to end the round early!`);
  return endRound(state);
};

/* ── end turn / round ─────────────────────────────────────── */

export const endTurn = (state) => {
  // Check if round is over
  if (isRoundOver(state.oxygen, state.players, !!state.coop)) {
    return endRound(state);
  }
  // Advance to next player
  advancePlayer(state);
  state.turnPhase = 'direction';
  return state;
};

const advancePlayer = (state) => {
  const n = state.players.length;
  let attempts = 0;
  let next = state.currentPlayerIndex;
  while (attempts < n) {
    next = (next + 1) % n;
    attempts++;
    if (state.players[next].dead) {
      // Dead players still drain oxygen for their (lost) chips — but the cost is 0 since carried is empty
      // Their turn is skipped
      addLog(state, `${state.players[next].name} is dead — turn skipped. ☠️`);
      continue;
    }
    break;
  }
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
    p.dead = false;
    p.depthCharges = DEPTH_CHARGES_PER_ROUND;
    p.anchorActive = false;
  }

  // Compact the board: remove nulls, chips stay in order but gaps close
  // In monster mode, keep monster chips in place (don't compact them away)
  const remainingChips = state.chips.filter((c) => c !== null);
  // Re-index so the board is dense again
  state.chips = remainingChips.map((c, i) => ({ ...c, id: i }));
  state.boardSize = state.chips.length;

  // ── Co-op win/lose checks ──
  if (state.coop) {
    if (state.mission === 'treasure') {
      if (state.coopScore >= state.coopTarget) {
        state.gameOver = true;
        state.coopWin = true;
        state.turnPhase = 'gameOver';
        addLog(state, `🎉 MISSION COMPLETE! Team scored ${state.coopScore} / ${state.coopTarget} points!`);
        return state;
      }
    } else if (state.mission === 'monsters') {
      // Count remaining monsters
      const monstersLeft = state.chips.filter(c => c && c.monster).length;
      state.monstersRemaining = monstersLeft;
      const allHome = state.players.every(p => p.position === -1);
      if (monstersLeft === 0 && allHome) {
        state.gameOver = true;
        state.coopWin = true;
        state.turnPhase = 'gameOver';
        addLog(state, `🎉 MISSION COMPLETE! All monsters destroyed and everyone is safe!`);
        return state;
      }
    }
  }

  if (state.round >= state.maxRounds) {
    state.gameOver = true;
    state.turnPhase = 'gameOver';
    if (state.coop) {
      state.coopLose = true;
      if (state.mission === 'treasure') {
        addLog(state, `💀 Mission failed! Team scored ${state.coopScore} / ${state.coopTarget} points.`);
      } else {
        const monstersLeft = state.chips.filter(c => c && c.monster).length;
        addLog(state, `💀 Mission failed! ${monstersLeft} monster(s) remain.`);
      }
    } else {
      determineWinner(state);
      addLog(state, `🏆 Game over! Winner: ${state.winner}!`);
    }
    return state;
  }

  state.round += 1;
  state.oxygen = STARTING_OXYGEN;
  // Rotate starting player: round 1 → player 0, round 2 → player 1, etc.
  state.currentPlayerIndex = (state.round - 1) % state.players.length;
  state.turnPhase = 'direction';
  state.diceResult = null;
  const starter = state.players[state.currentPlayerIndex].name;
  addLog(state, `=== Round ${state.round} begins. ${starter} goes first. Oxygen: ${state.oxygen} ===`);
  return state;
};

/* ── scoring ──────────────────────────────────────────────── */

export const playerScore = (player) =>
  player.scored.reduce((sum, chip) => sum + chip.value, 0);

/* ── Co-op: Bomb mechanics ────────────────────────────────── */

/** Buy a bomb while on the submarine (costs from shared co-op pool). */
export const buyBomb = (state) => {
  const player = state.players[state.currentPlayerIndex];
  if (player.position !== -1 || state.coopScore < COOP_BOMB_COST) return state;
  state.coopScore -= COOP_BOMB_COST;
  player.bombs = (player.bombs || 0) + 1;
  addLog(state, `💣 ${player.name} buys a bomb! (cost: ${COOP_BOMB_COST} pts from team pool, pool → ${state.coopScore})`);
  return state;
};

/** Use a bomb to destroy the monster at the player's adjacent position. */
export const useBomb = (state) => {
  const player = state.players[state.currentPlayerIndex];
  if (!player.bombs || player.bombs <= 0) return state;
  // Find the adjacent monster (the one blocking the player)
  const pos = player.position;
  // Check pos+1 and pos-1 for monsters
  let targetPos = -1;
  if (pos + 1 < state.boardSize && state.chips[pos + 1] && state.chips[pos + 1].monster) {
    targetPos = pos + 1;
  } else if (pos - 1 >= 0 && state.chips[pos - 1] && state.chips[pos - 1].monster) {
    targetPos = pos - 1;
  }
  if (targetPos === -1) return state;

  // Destroy the monster
  state.chips[targetPos] = null;
  player.bombs -= 1;
  state.monstersRemaining = state.chips.filter(c => c && c.monster).length;
  addLog(state, `💥 ${player.name} bombs the sea monster on space ${targetPos}! 🐙💀 (${state.monstersRemaining} remaining)`);
  state.turnPhase = 'endTurn';
  return state;
};

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
