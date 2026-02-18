/**
 * Game controller — orchestrates user actions and state transitions.
 * Bridges domain logic with the UI layer.
 *
 * Supports two modes:
 *  - LOCAL:  all logic runs in-browser (original behaviour)
 *  - ONLINE: actions are sent to the server via WebSocket
 */

import { createGameState, createCoopGameState } from '../domain/gameState.js';
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
  applyDepthCharge,
  buyAnchor,
  buyAnchorCoop,
  buyBomb,
  useBomb,
  skipSubTurn,
  endRoundEarly,
} from '../domain/turnEngine.js';
import { rollDice } from '../infra/rng.js';
import { ANCHOR_COST } from '../infra/constants.js';
import { canPickUp, canDrop, canDepthCharge, canBuyAnchor, canBuyAnchorCoop, isOnSubmarine, adjacentTargets, canBuyBomb, canUseBomb, canPickUpCoop, canSkipSubTurn, allPlayersOnSub } from '../domain/rules.js';
import {
  sfxDiceRoll, sfxMove, sfxReturnToSub, sfxPickup, sfxDrop,
  sfxTridentAttack, sfxTridentKill, sfxTridentBackfire, sfxTridentMiss,
  sfxOxygenLow, sfxRoundEnd, sfxGameOver, sfxClick, sfxDepthCharge, sfxAnchor,
} from '../infra/sounds.js';
import { sendAction } from '../infra/network.js';

let state = null;
let onStateChange = null; // callback for UI re-render
let mode = 'local';       // 'local' | 'online'
let myPlayerId = null;    // assigned by server in online mode

/* ── public API ───────────────────────────────────────────── */

export const setMode = (m) => { mode = m; };
export const getMode = () => mode;
export const setMyPlayerId = (id) => { myPlayerId = id; };
export const getMyPlayerId = () => myPlayerId;
export const isMyTurn = () => mode === 'local' || (state && state.currentPlayerIndex === myPlayerId);

export const startGame = (playerNames, renderCallback) => {
  mode = 'local';
  state = createGameState(playerNames);
  onStateChange = renderCallback;
  state.log.push(`=== Round 1 begins. Oxygen: ${state.oxygen} ===`);
  notify();
};

/** Start a co-op game with a chosen mission. */
export const startCoopGame = (playerNames, mission, renderCallback) => {
  mode = 'local';
  state = createCoopGameState(playerNames, mission);
  onStateChange = renderCallback;
  const missionLabel = mission === 'treasure'
    ? `Treasure Haul — collect ${state.coopTarget} pts together!`
    : `Monster Hunt — destroy all ${state.monstersRemaining} sea monsters!`;
  state.log.push(`=== Co-op: ${missionLabel} ===`);
  state.log.push(`=== Round 1 begins. Oxygen: ${state.oxygen} ===`);
  notify();
};

/** Receive authoritative state from the server (online mode). */
export const receiveState = (serverState, playerId, event, renderCallback) => {
  state = serverState;
  myPlayerId = playerId;
  if (renderCallback) onStateChange = renderCallback;

  // Play sound effects based on the event
  playSoundsForEvent(event);

  // Attach event data for overlays
  if (event.lastKill)      state.lastKill = event.lastKill;
  if (event.lastAnchor)    state.lastAnchor = event.lastAnchor;
  if (event.lastExplosion) state.lastExplosion = event.lastExplosion;
  if (event.lastEvent)     state.lastEvent = event.lastEvent;
  if (event.lastSkip)      state.lastSkip = true;

  notify();
};

export const setRenderCallback = (cb) => { onStateChange = cb; };

export const getState = () => state;

/** Player chooses direction: 'down' or 'up'. */
export const actionChooseDirection = (direction) => {
  if (mode === 'online') {
    sfxClick();
    sendAction('choose-direction', { direction });
    return;
  }
  if (!state || state.turnPhase !== 'direction') return;
  const player = state.players[state.currentPlayerIndex];
  if (player.position === -1) direction = 'down';

  sfxClick();
  chooseDirection(state, direction);
  applyOxygenCost(state);

  if (state.oxygen > 0 && state.oxygen <= 5) sfxOxygenLow();

  if (state.oxygen <= 0) {
    sfxRoundEnd();
    const drowned = state.players.filter(p => p.position >= 0 && !p.dead).map(p => p.name);
    state.turnPhase = 'endTurn';
    endTurn(state);
    if (state.gameOver) {
      sfxGameOver();
      if (state.coopWin) state.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
      else if (state.coopLose) state.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
      else state.lastEvent = { type: 'gameOver', player: state.winner };
    } else if (drowned.length > 0) {
      state.lastEvent = { type: 'drown', player: drowned.join(', '), detail: 'Oxygen depleted!' };
    } else {
      state.lastEvent = { type: 'roundEnd', detail: `Round ${state.round} begins` };
    }
    notify();
    return;
  }

  // Auto-roll dice immediately after choosing direction
  autoRollAfterDirection();
};

/** Player buys an Anchor Boost while on the submarine. */
export const actionBuyAnchor = () => {
  if (mode === 'online') { sfxAnchor(); sendAction('buy-anchor'); return; }
  if (!state || state.turnPhase !== 'direction') return;
  const player = state.players[state.currentPlayerIndex];
  const isCoop = !!state.coop;
  if (isCoop) {
    if (!canBuyAnchorCoop(player, state.coopScore)) return;
    sfxAnchor();
    buyAnchorCoop(state);
  } else {
    if (!canBuyAnchor(player)) return;
    sfxAnchor();
    buyAnchor(state);
  }
  state.lastAnchor = { player: player.name };
  notify();
};

/** Auto-roll dice immediately after choosing direction (local mode). */
const autoRollAfterDirection = () => {
  if (!state || state.turnPhase !== 'roll') return;
  sfxDiceRoll();
  const { total } = rollDice();
  const player = state.players[state.currentPlayerIndex];
  applyMovement(state, total);

  if (state.turnPhase === 'endTurn') {
    sfxReturnToSub();
    const scoredCount = player.carried.length;
    endTurn(state);
    state.lastEvent = { type: 'returnSub', player: player.name, detail: `Secured ${scoredCount} chip(s)!` };
    if (state.gameOver) {
      sfxGameOver();
      if (state.coopWin) state.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
      else if (state.coopLose) state.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
      else state.lastEvent = { type: 'gameOver', player: state.winner };
    }
  } else {
    setTimeout(() => sfxMove(), 250);
  }
  notify();
};

/** Roll dice and move the current player. */
export const actionRoll = () => {
  if (mode === 'online') { sfxDiceRoll(); sendAction('roll'); return; }
  autoRollAfterDirection();
};

/** Player picks up a chip at their position. */
export const actionPickUp = () => {
  if (mode === 'online') { sfxPickup(); sendAction('pick-up'); return; }
  if (!state || state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  const canPick = state.coop ? canPickUpCoop(player, state.chips) : canPickUp(player, state.chips);
  if (!canPick) return;
  sfxPickup();
  const chip = state.chips[player.position];
  const chipLevel = chip ? chip.level : '?';
  const chipValue = chip ? chip.value : '?';
  pickUpChip(state);
  state.lastEvent = { type: 'pickup', player: player.name, detail: `Level ${chipLevel} chip (value: ${chipValue})` };
  endTurn(state);
  if (state.gameOver) { sfxGameOver(); state.lastEvent = { type: 'gameOver', player: state.winner }; }
  notify();
};

/** Player drops a chip at their position (swap). */
export const actionDrop = () => {
  if (mode === 'online') { sfxDrop(); sendAction('drop'); return; }
  if (!state || state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canDrop(player, state.chips)) return;
  sfxDrop();
  dropChip(state);
  state.lastEvent = { type: 'drop', player: player.name };
  endTurn(state);
  if (state.gameOver) { sfxGameOver(); state.lastEvent = { type: 'gameOver', player: state.winner }; }
  notify();
};

/** Player skips pickup/drop. */
export const actionSkip = () => {
  if (mode === 'online') { sfxClick(); sendAction('skip'); return; }
  if (!state || state.turnPhase !== 'pickup') return;
  sfxClick();
  skipPickup(state);
  state.lastSkip = true;
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Player uses Poseidon's Trident on an adjacent target. */
export const actionTrident = (targetId) => {
  if (mode === 'online') { sfxTridentAttack(); sendAction('trident', { targetId }); return; }
  if (!state || state.turnPhase !== 'pickup') return;
  sfxTridentAttack();
  const target = state.players.find((p) => p.id === targetId);
  const attacker = state.players[state.currentPlayerIndex];
  applyTridentAttack(state, targetId);

  if (target && target.dead) {
    state.lastKill = { victim: target.name, killer: attacker.name };
  } else if (attacker.dead) {
    state.lastKill = { victim: attacker.name, killer: target.name, backfire: true };
  } else {
    state.lastKill = null;
  }

  setTimeout(() => {
    if (target && target.dead) sfxTridentKill();
    else if (attacker.dead) sfxTridentBackfire();
    else sfxTridentMiss();
  }, 300);
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Player detonates a Depth Charge, destroying the chip on their space. */
export const actionDepthCharge = () => {
  if (mode === 'online') { sfxDepthCharge(); sendAction('depth-charge'); return; }
  if (!state || state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canDepthCharge(player, state.chips, state.oxygen)) return;
  const chip = state.chips[player.position];
  const chipLevel = chip ? chip.level : '?';
  const chipValue = chip ? chip.value : '?';
  sfxDepthCharge();
  applyDepthCharge(state);
  state.lastExplosion = { player: player.name, detail: `Level ${chipLevel} chip (value: ${chipValue}) destroyed!` };
  endTurn(state);
  if (state.gameOver) { sfxGameOver(); state.lastEvent = { type: 'gameOver', player: state.winner }; }
  notify();
};

/** Co-op: Player buys a bomb on the submarine. */
export const actionBuyBomb = () => {
  if (mode === 'online') { sfxClick(); sendAction('buy-bomb'); return; }
  if (!state || !state.coop) return;
  if (state.turnPhase !== 'direction') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canBuyBomb(player, state.coopScore)) return;
  sfxClick();
  buyBomb(state);
  state.lastEvent = { type: 'bomb-buy', player: player.name, detail: `Bought a bomb! (${player.bombs} total)` };
  notify();
};

/** Player on the submarine skips their turn (not on the first turn of the round). */
export const actionSkipSubTurn = () => {
  if (mode === 'online') { sfxClick(); sendAction('skip-sub-turn'); return; }
  if (!state || state.turnPhase !== 'direction') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canSkipSubTurn(player, state.players)) return;
  sfxClick();
  skipSubTurn(state);
  state.lastSkip = true;
  endTurn(state);
  if (state.gameOver) sfxGameOver();
  notify();
};

/** Co-op: Player uses a bomb on an adjacent monster. */
export const actionUseBomb = () => {
  if (mode === 'online') { sfxDepthCharge(); sendAction('use-bomb'); return; }
  if (!state || !state.coop) return;
  if (state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canUseBomb(player, state.chips)) return;
  sfxDepthCharge();
  useBomb(state);
  state.lastExplosion = { player: player.name, detail: `Sea monster destroyed! (${state.monstersRemaining} remaining)` };
  endTurn(state);
  if (state.gameOver) { sfxGameOver(); }
  if (state.coopWin) { state.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! \uD83C\uDF89' }; }
  notify();
};

/** Co-op: End the current round early (all players on sub). */
export const actionEndRoundEarly = () => {
  if (mode === 'online') { sfxClick(); sendAction('end-round-early'); return; }
  if (!state || !state.coop) return;
  if (state.turnPhase !== 'direction') return;
  if (!allPlayersOnSub(state.players)) return;
  sfxRoundEnd();
  endRoundEarly(state);
  if (state.gameOver) {
    sfxGameOver();
    if (state.coopWin) state.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! \uD83C\uDF89' };
    else if (state.coopLose) state.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed\u2026 \uD83D\uDC80' };
  } else {
    state.lastEvent = { type: 'roundEnd', detail: `Round ${state.round} begins` };
  }
  notify();
};

/** Get contextual actions available for the current state. */
export const getAvailableActions = () => {
  if (!state) return [];
  const player = state.players[state.currentPlayerIndex];
  const actions = [];
  const isCoop = !!state.coop;

  switch (state.turnPhase) {
    case 'direction':
      if (player.position === -1) {
        if (!isCoop && canBuyAnchor(player) && !player.anchorActive) {
          actions.push({ id: 'buy-anchor', label: `⚓ Buy Anchor (cost: ${ANCHOR_COST} pts)`, action: () => actionBuyAnchor(), anchor: true });
        }
        if (isCoop && canBuyAnchorCoop(player, state.coopScore) && !player.anchorActive) {
          actions.push({ id: 'buy-anchor', label: `⚓ Buy Anchor (cost: ${ANCHOR_COST} pts)`, action: () => actionBuyAnchor(), anchor: true });
        }
        // Co-op: buy bomb on sub
        if (isCoop && state.mission === 'monsters' && canBuyBomb(player, state.coopScore)) {
          actions.push({ id: 'buy-bomb', label: `💣 Buy Bomb (cost: ${state.bombCost} pts)`, action: () => actionBuyBomb(), bomb: true });
        }
        const anchorLabel = player.anchorActive ? '⚓ Dive ↓ (×5!)' : 'Dive ↓';
        actions.push({ id: 'direction-down', label: anchorLabel, action: () => actionChooseDirection('down') });
        // Co-op: end round early if all players are on the sub
        if (isCoop && allPlayersOnSub(state.players)) {
          actions.push({ id: 'end-round-early', label: '🔔 End Round', action: () => actionEndRoundEarly() });
        }
        // Skip turn on sub (only if not the first turn of the round)
        if (canSkipSubTurn(player, state.players)) {
          actions.push({ id: 'skip-sub-turn', label: '⏭️ Skip Turn', action: () => actionSkipSubTurn() });
        }
      } else {
        actions.push({ id: 'direction-down', label: 'Deeper ↓', action: () => actionChooseDirection('down') });
        actions.push({ id: 'direction-up', label: 'Turn back ↑', action: () => actionChooseDirection('up') });
      }
      break;
    case 'roll':
      // Auto-roll is handled automatically — no manual button needed
      break;
    case 'pickup': {
      // Co-op uses special pickup rule (can't pick up monsters)
      const canPick = isCoop ? canPickUpCoop(player, state.chips) : canPickUp(player, state.chips);
      if (canPick) {
        actions.push({ id: 'pickup', label: '💎 Pick Up Chip', action: () => actionPickUp() });
      }
      if (canDrop(player, state.chips) && player.carried.length > 0) {
        actions.push({ id: 'drop', label: '⬇ Drop Chip', action: () => actionDrop() });
      }
      // Co-op: use bomb on adjacent monster
      if (isCoop && canUseBomb(player, state.chips)) {
        actions.push({ id: 'use-bomb', label: `💣 Bomb Monster (${player.bombs} left)`, action: () => actionUseBomb(), bomb: true });
      }
      if (!isCoop && canDepthCharge(player, state.chips, state.oxygen)) {
        actions.push({ id: 'depth-charge', label: `💣 Depth Charge (${player.depthCharges} left)`, action: () => actionDepthCharge(), depthCharge: true });
      }
      if (!isCoop) {
        const targets = adjacentTargets(player, state.players);
        targets.forEach((t) => {
          actions.push({ id: `trident-${t.id}`, label: `🔱 Attack ${t.name}`, action: () => actionTrident(t.id), trident: true });
        });
      }
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

/** Play sound effects based on server event in online mode. */
const playSoundsForEvent = (event) => {
  if (!event) return;
  if (event.diceTotal)     sfxDiceRoll();
  if (event.returnedToSub) setTimeout(() => sfxReturnToSub(), 250);
  if (event.oxygenLow)     sfxOxygenLow();
  if (event.oxygenDepleted) sfxRoundEnd();
  if (event.lastAnchor)    sfxAnchor();
  if (event.lastExplosion) sfxDepthCharge();
  if (event.lastKill) {
    sfxTridentAttack();
    setTimeout(() => {
      if (event.lastKill.backfire) sfxTridentBackfire();
      else sfxTridentKill();
    }, 300);
  }
  if (event.tridentMiss) {
    sfxTridentAttack();
    setTimeout(() => sfxTridentMiss(), 300);
  }
  if (event.lastEvent) {
    const t = event.lastEvent.type;
    if (t === 'pickup') sfxPickup();
    if (t === 'drop') sfxDrop();
    if (t === 'gameOver' || t === 'coopWin' || t === 'coopLose') sfxGameOver();
    if (t === 'drown' || t === 'roundEnd') sfxRoundEnd();
    if (t === 'bomb-buy') sfxClick();
  }
  if (event.diceTotal && !event.returnedToSub) setTimeout(() => sfxMove(), 250);
};
