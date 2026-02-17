/** Game-wide constants (inspired by the Deep Sea Adventure rulebook). */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const TOTAL_ROUNDS = 3;
export const STARTING_OXYGEN = 25;

/**
 * Treasure chip distribution along the path (32 chips total).
 * Indices 0-7   → level 1 (blank-dot triangles, values 0–3)
 * Indices 8-15  → level 2 (values 4–7)
 * Indices 16-23 → level 3 (values 8–11)
 * Indices 24-31 → level 4 (values 12–15)
 */
export const CHIP_LEVELS = [
  1, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2,
  3, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4,
];

/** Value ranges per level (inclusive). */
export const LEVEL_VALUE_RANGES = {
  1: [0, 3],
  2: [4, 7],
  3: [8, 11],
  4: [12, 15],
};

export const BOARD_SIZE = CHIP_LEVELS.length; // 32 spaces

/** Depth charges each player gets per round. */
export const DEPTH_CHARGES_PER_ROUND = 1;

/** Oxygen cost to detonate a depth charge. */
export const DEPTH_CHARGE_OXYGEN_COST = 3;

/** Cost (in scored value) to purchase an anchor. */
export const ANCHOR_COST = 3;

/** Roll multiplier when an anchor is active. */
export const ANCHOR_MULTIPLIER = 5;

/** Player colours for rendering. */
export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
