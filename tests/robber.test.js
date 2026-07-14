import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import { robberCandidates } from '../src/engine/robber.js';

function game() {
  return createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed: 2,
  });
}

test('discard rejects the wrong count and accepts exactly half (rounded down)', () => {
  const s = game();
  s.phase = 'discard';
  s.pendingDiscards = [0];
  s.players[0].resources = { brick: 3, lumber: 3, wool: 3, grain: 0, ore: 0 }; // 9 -> discard 4
  assert.throws(() => applyAction(s, { type: 'discard', playerId: 0, cards: { brick: 3 } }));
  const next = applyAction(s, { type: 'discard', playerId: 0, cards: { brick: 3, lumber: 1 } });
  assert.equal(next.players[0].resources.brick, 0);
  assert.equal(next.players[0].resources.lumber, 2);
  assert.equal(next.bank.brick, s.bank.brick + 3);
});

test('when the last discarder finishes, phase advances to moveRobber', () => {
  let s = game();
  s.phase = 'discard';
  s.pendingDiscards = [0, 1];
  s.players[0].resources = { brick: 8, lumber: 0, wool: 0, grain: 0, ore: 0 };
  s.players[1].resources = { lumber: 8, wool: 0, brick: 0, grain: 0, ore: 0 };
  s = applyAction(s, { type: 'discard', playerId: 0, cards: { brick: 4 } });
  assert.equal(s.phase, 'discard'); // player 1 still owes
  s = applyAction(s, { type: 'discard', playerId: 1, cards: { lumber: 4 } });
  assert.equal(s.phase, 'moveRobber');
});

test('moveRobber to the same hex throws; to a new hex computes candidates', () => {
  const s = game();
  s.phase = 'moveRobber';
  s.current = 0;
  const target = s.board.hexes.find((h) => h.id !== s.board.robberHex);
  // Put an opponent settlement (with a card) on the target hex.
  s.board.vertices[target.vertices[0]].building = { type: 'settlement', player: 1 };
  s.players[1].resources.brick = 1;

  assert.throws(() => applyAction(s, { type: 'moveRobber', hexId: s.board.robberHex }));
  const next = applyAction(s, { type: 'moveRobber', hexId: target.id });
  assert.equal(next.board.robberHex, target.id);
  assert.equal(next.phase, 'steal');
  assert.deepEqual(next.stealCandidates, [1]);
});

test('moveRobber to a hex with no robbable opponents goes to main', () => {
  const s = game();
  s.phase = 'moveRobber';
  s.current = 0;
  const target = s.board.hexes.find((h) => h.id !== s.board.robberHex);
  const next = applyAction(s, { type: 'moveRobber', hexId: target.id });
  assert.equal(next.phase, 'main');
  assert.deepEqual(next.stealCandidates, []);
});

test('steal moves exactly one card and ends in main; invalid target throws', () => {
  const s = game();
  s.phase = 'steal';
  s.current = 0;
  s.stealCandidates = [1];
  s.players[1].resources = { brick: 2, lumber: 0, wool: 0, grain: 0, ore: 0 };
  assert.throws(() => applyAction(s, { type: 'steal', targetPlayerId: 0 }));
  const next = applyAction(s, { type: 'steal', targetPlayerId: 1 });
  const gained = Object.values(next.players[0].resources).reduce((a, b) => a + b, 0);
  const victimLeft = Object.values(next.players[1].resources).reduce((a, b) => a + b, 0);
  assert.equal(gained, 1);
  assert.equal(victimLeft, 1);
  assert.equal(next.phase, 'main');
});

test('robberCandidates excludes the current player and cardless opponents', () => {
  const s = game();
  s.current = 0;
  const hex = s.board.hexes[9];
  s.board.vertices[hex.vertices[0]].building = { type: 'settlement', player: 0 }; // self
  s.board.vertices[hex.vertices[1]].building = { type: 'settlement', player: 1 }; // no cards
  assert.deepEqual(robberCandidates(s, hex.id), []);
  s.players[1].resources.ore = 1;
  assert.deepEqual(robberCandidates(s, hex.id), [1]);
});
