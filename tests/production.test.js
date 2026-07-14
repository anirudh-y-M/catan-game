import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import { produce } from '../src/engine/production.js';
import { createRng } from '../src/engine/rng.js';

function game() {
  return createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed: 1,
  });
}

/** Find an rngState whose next two die rolls sum to `target`. */
function rngStateForSum(target) {
  for (let x = 1; x < 200000; x++) {
    const r = createRng(x);
    if (r.rollDie() + r.rollDie() === target) return x;
  }
  throw new Error('no seed found');
}

test('settlement yields 1, city yields 2, robber blocks the hex', () => {
  const s = game();
  const hex = s.board.hexes.find((h) => h.resource === 'ore');
  hex.token = 5;
  const [v0, v1] = hex.vertices;
  s.board.vertices[v0].building = { type: 'settlement', player: 0 };
  s.board.vertices[v1].building = { type: 'city', player: 1 };

  let gains = produce(s, 5);
  assert.equal(gains[0].ore, 1);
  assert.equal(gains[1].ore, 2);
  assert.equal(s.players[0].resources.ore, 1);
  assert.equal(s.players[1].resources.ore, 2);

  // Now block it with the robber -> no production.
  s.board.robberHex = hex.id;
  gains = produce(s, 5);
  assert.deepEqual(gains, {});
});

test('bank shortage: two claimants get nothing; sole claimant gets the remainder', () => {
  // Two claimants, not enough for both.
  let s = game();
  let hex = s.board.hexes.find((h) => h.resource === 'ore');
  hex.token = 6;
  const [v0, v1] = hex.vertices;
  s.board.vertices[v0].building = { type: 'settlement', player: 0 };
  s.board.vertices[v1].building = { type: 'settlement', player: 1 };
  s.bank.ore = 1;
  produce(s, 6);
  assert.equal(s.players[0].resources.ore, 0);
  assert.equal(s.players[1].resources.ore, 0);
  assert.equal(s.bank.ore, 1); // untouched

  // Single claimant demanding 2 (city) with only 1 in the bank -> gets 1.
  s = game();
  hex = s.board.hexes.find((h) => h.resource === 'ore');
  hex.token = 6;
  s.board.vertices[hex.vertices[0]].building = { type: 'city', player: 0 };
  s.bank.ore = 1;
  produce(s, 6);
  assert.equal(s.players[0].resources.ore, 1);
  assert.equal(s.bank.ore, 0);
});

test('rollDice: 7 with a player holding >7 cards enters discard', () => {
  const s = game();
  s.phase = 'roll';
  s.players[0].resources = { brick: 3, lumber: 3, wool: 3, grain: 0, ore: 0 }; // 9 cards
  s.rngState = rngStateForSum(7);
  const next = applyAction(s, { type: 'rollDice' });
  assert.equal(next.lastRoll, 7);
  assert.equal(next.phase, 'discard');
  assert.deepEqual(next.pendingDiscards, [0]);
});

test('rollDice: 7 with nobody over the limit goes straight to moveRobber', () => {
  const s = game();
  s.phase = 'roll';
  s.rngState = rngStateForSum(7);
  const next = applyAction(s, { type: 'rollDice' });
  assert.equal(next.phase, 'moveRobber');
  assert.deepEqual(next.pendingDiscards, []);
});

test('sevensMode "reduced" re-rolls a 7 away', () => {
  // Find a seed where the first roll is 7, the re-roll chance passes (<0.6),
  // and the re-roll is not a 7 — mirroring rollDice's RNG consumption order.
  let seed = null;
  for (let x = 1; x < 500000 && seed === null; x++) {
    const r = createRng(x);
    const a = r.int(6) + 1; const b = r.int(6) + 1;
    if (a + b !== 7) continue;
    if (!(r.next() < 0.6)) continue;
    const c = r.int(6) + 1; const d = r.int(6) + 1;
    if (c + d !== 7) seed = x;
  }
  assert.ok(seed !== null, 'seed found');

  const s = game();
  s.phase = 'roll';
  s.config.sevensMode = 'reduced';
  s.rngState = seed;
  const next = applyAction(s, { type: 'rollDice' });
  assert.notEqual(next.lastRoll, 7); // the 7 was re-rolled away
});

test('rollDice: non-7 produces and enters main phase', () => {
  const s = game();
  s.phase = 'roll';
  s.rngState = rngStateForSum(8);
  const next = applyAction(s, { type: 'rollDice' });
  assert.equal(next.lastRoll, 8);
  assert.equal(next.phase, 'main');
  assert.deepEqual(next.dice, next.dice.map(Number));
});
