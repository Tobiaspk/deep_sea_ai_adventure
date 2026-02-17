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
