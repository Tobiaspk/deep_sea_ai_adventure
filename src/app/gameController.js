/**
 * Game controller — orchestrates user actions and state transitions.
 * Bridges domain logic with the UI layer.
 *
 * Supports two modes:
 *  - LOCAL:  all logic runs in-browser (original behaviour)
 *  - ONLINE: actions are sent to the server via WebSocket
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
  applyDepthCharge,
  buyAnchor,
} from '../domain/turnEngine.js';
import { rollDice } from '../infra/rng.js';
import { canPickUp, canDrop, canDepthCharge, canBuyAnchor, isOnSubmarine, adjacentTargets } from '../domain/rules.js';
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
      state.lastEvent = { type: 'gameOver', player: state.winner };
    } else if (drowned.length > 0) {
      state.lastEvent = { type: 'drown', player: drowned.join(', '), detail: 'Oxygen depleted!' };
    } else {
      state.lastEvent = { type: 'roundEnd', detail: `Round ${state.round} begins` };
    }
    notify();
    return;
  }
  notify();
};

/** Player buys an Anchor Boost while on the submarine. */
export const actionBuyAnchor = () => {
  if (mode === 'online') { sfxAnchor(); sendAction('buy-anchor'); return; }
  if (!state || state.turnPhase !== 'direction') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canBuyAnchor(player)) return;
  sfxAnchor();
  buyAnchor(state);
  state.lastAnchor = { player: player.name };
  notify();
};

/** Roll dice and move the current player. */
export const actionRoll = () => {
  if (mode === 'online') { sfxDiceRoll(); sendAction('roll'); return; }
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
    if (state.gameOver) { sfxGameOver(); state.lastEvent = { type: 'gameOver', player: state.winner }; }
  } else {
    setTimeout(() => sfxMove(), 250);
  }
  notify();
};

/** Player picks up a chip at their position. */
export const actionPickUp = () => {
  if (mode === 'online') { sfxPickup(); sendAction('pick-up'); return; }
  if (!state || state.turnPhase !== 'pickup') return;
  const player = state.players[state.currentPlayerIndex];
  if (!canPickUp(player, state.chips)) return;
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

/** Get contextual actions available for the current state. */
export const getAvailableActions = () => {
  if (!state) return [];
  const player = state.players[state.currentPlayerIndex];
  const actions = [];

  switch (state.turnPhase) {
    case 'direction':
      if (player.position === -1) {
        if (canBuyAnchor(player) && !player.anchorActive) {
          actions.push({ id: 'buy-anchor', label: `⚓ Buy Anchor (cost: 3 pts)`, action: () => actionBuyAnchor(), anchor: true });
        }
        const anchorLabel = player.anchorActive ? '⚓ Dive ↓ (×5!)' : 'Dive ↓';
        actions.push({ id: 'direction-down', label: anchorLabel, action: () => actionChooseDirection('down') });
      } else {
        actions.push({ id: 'direction-down', label: 'Deeper ↓', action: () => actionChooseDirection('down') });
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
      if (canDepthCharge(player, state.chips, state.oxygen)) {
        actions.push({ id: 'depth-charge', label: `💣 Depth Charge (${player.depthCharges} left)`, action: () => actionDepthCharge(), depthCharge: true });
      }
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
    if (t === 'gameOver') sfxGameOver();
    if (t === 'drown' || t === 'roundEnd') sfxRoundEnd();
  }
  if (event.diceTotal && !event.returnedToSub) setTimeout(() => sfxMove(), 250);
};
