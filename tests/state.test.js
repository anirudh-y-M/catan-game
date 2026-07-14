import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, cloneState, rngFrom, commitRng } from '../src/engine/state.js';

const twoPlayers = [
  { name: 'Ann', color: 'red' },
  { name: 'Bob', color: 'blue' },
];

test('rejects fewer than 2 or more than 4 players', () => {
  assert.throws(() => createGame({ players: [{ name: 'Solo', color: 'red' }] }));
  assert.throws(() => createGame({
    players: [
      { name: 'a', color: 'red' }, { name: 'b', color: 'blue' },
      { name: 'c', color: 'orange' }, { name: 'd', color: 'violet' },
      { name: 'e', color: 'green' },
    ],
  }));
});

test('rejects duplicate colours', () => {
  assert.throws(() => createGame({
    players: [{ name: 'a', color: 'red' }, { name: 'b', color: 'red' }],
  }));
});

test('fresh game: setup phase, full bank, 25-card deck, empty hands', () => {
  const s = createGame({ players: twoPlayers, seed: 1 });
  assert.equal(s.phase, 'setup');
  assert.equal(s.devDeck.length, 25);
  for (const p of s.players) {
    assert.equal(p.pieces.settlements, 5);
    assert.equal(p.pieces.cities, 4);
    assert.equal(p.pieces.roads, 15);
    assert.equal(Object.values(p.resources).reduce((a, b) => a + b, 0), 0);
  }
  assert.equal(Object.values(s.bank).every((n) => n === 19), true);
});

test('snake setup order for 3 players is [0,1,2,2,1,0]', () => {
  const s = createGame({
    players: [
      { name: 'a', color: 'red' }, { name: 'b', color: 'blue' }, { name: 'c', color: 'orange' },
    ],
    seed: 1,
  });
  assert.deepEqual(s.setup.order, [0, 1, 2, 2, 1, 0]);
  assert.equal(s.current, 0);
});

test('variant sets target VP (standard 10, quick 8)', () => {
  assert.equal(createGame({ players: twoPlayers, variant: 'standard' }).config.targetVP, 10);
  assert.equal(createGame({ players: twoPlayers, variant: 'quick' }).config.targetVP, 8);
});

test('same seed reproduces identical board and deck', () => {
  const a = createGame({ players: twoPlayers, seed: 4242 });
  const b = createGame({ players: twoPlayers, seed: 4242 });
  assert.deepEqual(a.board.hexes.map((h) => h.terrain), b.board.hexes.map((h) => h.terrain));
  assert.deepEqual(a.devDeck, b.devDeck);
});

test('cloneState is a deep copy; rng helpers round-trip', () => {
  const s = createGame({ players: twoPlayers, seed: 9 });
  const c = cloneState(s);
  c.players[0].resources.brick = 5;
  assert.equal(s.players[0].resources.brick, 0);

  const r = rngFrom(s);
  const roll = r.rollDie();
  commitRng(s, r);
  assert.equal(typeof roll, 'number');
  assert.equal(typeof s.rngState, 'number');
});
