/**
 * Minimal domain-rules tests.
 * Run with:  node tests/domain.rules.test.js
 *
 * Uses a tiny hand-rolled test runner (no dependencies).
 */

import { createGameState, createPlayer } from '../src/domain/gameState.js';
import {
  oxygenCost,
  consumeOxygen,
  computeDestination,
  occupiedBy,
  canPickUp,
  canDrop,
  isRoundOver,
} from '../src/domain/rules.js';
import {
  applyOxygenCost,
  chooseDirection,
  applyMovement,
  pickUpChip,
  endRound,
  playerScore,
} from '../src/domain/turnEngine.js';

let passed = 0;
let failed = 0;

const assert = (cond, msg) => {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${msg}`);
  }
};

/* ── helper ───────────────────────────────────────────────── */
const freshState = () => createGameState(['Alice', 'Bob']);

/* ── Tests ────────────────────────────────────────────────── */
console.log('\n=== Game State ===');
{
  const s = freshState();
  assert(s.players.length === 2, 'creates 2 players');
  assert(s.oxygen === 25, 'starting oxygen is 25');
  assert(s.round === 1, 'starts at round 1');
  assert(s.chips.length === 32, 'board has 32 chips');
  assert(s.players[0].position === -1, 'player starts on submarine');
}

console.log('\n=== Oxygen ===');
{
  const p = createPlayer(0, 'Test');
  assert(oxygenCost(p) === 0, 'no carried chips → 0 cost');
  p.carried = [{ id: 0, level: 1, value: 1 }];
  assert(oxygenCost(p) === 1, '1 chip → 1 cost');
  assert(consumeOxygen(10, p) === 9, 'oxygen reduced correctly');
  assert(consumeOxygen(0, p) === 0, 'oxygen cannot go below 0');
}

console.log('\n=== Movement ===');
{
  const occ = new Set();
  assert(computeDestination(-1, 3, 'down', occ) === 2, 'from sub, 3 steps → position 2');
  assert(computeDestination(5, 2, 'down', occ) === 7, 'from 5, 2 steps down → 7');
  assert(computeDestination(2, 4, 'up', occ) === -1, 'from 2, 4 steps up → submarine');
  assert(computeDestination(5, 2, 'up', occ) === 3, 'from 5, 2 steps up → 3');

  // Skip occupied spaces
  const occ2 = new Set([3]);
  assert(computeDestination(2, 1, 'down', occ2) === 4, 'skips occupied space');
}

console.log('\n=== Pickup / Drop ===');
{
  const s = freshState();
  const p = s.players[0];
  p.position = 5;
  assert(canPickUp(p, s.chips) === true, 'can pick up when chip exists');
  s.chips[5] = null;
  assert(canPickUp(p, s.chips) === false, 'cannot pick up from empty space');
  assert(canDrop(p, s.chips) === false, 'cannot drop with no chips carried');
  p.carried = [{ id: 99, level: 1, value: 1 }];
  assert(canDrop(p, s.chips) === true, 'can drop on empty space');
}

console.log('\n=== Round End ===');
{
  assert(isRoundOver(0, [createPlayer(0, 'A')]) === true, 'round over at 0 oxygen');
  const p1 = createPlayer(0, 'A');
  const p2 = createPlayer(1, 'B');
  assert(isRoundOver(10, [p1, p2]) === true, 'round over when all on sub');
  p1.position = 3;
  assert(isRoundOver(10, [p1, p2]) === false, 'round NOT over when player still diving');
}

console.log('\n=== Scoring ===');
{
  const p = createPlayer(0, 'Scorer');
  p.scored = [{ value: 5 }, { value: 10 }, { value: 3 }];
  assert(playerScore(p) === 18, 'score sums chip values');
}

console.log('\n=== Turn Engine Integration ===');
{
  const s = freshState();
  chooseDirection(s, 'down');
  assert(s.turnPhase === 'roll', 'after direction → phase is roll');
  assert(s.players[0].direction === 'down', 'direction set correctly');

  applyMovement(s, 4);
  assert(s.players[0].position >= 0, 'player moved onto board');
}

/* ── Summary ──────────────────────────────────────────────── */
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
