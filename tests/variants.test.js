import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import { legalSetupSettlementVertices, legalSetupRoadEdges } from '../src/engine/rules.js';

const players = (n) => [
  { name: 'A', color: 'red' }, { name: 'B', color: 'blue' },
  { name: 'C', color: 'orange' }, { name: 'D', color: 'violet' },
].slice(0, n);

function runSetup(s) {
  const chosen = [];
  while (s.phase === 'setup') {
    const p = s.setup.pointer;
    const vId = legalSetupSettlementVertices(s)[0];
    chosen[p] = vId;
    s = applyAction(s, { type: 'placeSetupSettlement', vId });
    s = applyAction(s, { type: 'placeSetupRoad', eId: legalSetupRoadEdges(s, vId)[0] });
  }
  return { s, chosen };
}
const handTotal = (p) => Object.values(p.resources).reduce((a, b) => a + b, 0);

test('The Works: config + 3-round snake setup order', () => {
  const s = createGame({ players: players(3), variant: 'works', seed: 1 });
  assert.equal(s.config.targetVP, 8);
  assert.equal(s.config.setupSettlements, 3);
  assert.equal(s.config.bonusResources, 3);
  assert.equal(s.config.freeDevCards, 1);
  assert.equal(s.config.discardLimit, 9);
  // 3 rounds, snake: forward, reverse, forward.
  assert.deepEqual(s.setup.order, [0, 1, 2, 2, 1, 0, 0, 1, 2]);
});

test('The Works: everyone places 3 settlements/roads and gets bonuses', () => {
  const { s, chosen } = runSetup(createGame({ players: players(2), variant: 'works', seed: 5 }));
  assert.equal(s.phase, 'roll');
  for (const p of s.players) {
    assert.equal(p.pieces.settlements, 2); // 5 - 3 placed
    assert.equal(p.pieces.roads, 12); // 15 - 3 placed
    assert.equal(p.dev.length, 1); // one free dev card
    assert.equal(p.dev[0].boughtTurn, 0); // playable from turn 1
  }
  // Final-round settlements are pointers 4,5 (players 1,0 in round 3: order [0,1,1,0,0,1]).
  // For 2 players, 3 rounds snake = [0,1,1,0,0,1]; final round starts at pointer 4.
  const finalByPlayer = { 0: chosen[4], 1: chosen[5] };
  for (const [pid, vId] of Object.entries(finalByPlayer)) {
    const produce = s.board.vertices[vId].hexes.filter((hId) => s.board.hexes[hId].resource).length;
    assert.equal(handTotal(s.players[pid]), produce + 3); // final-settlement yield + 3 bonus
  }
});

test('The Works: discard threshold is 9, not 7', () => {
  const s = createGame({ players: players(2), variant: 'works', seed: 2 });
  assert.equal(s.config.discardLimit, 9);
});

test('custom win target overrides the variant default and clamps to 3..25', () => {
  assert.equal(createGame({ players: players(2), variant: 'standard', targetVP: 12, seed: 1 }).config.targetVP, 12);
  assert.equal(createGame({ players: players(2), variant: 'quick', targetVP: 15, seed: 1 }).config.targetVP, 15);
  assert.equal(createGame({ players: players(2), targetVP: 1, seed: 1 }).config.targetVP, 3); // clamp low
  assert.equal(createGame({ players: players(2), targetVP: 999, seed: 1 }).config.targetVP, 25); // clamp high
  assert.equal(createGame({ players: players(2), variant: 'standard', seed: 1 }).config.targetVP, 10); // omitted -> default
});

test('permanent-settlements flag is stored in config (default off)', () => {
  assert.equal(createGame({ players: players(2), seed: 1 }).config.permanentSettlements, false);
  assert.equal(createGame({ players: players(2), permanentSettlements: true, seed: 1 }).config.permanentSettlements, true);
});

test('Standard and Quick still behave as before', () => {
  const std = createGame({ players: players(2), variant: 'standard', seed: 1 });
  assert.equal(std.config.targetVP, 10);
  assert.equal(std.config.setupSettlements, 2);
  assert.equal(std.config.discardLimit, 7);
  assert.deepEqual(std.setup.order, [0, 1, 1, 0]);

  const q = createGame({ players: players(2), variant: 'quick', seed: 1 });
  assert.equal(q.config.targetVP, 8);
  assert.equal(q.config.bonusResources, 1);
  assert.equal(q.config.setupSettlements, 2);
});
