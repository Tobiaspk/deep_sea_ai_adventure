/**
 * Pure rule functions — no side effects, no DOM.
 */

import { BOARD_SIZE, STARTING_OXYGEN } from '../infra/constants.js';

/* ── oxygen ───────────────────────────────────────────────── */

/** Oxygen cost for current player = number of chips they carry. */
export const oxygenCost = (player) => player.carried.length;

/** Reduce shared oxygen by the amount a player is carrying. Returns new oxygen value (min 0). */
export const consumeOxygen = (oxygen, player) => Math.max(0, oxygen - oxygenCost(player));

/* ── movement ─────────────────────────────────────────────── */

/**
 * Compute the landing position after moving `steps` from `currentPos` in `direction`.
 * Skip over positions occupied by other players.
 * Returns the final position index, or -1 if the player returns to the submarine.
 */
export const computeDestination = (currentPos, steps, direction, occupiedPositions) => {
  let remaining = steps;
  let pos = currentPos;

  if (direction === 'down') {
    while (remaining > 0) {
      pos += 1;
      if (pos >= BOARD_SIZE) {
        // Can't go past the end — clamp to last space
        pos = BOARD_SIZE - 1;
        break;
      }
      // skip occupied spaces (they don't count as a step)
      if (occupiedPositions.has(pos)) continue;
      remaining -= 1;
    }
  } else {
    // direction === 'up'
    while (remaining > 0) {
      pos -= 1;
      if (pos < 0) {
        // Made it back to the submarine
        return -1;
      }
      if (occupiedPositions.has(pos)) continue;
      remaining -= 1;
    }
  }
  return pos;
};

/** Set of board positions occupied by other players (not the moving player). */
export const occupiedBy = (players, excludeId) => {
  const s = new Set();
  for (const p of players) {
    if (p.id !== excludeId && p.position >= 0) s.add(p.position);
  }
  return s;
};

/* ── pickup / drop ────────────────────────────────────────── */

/** Can the player pick up a chip at their current position? */
export const canPickUp = (player, chips) => {
  if (player.position < 0) return false;
  return chips[player.position] !== null;
};

/** Can the player drop a chip at their current position? */
export const canDrop = (player, chips) => {
  if (player.carried.length === 0) return false;
  if (player.position < 0) return false;
  return chips[player.position] === null; // space must be empty
};

/* ── round end checks ─────────────────────────────────────── */

/** A round ends when oxygen hits 0 OR all players are back on the sub. */
export const isRoundOver = (oxygen, players) => {
  if (oxygen <= 0) return true;
  return players.every((p) => p.position === -1);
};

/** Is the player safely on the submarine? */
export const isOnSubmarine = (player) => player.position === -1;

/* ── turn order helpers ───────────────────────────────────── */

/** Advance to the next player who is still underwater. Returns index or -1 if none. */
export const nextActivePlayerIndex = (currentIndex, players) => {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (currentIndex + i) % n;
    if (players[idx].position >= 0 || players[idx].position === -1) {
      // Everyone participates until round is over
      return idx;
    }
  }
  return -1;
};
