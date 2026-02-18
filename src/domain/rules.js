/**
 * Pure rule functions — no side effects, no DOM.
 */

import { BOARD_SIZE, STARTING_OXYGEN, DEPTH_CHARGE_OXYGEN_COST, ANCHOR_COST, COOP_BOMB_COST } from '../infra/constants.js';

/* ── oxygen ───────────────────────────────────────────────── */

/** Oxygen cost for current player = number of chips they carry. */
export const oxygenCost = (player) => player.carried.length;

/** Reduce shared oxygen by the amount a player is carrying. Returns new oxygen value (min 0). */
export const consumeOxygen = (oxygen, player) => Math.max(0, oxygen - oxygenCost(player));

/* ── movement ─────────────────────────────────────────────── */

/**
 * Compute the landing position after moving `steps` from `currentPos` in `direction`.
 * Skip over positions occupied by other players.
 * If `monsterPositions` set is provided, stop movement before any monster tile.
 * Returns the final position index, or -1 if the player returns to the submarine.
 */
export const computeDestination = (currentPos, steps, direction, occupiedPositions, boardSize, monsterPositions = null) => {
  let remaining = steps;
  let pos = currentPos;

  if (direction === 'down') {
    while (remaining > 0) {
      const next = pos + 1;
      if (next >= boardSize) {
        pos = boardSize - 1;
        break;
      }
      // Monster blocks passage — can't enter or pass the tile
      if (monsterPositions && monsterPositions.has(next)) {
        // Stop just before the monster (current pos is as far as we go)
        break;
      }
      pos = next;
      // skip occupied spaces (they don't count as a step)
      if (occupiedPositions.has(pos)) continue;
      remaining -= 1;
    }
  } else {
    // direction === 'up'
    while (remaining > 0) {
      const next = pos - 1;
      if (next < 0) {
        return -1;
      }
      // Monster blocks going up too
      if (monsterPositions && monsterPositions.has(next)) {
        break;
      }
      pos = next;
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
    if (p.id !== excludeId && p.position >= 0 && !p.dead) s.add(p.position);
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

/* ── Anchor Boost ─────────────────────────────────────────── */

/** Can the player buy an anchor? Must be on the sub and have enough scored value. */
export const canBuyAnchor = (player) => {
  if (player.position !== -1) return false; // must be on submarine
  if (player.anchorActive) return false; // already bought one
  // Calculate total scored value
  const totalScored = player.scored.reduce((sum, c) => sum + c.value, 0);
  return totalScored >= ANCHOR_COST;
};

/** Can the player buy an anchor in co-op? Spends from the shared pool. */
export const canBuyAnchorCoop = (player, coopScore) => {
  if (player.position !== -1) return false;
  if (player.anchorActive) return false;
  return coopScore >= ANCHOR_COST;
};

/* ── Depth Charge ─────────────────────────────────────────── */

/** Can the player detonate a depth charge on their current space? */
export const canDepthCharge = (player, chips, oxygen) => {
  if (player.position < 0) return false;
  if (player.depthCharges <= 0) return false;
  if (chips[player.position] === null) return false; // must have a chip to destroy
  if (oxygen < DEPTH_CHARGE_OXYGEN_COST) return false; // not enough oxygen
  return true;
};

/* ── Poseidon's Trident ───────────────────────────────────── */

/** Get living players on adjacent spaces (position ± 1) who are valid attack targets. */
export const adjacentTargets = (player, players) => {
  if (player.position < 0) return [];
  return players.filter(
    (p) => p.id !== player.id && !p.dead && p.position >= 0 &&
           Math.abs(p.position - player.position) === 1
  );
};

/** Roll 1d6 for a trident attack. Returns { roll, result: 'kill' | 'backfire' | 'miss' }. */
export const resolveTridentRoll = () => {
  const roll = Math.ceil(Math.random() * 6);
  if (roll >= 5) return { roll, result: 'kill' };
  if (roll === 1) return { roll, result: 'backfire' };
  return { roll, result: 'miss' };
};

/* ── round end checks ─────────────────────────────────────── */

/** A round ends when oxygen hits 0 OR all living players are back on the sub.
 *  In co-op mode, all-on-sub does NOT auto-end — players must confirm. */
export const isRoundOver = (oxygen, players, coop = false) => {
  if (oxygen <= 0) return true;
  if (coop) return false; // co-op requires manual end-round confirmation
  const alive = players.filter((p) => !p.dead);
  return alive.every((p) => p.position === -1);
};

/** Are all living players back on the submarine? */
export const allPlayersOnSub = (players) => {
  const alive = players.filter((p) => !p.dead);
  return alive.every((p) => p.position === -1);
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

/* ── Skip sub turn ────────────────────────────────────────── */

/**
 * Can the current player skip their turn on the submarine?
 * Only allowed if at least one player has already dived this round
 * (i.e. not everyone is still sitting on the sub).
 */
export const canSkipSubTurn = (player, players) => {
  if (player.position !== -1) return false; // must be on sub
  // If every alive player is on the sub, nobody has dived yet → can't skip
  const alive = players.filter(p => !p.dead);
  return !alive.every(p => p.position === -1);
};

/* ── Co-op helpers ────────────────────────────────────────── */

/** Can the player buy a bomb? Must be on submarine with enough co-op score. */
export const canBuyBomb = (player, coopScore) => {
  if (player.position !== -1) return false;
  return coopScore >= COOP_BOMB_COST;
};

/** Can the player use a bomb? Must have a bomb and be adjacent to a monster. */
export const canUseBomb = (player, chips) => {
  if (player.position < 0) return false;
  if (!player.bombs || player.bombs <= 0) return false;
  // Check adjacent positions (pos+1 and pos-1) for monsters
  const pos = player.position;
  const ahead = pos + 1 < chips.length && chips[pos + 1] && chips[pos + 1].monster;
  const behind = pos - 1 >= 0 && chips[pos - 1] && chips[pos - 1].monster;
  return ahead || behind;
};

/** Get the set of positions that have living monsters (for blocking movement). */
export const getMonsterPositions = (chips) => {
  const s = new Set();
  for (let i = 0; i < chips.length; i++) {
    if (chips[i] && chips[i].monster) s.add(i);
  }
  return s;
};

/** Can a player pick up a chip? In co-op monster mission, can't pick up monster chips normally. */
export const canPickUpCoop = (player, chips) => {
  if (player.position < 0) return false;
  const chip = chips[player.position];
  if (!chip) return false;
  if (chip.monster) return false; // can't pick up monsters
  return true;
};
