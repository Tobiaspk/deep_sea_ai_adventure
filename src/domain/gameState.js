/**
 * Game state factory and helpers.
 * The state object is the single source of truth for the entire game.
 */

import {
  STARTING_OXYGEN,
  TOTAL_ROUNDS,
  CHIP_LEVELS,
  LEVEL_VALUE_RANGES,
  BOARD_SIZE,
  DEPTH_CHARGES_PER_ROUND,
  COOP_TREASURE_PER_PLAYER,
  COOP_BOMB_COST,
} from '../infra/constants.js';

/** Generate a random integer in [min, max] inclusive. */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Create initial treasure chips on the board.
 * Each chip: { id, level, value, discovered: false }
 * Values are hidden until picked up.
 */
export const createChips = () =>
  CHIP_LEVELS.map((level, index) => {
    const [lo, hi] = LEVEL_VALUE_RANGES[level];
    return {
      id: index,
      level,
      value: randInt(lo, hi),
      discovered: false,
    };
  });

/**
 * Create a fresh player object.
 */
export const createPlayer = (id, name) => ({
  id,
  name,
  position: -1,          // -1 = on the submarine
  direction: 'down',     // 'down' or 'up'
  carried: [],           // array of chip objects currently held
  scored: [],            // chips safely brought back (across rounds)
  drowned: false,        // set when oxygen runs out while underwater
  dead: false,           // killed by Poseidon's Trident this round
  depthCharges: DEPTH_CHARGES_PER_ROUND, // depth charges remaining this round
  anchorActive: false,   // true if anchor purchased — next roll is multiplied
  bombs: 0,              // co-op: bombs purchased to destroy monsters
});

/**
 * Create a brand-new game state for the given player names.
 */
export const createGameState = (playerNames) => {
  const players = playerNames.map((name, i) => createPlayer(i, name));
  return {
    round: 1,
    maxRounds: TOTAL_ROUNDS,
    oxygen: STARTING_OXYGEN,
    boardSize: BOARD_SIZE,
    chips: createChips(),            // mutable chip array (spaces on board)
    players,
    currentPlayerIndex: 0,
    turnPhase: 'direction',          // 'direction' | 'roll' | 'pickup' | 'roundEnd' | 'gameOver'
    diceResult: null,
    roundOver: false,
    gameOver: false,
    winner: null,
    log: [],                         // human-readable event log
  };
};

/** Deep-clone the state (simple JSON round-trip, fine for this size). */
export const cloneState = (state) => JSON.parse(JSON.stringify(state));

/* ── Co-op game state ─────────────────────────────────────── */

/**
 * Create chips for Monster Hunt: normal chips + one monster per player,
 * evenly spaced so there are enough treasure chips before each monster
 * for the team to collect and fund bombs.
 */
const createMonsterChips = (monsterCount) => {
  const chips = createChips();
  // Place monsters evenly in the range [6 .. boardSize-3]
  // This guarantees the first ~6 chips are always collectible treasure,
  // and there's a gap of treasure between each monster.
  const lo = 6;
  const hi = chips.length - 3;
  const span = hi - lo;
  const positions = [];
  for (let i = 0; i < monsterCount; i++) {
    const pos = lo + Math.round((span / (monsterCount + 1)) * (i + 1));
    positions.push(pos);
  }
  for (const pos of positions) {
    chips[pos] = {
      id: pos,
      level: 'monster',
      value: 0,
      discovered: true,
      monster: true,
    };
  }
  return chips;
};

/**
 * Create a co-op game state.
 * @param {string[]} playerNames
 * @param {'treasure'|'monsters'} mission
 */
export const createCoopGameState = (playerNames, mission) => {
  const players = playerNames.map((name, i) => createPlayer(i, name));
  const isMonsterMission = mission === 'monsters';
  const monsterCount = playerNames.length;
  const chips = isMonsterMission ? createMonsterChips(monsterCount) : createChips();

  return {
    round: 1,
    maxRounds: TOTAL_ROUNDS,
    oxygen: STARTING_OXYGEN,
    boardSize: BOARD_SIZE,
    chips,
    players,
    currentPlayerIndex: 0,
    turnPhase: 'direction',
    diceResult: null,
    roundOver: false,
    gameOver: false,
    winner: null,
    log: [],
    // Co-op fields
    coop: true,
    mission,                          // 'treasure' | 'monsters'
    coopScore: 0,                     // shared pool of scored treasure
    coopTarget: mission === 'treasure' ? COOP_TREASURE_PER_PLAYER * playerNames.length : null,
    monstersRemaining: isMonsterMission ? monsterCount : 0,
    coopWin: false,
    coopLose: false,
    bombCost: COOP_BOMB_COST,
  };
};
