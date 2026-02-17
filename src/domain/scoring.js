/**
 * Scoring utilities.
 */

/** Total score for a single player (sum of scored chip values). */
export const playerScore = (player) =>
  player.scored.reduce((sum, chip) => sum + chip.value, 0);

/** Return array of { name, score } sorted descending. */
export const scoreboard = (players) =>
  players
    .map((p) => ({ name: p.name, score: playerScore(p) }))
    .sort((a, b) => b.score - a.score);
