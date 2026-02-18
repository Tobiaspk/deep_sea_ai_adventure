/**
 * Dive, Laugh, Love — multiplayer WebSocket server.
 *
 * Features:
 *  - Serves static files (replaces python -m http.server)
 *  - Room-based multiplayer via room codes
 *  - All game logic runs server-side (authoritative)
 *  - Broadcasts state to all clients after each action
 *
 * Usage:  node server.js [port]
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.argv[2] || '8080', 10);
const ROOT = new URL('.', import.meta.url).pathname;

/* ═══════════════════════════════════════════════════════════
   MIME types for static file serving
   ═══════════════════════════════════════════════════════════ */

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

/* ═══════════════════════════════════════════════════════════
   Game constants (mirror of src/infra/constants.js)
   ═══════════════════════════════════════════════════════════ */

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const TOTAL_ROUNDS = 3;
const STARTING_OXYGEN = 25;
const CHIP_LEVELS = [
  1,1,1,1,1,1,1,1,
  2,2,2,2,2,2,2,2,
  3,3,3,3,3,3,3,3,
  4,4,4,4,4,4,4,4,
];
const LEVEL_VALUE_RANGES = { 1:[0,3], 2:[4,7], 3:[8,11], 4:[12,15] };
const BOARD_SIZE = CHIP_LEVELS.length;
const DEPTH_CHARGES_PER_ROUND = 1;
const DEPTH_CHARGE_OXYGEN_COST = 3;
const ANCHOR_COST = 3;
const ANCHOR_MULTIPLIER = 5;
const COOP_TREASURE_PER_PLAYER = 30;
const COOP_BOMB_COST = 20;

/* ═══════════════════════════════════════════════════════════
   Game state factory (mirror of src/domain/gameState.js)
   ═══════════════════════════════════════════════════════════ */

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const createChips = () =>
  CHIP_LEVELS.map((level, index) => {
    const [lo, hi] = LEVEL_VALUE_RANGES[level];
    return { id: index, level, value: randInt(lo, hi), discovered: false };
  });

const createPlayer = (id, name) => ({
  id, name, position: -1, direction: 'down',
  carried: [], scored: [], drowned: false,
  dead: false, depthCharges: DEPTH_CHARGES_PER_ROUND, anchorActive: false,
});

const createGameState = (playerNames) => {
  const players = playerNames.map((name, i) => createPlayer(i, name));
  return {
    round: 1, maxRounds: TOTAL_ROUNDS, oxygen: STARTING_OXYGEN,
    boardSize: BOARD_SIZE, chips: createChips(), players,
    currentPlayerIndex: 0, turnPhase: 'direction', diceResult: null,
    roundOver: false, gameOver: false, winner: null, log: [],
  };
};

/* ── Co-op game state ────────────────────────────────────── */

const createMonsterChips = (monsterCount) => {
  const chips = createChips();
  const lo = 6;
  const hi = chips.length - 3;
  const span = hi - lo;
  const positions = [];
  for (let i = 0; i < monsterCount; i++) {
    const pos = lo + Math.round((span / (monsterCount + 1)) * (i + 1));
    positions.push(pos);
  }
  for (const pos of positions) {
    chips[pos] = { id: pos, level: 'monster', value: 0, discovered: true, monster: true };
  }
  return chips;
};

const createCoopGameState = (playerNames, mission) => {
  const players = playerNames.map((name, i) => createPlayer(i, name));
  const isMonsterMission = mission === 'monsters';
  const monsterCount = playerNames.length;
  const chips = isMonsterMission ? createMonsterChips(monsterCount) : createChips();
  return {
    round: 1, maxRounds: TOTAL_ROUNDS, oxygen: STARTING_OXYGEN,
    boardSize: BOARD_SIZE, chips, players,
    currentPlayerIndex: 0, turnPhase: 'direction', diceResult: null,
    roundOver: false, gameOver: false, winner: null, log: [],
    coop: true,
    mission,
    coopScore: 0,
    coopTarget: mission === 'treasure' ? COOP_TREASURE_PER_PLAYER * playerNames.length : null,
    monstersRemaining: isMonsterMission ? monsterCount : 0,
    coopWin: false,
    coopLose: false,
    bombCost: COOP_BOMB_COST,
  };
};

/* ═══════════════════════════════════════════════════════════
   Rule helpers (mirror of src/domain/rules.js)
   ═══════════════════════════════════════════════════════════ */

const oxygenCost = (player) => player.carried.length;
const consumeOxygen = (oxygen, player) => Math.max(0, oxygen - oxygenCost(player));
const isOnSubmarine = (player) => player.position === -1;

const computeDestination = (currentPos, steps, direction, occupiedPositions, boardSize, monsterPositions = null) => {
  let remaining = steps;
  let pos = currentPos;
  if (direction === 'down') {
    while (remaining > 0) {
      const next = pos + 1;
      if (next >= boardSize) { pos = boardSize - 1; break; }
      if (monsterPositions && monsterPositions.has(next)) break;
      pos = next;
      if (occupiedPositions.has(pos)) continue;
      remaining -= 1;
    }
  } else {
    while (remaining > 0) {
      const next = pos - 1;
      if (next < 0) return -1;
      if (monsterPositions && monsterPositions.has(next)) break;
      pos = next;
      if (occupiedPositions.has(pos)) continue;
      remaining -= 1;
    }
  }
  return pos;
};

const occupiedBy = (players, excludeId) => {
  const s = new Set();
  for (const p of players) {
    if (p.id !== excludeId && p.position >= 0 && !p.dead) s.add(p.position);
  }
  return s;
};

const canPickUp = (player, chips) => player.position >= 0 && chips[player.position] !== null;
const canDrop = (player, chips) => player.carried.length > 0 && player.position >= 0 && chips[player.position] === null;

const canBuyAnchor = (player) => {
  if (player.position !== -1 || player.anchorActive) return false;
  return player.scored.reduce((s, c) => s + c.value, 0) >= ANCHOR_COST;
};

const canDepthCharge = (player, chips, oxygen) => {
  if (player.position < 0 || player.depthCharges <= 0) return false;
  if (chips[player.position] === null) return false;
  return oxygen >= DEPTH_CHARGE_OXYGEN_COST;
};

const canBuyBomb = (player, coopScore) => {
  if (player.position !== -1) return false;
  return coopScore >= COOP_BOMB_COST;
};

const canUseBomb = (player, chips) => {
  if (player.position < 0) return false;
  if (!player.bombs || player.bombs <= 0) return false;
  const pos = player.position;
  const ahead = pos + 1 < chips.length && chips[pos + 1] && chips[pos + 1].monster;
  const behind = pos - 1 >= 0 && chips[pos - 1] && chips[pos - 1].monster;
  return ahead || behind;
};

const canPickUpCoop = (player, chips) => {
  if (player.position < 0) return false;
  const chip = chips[player.position];
  if (!chip) return false;
  if (chip.monster) return false;
  return true;
};

const getMonsterPositions = (chips) => {
  const s = new Set();
  for (let i = 0; i < chips.length; i++) {
    if (chips[i] && chips[i].monster) s.add(i);
  }
  return s;
};

const adjacentTargets = (player, players) => {
  if (player.position < 0) return [];
  return players.filter(
    p => p.id !== player.id && !p.dead && p.position >= 0 && Math.abs(p.position - player.position) === 1
  );
};

const resolveTridentRoll = () => {
  const roll = Math.ceil(Math.random() * 6);
  if (roll >= 5) return { roll, result: 'kill' };
  if (roll === 1) return { roll, result: 'backfire' };
  return { roll, result: 'miss' };
};

const isRoundOver = (oxygen, players, coop = false) => {
  if (oxygen <= 0) return true;
  if (coop) return false; // co-op requires manual end-round confirmation
  return players.filter(p => !p.dead).every(p => p.position === -1);
};

const allPlayersOnSub = (players) => {
  return players.filter(p => !p.dead).every(p => p.position === -1);
};

/* ═══════════════════════════════════════════════════════════
   Turn engine (mirror of src/domain/turnEngine.js)
   ═══════════════════════════════════════════════════════════ */

const addLog = (state, msg) => { state.log.push(msg); };

const rollDie = () => Math.floor(Math.random() * 3) + 1;
const rollDice = () => { const d1 = rollDie(), d2 = rollDie(); return { die1: d1, die2: d2, total: d1 + d2 }; };

const playerScore = (player) => player.scored.reduce((sum, c) => sum + c.value, 0);

const determineWinner = (state) => {
  let best = -1, winnerName = '';
  for (const p of state.players) {
    const s = playerScore(p);
    if (s > best) { best = s; winnerName = p.name; }
  }
  state.winner = winnerName;
};

const killPlayer = (state, player) => {
  if (player.carried.length > 0) addLog(state, `  ${player.name} loses ${player.carried.length} carried chip(s) to the deep.`);
  player.carried = [];
  player.dead = true;
  player.position = -99;
};

const advancePlayer = (state) => {
  const n = state.players.length;
  let attempts = 0, next = state.currentPlayerIndex;
  while (attempts < n) {
    next = (next + 1) % n;
    attempts++;
    if (state.players[next].dead) {
      addLog(state, `${state.players[next].name} is dead — turn skipped. ☠️`);
      continue;
    }
    break;
  }
  state.currentPlayerIndex = next;
};

const endRound = (state) => {
  addLog(state, `--- Round ${state.round} is over! ---`);
  for (const p of state.players) {
    if (p.position >= 0) {
      if (p.carried.length > 0) addLog(state, `${p.name} was underwater — loses ${p.carried.length} chip(s)!`);
      p.carried = [];
    }
    p.position = -1; p.direction = 'down'; p.dead = false;
    p.depthCharges = DEPTH_CHARGES_PER_ROUND; p.anchorActive = false;
  }
  const remainingChips = state.chips.filter(c => c !== null);
  state.chips = remainingChips.map((c, i) => ({ ...c, id: i }));
  state.boardSize = state.chips.length;

  // Co-op win/lose checks
  if (state.coop) {
    if (state.mission === 'treasure') {
      if (state.coopScore >= state.coopTarget) {
        state.gameOver = true; state.coopWin = true; state.turnPhase = 'gameOver';
        addLog(state, `🎉 MISSION COMPLETE! Team scored ${state.coopScore} / ${state.coopTarget} points!`);
        return state;
      }
    } else if (state.mission === 'monsters') {
      const monstersLeft = state.chips.filter(c => c && c.monster).length;
      state.monstersRemaining = monstersLeft;
      const allHome = state.players.every(p => p.position === -1);
      if (monstersLeft === 0 && allHome) {
        state.gameOver = true; state.coopWin = true; state.turnPhase = 'gameOver';
        addLog(state, `🎉 MISSION COMPLETE! All monsters destroyed and everyone is safe!`);
        return state;
      }
    }
  }

  if (state.round >= state.maxRounds) {
    state.gameOver = true; state.turnPhase = 'gameOver';
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
  state.round += 1; state.oxygen = STARTING_OXYGEN;
  state.currentPlayerIndex = (state.round - 1) % state.players.length;
  state.turnPhase = 'direction';
  state.diceResult = null;
  const starter = state.players[state.currentPlayerIndex].name;
  addLog(state, `=== Round ${state.round} begins. ${starter} goes first. Oxygen: ${state.oxygen} ===`);
  return state;
};

const endTurn = (state) => {
  if (isRoundOver(state.oxygen, state.players, !!state.coop)) return endRound(state);
  advancePlayer(state);
  state.turnPhase = 'direction';
  return state;
};

/* ═══════════════════════════════════════════════════════════
   Action handlers — each validates & mutates state, returns
   an event object for client-side animation.
   ═══════════════════════════════════════════════════════════ */

const handleChooseDirection = (state, { direction }) => {
  if (state.turnPhase !== 'direction') return null;
  const player = state.players[state.currentPlayerIndex];
  if (player.position === -1) direction = 'down';

  // Set direction
  player.direction = direction;
  state.turnPhase = 'roll';
  addLog(state, `${player.name} chooses to go ${player.direction}.`);

  // Consume oxygen
  if (!isOnSubmarine(player)) {
    state.oxygen = consumeOxygen(state.oxygen, player);
    if (player.carried.length > 0) {
      addLog(state, `${player.name} uses ${player.carried.length} oxygen. Oxygen → ${state.oxygen}`);
    }
  }

  const event = {};

  if (state.oxygen <= 0) {
    const drowned = state.players.filter(p => p.position >= 0 && !p.dead).map(p => p.name);
    state.turnPhase = 'endTurn';
    endTurn(state);
    if (state.gameOver) {
      if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
      else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
      else event.lastEvent = { type: 'gameOver', player: state.winner };
    } else if (drowned.length > 0) {
      event.lastEvent = { type: 'drown', player: drowned.join(', '), detail: 'Oxygen depleted!' };
    } else {
      event.lastEvent = { type: 'roundEnd', detail: `Round ${state.round} begins` };
    }
    event.oxygenDepleted = true;
  } else if (state.oxygen <= 5) {
    event.oxygenLow = true;
  }

  // Auto-roll dice immediately after choosing direction
  if (state.turnPhase === 'roll') {
    const rollEvent = handleRoll(state);
    if (rollEvent) Object.assign(event, rollEvent);
  }

  return event;
};

const canBuyAnchorCoop = (player, coopScore) => {
  if (player.position !== -1 || player.anchorActive) return false;
  return coopScore >= ANCHOR_COST;
};

const handleBuyAnchor = (state) => {
  if (state.turnPhase !== 'direction') return null;
  const player = state.players[state.currentPlayerIndex];

  if (state.coop) {
    // Co-op: spend from shared pool
    if (!canBuyAnchorCoop(player, state.coopScore)) return null;
    state.coopScore -= ANCHOR_COST;
    player.anchorActive = true;
    addLog(state, `⚓ ${player.name} purchases an Anchor Boost! (spent ${ANCHOR_COST} pts from team pool, pool → ${state.coopScore})`);
  } else {
    // Versus: spend from individual scored chips
    if (!canBuyAnchor(player)) return null;
    let remaining = ANCHOR_COST;
    player.scored.sort((a, b) => a.value - b.value);
    while (remaining > 0 && player.scored.length > 0) {
      const chip = player.scored[0];
      if (chip.value <= remaining) { remaining -= chip.value; player.scored.shift(); }
      else { chip.value -= remaining; remaining = 0; }
    }
    player.anchorActive = true;
    addLog(state, `⚓ ${player.name} purchases an Anchor Boost! (spent ${ANCHOR_COST} value)`);
  }
  return { lastAnchor: { player: player.name } };
};

const handleRoll = (state) => {
  if (state.turnPhase !== 'roll') return null;
  const { total } = rollDice();
  const player = state.players[state.currentPlayerIndex];
  const occupied = occupiedBy(state.players, player.id);

  let adjustedTotal = total;
  if (player.anchorActive) {
    adjustedTotal = total * ANCHOR_MULTIPLIER;
    player.anchorActive = false;
  }
  const effectiveSteps = Math.max(1, adjustedTotal - player.carried.length);
  const monsters = (state.coop && state.mission === 'monsters') ? getMonsterPositions(state.chips) : null;
  const dest = computeDestination(player.position, effectiveSteps, player.direction, occupied, state.boardSize, monsters);
  player.position = dest;

  state.diceResult = total;
  state.anchorUsedThisRoll = adjustedTotal !== total;

  const event = { diceTotal: total };

  if (dest === -1) {
    const scoredCount = player.carried.length;
    if (state.coop) {
      const value = player.carried.reduce((s, c) => s + c.value, 0);
      state.coopScore += value;
      player.carried = [];
    } else {
      player.scored.push(...player.carried);
      player.carried = [];
    }
    const anchorTag = adjustedTotal !== total ? ` ⚓×${ANCHOR_MULTIPLIER}→${adjustedTotal}` : '';
    addLog(state, `${player.name} rolled ${total}${anchorTag} (moves ${effectiveSteps}) and returned to the submarine! 🚢`);
    state.turnPhase = 'endTurn';
    endTurn(state);
    event.lastEvent = { type: 'returnSub', player: player.name, detail: `Secured ${scoredCount} chip(s)!` };
    if (state.gameOver) {
      if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
      else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
      else event.lastEvent = { type: 'gameOver', player: state.winner };
    }
    event.returnedToSub = true;
  } else {
    const anchorTag = adjustedTotal !== total ? ` ⚓×${ANCHOR_MULTIPLIER}→${adjustedTotal}` : '';
    addLog(state, `${player.name} rolled ${total}${anchorTag} (moves ${effectiveSteps}), lands on space ${dest}.`);
    state.turnPhase = 'pickup';
  }

  return event;
};

const handlePickUp = (state) => {
  if (state.turnPhase !== 'pickup') return null;
  const player = state.players[state.currentPlayerIndex];
  const pickCheck = state.coop ? canPickUpCoop(player, state.chips) : canPickUp(player, state.chips);
  if (!pickCheck) return null;
  const chip = state.chips[player.position];
  const chipLevel = chip.level, chipValue = chip.value;
  chip.discovered = true;
  player.carried.push(chip);
  state.chips[player.position] = null;
  addLog(state, `${player.name} picks up a level-${chip.level} chip from space ${player.position}.`);
  state.turnPhase = 'endTurn';
  const event = { lastEvent: { type: 'pickup', player: player.name, detail: `Level ${chipLevel} chip (value: ${chipValue})` } };
  endTurn(state);
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
    else event.lastEvent = { type: 'gameOver', player: state.winner };
  }
  return event;
};

const handleDrop = (state) => {
  if (state.turnPhase !== 'pickup') return null;
  const player = state.players[state.currentPlayerIndex];
  if (!canDrop(player, state.chips)) return null;
  const chip = player.carried.pop();
  state.chips[player.position] = chip;
  addLog(state, `${player.name} drops a level-${chip.level} chip on space ${player.position}.`);
  state.turnPhase = 'endTurn';
  const event = { lastEvent: { type: 'drop', player: player.name } };
  endTurn(state);
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
    else event.lastEvent = { type: 'gameOver', player: state.winner };
  }
  return event;
};

const handleSkip = (state) => {
  if (state.turnPhase !== 'pickup') return null;
  state.turnPhase = 'endTurn';
  endTurn(state);
  const event = { lastSkip: true };
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
    else event.lastEvent = { type: 'gameOver', player: state.winner };
  }
  return event;
};

const handleTrident = (state, { targetId }) => {
  if (state.turnPhase !== 'pickup') return null;
  const attacker = state.players[state.currentPlayerIndex];
  const target = state.players.find(p => p.id === targetId);
  if (!target || target.dead || target.position < 0) return null;

  const { roll, result } = resolveTridentRoll();
  const event = {};

  if (result === 'kill') {
    addLog(state, `🔱 ${attacker.name} attacks ${target.name}! Rolled ${roll} — ${target.name} is slain! ☠️`);
    killPlayer(state, target);
    event.lastKill = { victim: target.name, killer: attacker.name };
  } else if (result === 'backfire') {
    addLog(state, `🔱 ${attacker.name} attacks ${target.name}! Rolled ${roll} — backfire! ${attacker.name} dies! ☠️`);
    killPlayer(state, attacker);
    event.lastKill = { victim: attacker.name, killer: target.name, backfire: true };
  } else {
    addLog(state, `🔱 ${attacker.name} attacks ${target.name}! Rolled ${roll} — miss!`);
    event.tridentMiss = true;
  }

  state.turnPhase = 'endTurn';
  endTurn(state);
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
    else event.lastEvent = { type: 'gameOver', player: state.winner };
  }
  return event;
};

const handleDepthCharge = (state) => {
  if (state.turnPhase !== 'pickup') return null;
  const player = state.players[state.currentPlayerIndex];
  if (!canDepthCharge(player, state.chips, state.oxygen)) return null;
  const chip = state.chips[player.position];
  const chipLevel = chip.level, chipValue = chip.value;
  state.chips[player.position] = null;
  player.depthCharges -= 1;
  state.oxygen = Math.max(0, state.oxygen - DEPTH_CHARGE_OXYGEN_COST);
  addLog(state, `💣 ${player.name} detonates a Depth Charge! Destroys level-${chipLevel} chip (value: ${chipValue}). Oxygen -${DEPTH_CHARGE_OXYGEN_COST} → ${state.oxygen}`);
  state.turnPhase = 'endTurn';
  const event = { lastExplosion: { player: player.name, detail: `Level ${chipLevel} chip (value: ${chipValue}) destroyed!` } };
  endTurn(state);
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
    else event.lastEvent = { type: 'gameOver', player: state.winner };
  }
  return event;
};

const handleBuyBomb = (state) => {
  if (!state.coop || state.turnPhase !== 'direction') return null;
  const player = state.players[state.currentPlayerIndex];
  if (!canBuyBomb(player, state.coopScore)) return null;
  state.coopScore -= COOP_BOMB_COST;
  player.bombs = (player.bombs || 0) + 1;
  addLog(state, `💣 ${player.name} buys a bomb! (cost: ${COOP_BOMB_COST} pts from team pool, pool → ${state.coopScore})`);
  return { lastEvent: { type: 'bomb-buy', player: player.name, detail: `Bought a bomb! (${player.bombs} total)` } };
};

const handleUseBomb = (state) => {
  if (!state.coop || state.turnPhase !== 'pickup') return null;
  const player = state.players[state.currentPlayerIndex];
  if (!canUseBomb(player, state.chips)) return null;
  const pos = player.position;
  let targetPos = -1;
  if (pos + 1 < state.boardSize && state.chips[pos + 1] && state.chips[pos + 1].monster) {
    targetPos = pos + 1;
  } else if (pos - 1 >= 0 && state.chips[pos - 1] && state.chips[pos - 1].monster) {
    targetPos = pos - 1;
  }
  if (targetPos === -1) return null;
  state.chips[targetPos] = null;
  player.bombs -= 1;
  state.monstersRemaining = state.chips.filter(c => c && c.monster).length;
  addLog(state, `💥 ${player.name} bombs the sea monster on space ${targetPos}! 🐙💀 (${state.monstersRemaining} remaining)`);
  state.turnPhase = 'endTurn';
  const event = { lastExplosion: { player: player.name, detail: `Sea monster destroyed! (${state.monstersRemaining} remaining)` } };
  endTurn(state);
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
  }
  return event;
};

const handleSkipSubTurn = (state) => {
  if (state.turnPhase !== 'direction') return null;
  const player = state.players[state.currentPlayerIndex];
  if (player.position !== -1) return null;
  // Can't skip if everyone is still on the sub (first turn)
  const alive = state.players.filter(p => !p.dead);
  if (alive.every(p => p.position === -1)) return null;
  addLog(state, `${player.name} stays on the submarine. ⏭️`);
  state.turnPhase = 'endTurn';
  endTurn(state);
  const event = { lastSkip: true };
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
    else event.lastEvent = { type: 'gameOver', player: state.winner };
  }
  return event;
};

const handleEndRoundEarly = (state) => {
  if (!state.coop || state.turnPhase !== 'direction') return null;
  if (!allPlayersOnSub(state.players)) return null;
  addLog(state, `🚢 Team agrees to end the round early!`);
  endRound(state);
  const event = {};
  if (state.gameOver) {
    if (state.coopWin) event.lastEvent = { type: 'coopWin', player: 'Team', detail: 'Mission complete! 🎉' };
    else if (state.coopLose) event.lastEvent = { type: 'coopLose', player: 'Team', detail: 'Mission failed… 💀' };
  } else {
    event.lastEvent = { type: 'roundEnd', detail: `Round ${state.round} begins` };
  }
  return event;
};

const ACTION_HANDLERS = {
  'choose-direction': handleChooseDirection,
  'buy-anchor':       handleBuyAnchor,
  'roll':             handleRoll,
  'pick-up':          handlePickUp,
  'drop':             handleDrop,
  'skip':             handleSkip,
  'skip-sub-turn':    handleSkipSubTurn,
  'end-round-early':  handleEndRoundEarly,
  'trident':          handleTrident,
  'depth-charge':     handleDepthCharge,
  'buy-bomb':         handleBuyBomb,
  'use-bomb':         handleUseBomb,
};

/* ═══════════════════════════════════════════════════════════
   Room management
   ═══════════════════════════════════════════════════════════ */

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * Room structure:
 * {
 *   code:    string,
 *   host:    WebSocket,
 *   clients: Map<WebSocket, { name, playerId }>,
 *   names:   string[],          // ordered player names
 *   state:   object | null,     // game state (null = lobby)
 *   started: boolean,
 * }
 */

const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I/O/0/1
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
};

const send = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};

const broadcastState = (room, event = {}) => {
  for (const [ws, info] of room.clients) {
    send(ws, {
      type: 'state',
      state: room.state,
      playerId: info.playerId,
      event,
    });
  }
};

const broadcastLobby = (room) => {
  const names = room.names;
  for (const [ws, info] of room.clients) {
    send(ws, { type: 'lobby', code: room.code, names, you: info.name, coop: room.coop || false, mission: room.mission || null });
  }
};

const removeClient = (ws) => {
  for (const [code, room] of rooms) {
    if (!room.clients.has(ws)) continue;
    const info = room.clients.get(ws);
    room.clients.delete(ws);

    if (room.clients.size === 0) {
      rooms.delete(code);
      console.log(`Room ${code} deleted (empty)`);
    } else if (!room.started) {
      // Remove name from lobby
      room.names = room.names.filter(n => n !== info.name);
      broadcastLobby(room);
      console.log(`${info.name} left lobby ${code}`);
    } else {
      // Mid-game disconnect: notify remaining players
      for (const [ws2] of room.clients) {
        send(ws2, { type: 'player-disconnected', name: info.name });
      }
      console.log(`${info.name} disconnected from game ${code}`);
    }
    break;
  }
};

/* ═══════════════════════════════════════════════════════════
   HTTP static file server
   ═══════════════════════════════════════════════════════════ */

const httpServer = createServer(async (req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = join(ROOT, url);
  const ext = extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

/* ═══════════════════════════════════════════════════════════
   WebSocket server
   ═══════════════════════════════════════════════════════════ */

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      /* ── create room ─────────────────────────────── */
      case 'create': {
        const name = (msg.name || 'Host').slice(0, 12);
        const code = generateCode();
        const room = {
          code,
          host: ws,
          clients: new Map(),
          names: [name],
          state: null,
          started: false,
          coop: msg.coop || false,
          mission: msg.mission || null,
        };
        room.clients.set(ws, { name, playerId: 0 });
        rooms.set(code, room);
        send(ws, { type: 'created', code });
        broadcastLobby(room);
        console.log(`Room ${code} created by ${name}${room.coop ? ` (co-op: ${room.mission})` : ''}`);
        break;
      }

      /* ── join room ───────────────────────────────── */
      case 'join': {
        const code = (msg.code || '').toUpperCase();
        const name = (msg.name || 'Player').slice(0, 12);
        const room = rooms.get(code);

        if (!room) { send(ws, { type: 'error', message: 'Room not found.' }); break; }
        if (room.started) { send(ws, { type: 'error', message: 'Game already started.' }); break; }
        if (room.names.length >= MAX_PLAYERS) { send(ws, { type: 'error', message: 'Room is full.' }); break; }
        if (room.names.includes(name)) { send(ws, { type: 'error', message: 'Name already taken.' }); break; }

        const playerId = room.names.length;
        room.names.push(name);
        room.clients.set(ws, { name, playerId });
        broadcastLobby(room);
        console.log(`${name} joined room ${code}`);
        break;
      }

      /* ── start game (host only) ──────────────────── */
      case 'start': {
        const room = roomForWs(ws);
        if (!room) break;
        if (ws !== room.host) { send(ws, { type: 'error', message: 'Only the host can start.' }); break; }
        if (room.names.length < MIN_PLAYERS) { send(ws, { type: 'error', message: `Need at least ${MIN_PLAYERS} players.` }); break; }

        if (room.coop && room.mission) {
          room.state = createCoopGameState(room.names, room.mission);
          const missionLabel = room.mission === 'treasure'
            ? `Treasure Haul — collect ${room.state.coopTarget} pts together!`
            : `Monster Hunt — destroy all ${room.state.monstersRemaining} sea monsters!`;
          room.state.log.push(`=== Co-op: ${missionLabel} ===`);
        } else {
          room.state = createGameState(room.names);
        }
        room.state.log.push(`=== Round 1 begins. Oxygen: ${room.state.oxygen} ===`);
        room.started = true;

        broadcastState(room);
        console.log(`Game started in room ${room.code} with ${room.names.length} players${room.coop ? ' (co-op)' : ''}`);
        break;
      }

      /* ── game action ─────────────────────────────── */
      case 'action': {
        const room = roomForWs(ws);
        if (!room || !room.started || !room.state) break;

        const info = room.clients.get(ws);
        if (!info) break;

        // Only the current player can act
        if (info.playerId !== room.state.currentPlayerIndex) {
          send(ws, { type: 'error', message: 'Not your turn.' });
          break;
        }

        const handler = ACTION_HANDLERS[msg.action];
        if (!handler) { send(ws, { type: 'error', message: 'Unknown action.' }); break; }

        const event = handler(room.state, msg.payload || {});
        if (event === null) { send(ws, { type: 'error', message: 'Invalid action.' }); break; }

        broadcastState(room, event);
        break;
      }

      /* ── restart (host only) ─────────────────────── */
      case 'restart': {
        const room = roomForWs(ws);
        if (!room) break;
        if (ws !== room.host) break;

        if (room.coop && room.mission) {
          room.state = createCoopGameState(room.names, room.mission);
          const missionLabel = room.mission === 'treasure'
            ? `Treasure Haul — collect ${room.state.coopTarget} pts together!`
            : `Monster Hunt — destroy all ${room.state.monstersRemaining} sea monsters!`;
          room.state.log.push(`=== Co-op: ${missionLabel} ===`);
        } else {
          room.state = createGameState(room.names);
        }
        room.state.log.push(`=== Round 1 begins. Oxygen: ${room.state.oxygen} ===`);
        broadcastState(room);
        console.log(`Game restarted in room ${room.code}`);
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => removeClient(ws));
  ws.on('error', () => removeClient(ws));
});

const roomForWs = (ws) => {
  for (const room of rooms.values()) {
    if (room.clients.has(ws)) return room;
  }
  return null;
};

/* ═══════════════════════════════════════════════════════════
   Start
   ═══════════════════════════════════════════════════════════ */

httpServer.listen(PORT, () => {
  console.log(`🌊 Dive, Laugh, Love server running at http://localhost:${PORT}`);
  console.log(`   WebSocket ready for multiplayer connections`);
});
