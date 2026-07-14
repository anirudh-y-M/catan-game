import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import {
  legalSetupSettlementVertices, legalSetupRoadEdges,
} from '../src/engine/rules.js';

function players(n) {
  return [
    { name: 'A', color: 'red' }, { name: 'B', color: 'blue' },
    { name: 'C', color: 'orange' }, { name: 'D', color: 'violet' },
  ].slice(0, n);
}

/** Run a full legal setup, returning the final state and each pointer's chosen vertex. */
function runSetup(state) {
  const chosen = [];
  while (state.phase === 'setup') {
    const pointer = state.setup.pointer;
    const vId = legalSetupSettlementVertices(state)[0];
    chosen[pointer] = vId;
    state = applyAction(state, { type: 'placeSetupSettlement', vId });
    const eId = legalSetupRoadEdges(state, vId)[0];
    state = applyAction(state, { type: 'placeSetupRoad', eId });
  }
  return { state, chosen };
}

function producingAdjacentCount(state, vId) {
  return state.board.vertices[vId].hexes
    .filter((hId) => state.board.hexes[hId].resource !== null).length;
}

test('full 3-player setup: 6 settlements + 6 roads, snake order, then roll phase', () => {
  const { state } = runSetup(createGame({ players: players(3), seed: 3 }));
  assert.equal(state.phase, 'roll');
  assert.equal(state.turn, 1);
  assert.equal(state.current, 0); // last placer / starting player
  for (const p of state.players) {
    assert.equal(p.pieces.settlements, 3); // placed 2
    assert.equal(p.pieces.roads, 13); // placed 2
  }
  // 6 buildings + 6 roads on the board.
  assert.equal(state.board.vertices.filter((v) => v.building).length, 6);
  assert.equal(state.board.edges.filter((e) => e.road !== null).length, 6);
});

test('starting resources equal the 2nd settlement adjacency', () => {
  const { state, chosen } = runSetup(createGame({ players: players(3), seed: 8 }));
  // Round-2 placements are pointers 3,4,5 for players 2,1,0.
  const secondSettlementByPlayer = { 2: chosen[3], 1: chosen[4], 0: chosen[5] };
  for (const [pid, vId] of Object.entries(secondSettlementByPlayer)) {
    const expected = producingAdjacentCount(state, vId);
    const total = Object.values(state.players[pid].resources).reduce((a, b) => a + b, 0);
    assert.equal(total, expected);
  }
});

test('illegal setup settlement (distance rule) throws', () => {
  let s = createGame({ players: players(2), seed: 5 });
  const vId = legalSetupSettlementVertices(s)[0];
  s = applyAction(s, { type: 'placeSetupSettlement', vId });
  const eId = legalSetupRoadEdges(s, vId)[0];
  s = applyAction(s, { type: 'placeSetupRoad', eId });
  // Next player tries to settle right next to the first settlement.
  const neighbour = s.board.vertices[vId].adj[0];
  assert.throws(() => applyAction(s, { type: 'placeSetupSettlement', vId: neighbour }));
});

test('Quick Play grants exactly one bonus resource per player', () => {
  const { state, chosen } = runSetup(createGame({ players: players(2), variant: 'quick', seed: 11 }));
  const secondByPlayer = { 1: chosen[2], 0: chosen[3] };
  for (const [pid, vId] of Object.entries(secondByPlayer)) {
    const expected = producingAdjacentCount(state, vId) + 1; // +1 quick bonus
    const total = Object.values(state.players[pid].resources).reduce((a, b) => a + b, 0);
    assert.equal(total, expected);
  }
});
