import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import '../src/engine/production.js';
import '../src/engine/building.js';
import {
  legalSetupSettlementVertices, legalSetupRoadEdges, legalRoadEdges, distanceRuleOk,
} from '../src/engine/rules.js';

/** Create a 2-player game, run a legal setup, and enter the build phase for player 0. */
function mainPhaseGame(seed = 1, extra = {}) {
  let s = createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed, ...extra,
  });
  while (s.phase === 'setup') {
    const vId = legalSetupSettlementVertices(s)[0];
    s = applyAction(s, { type: 'placeSetupSettlement', vId });
    const eId = legalSetupRoadEdges(s, vId)[0];
    s = applyAction(s, { type: 'placeSetupRoad', eId });
  }
  s.phase = 'main'; // s.current is the starting player (0)
  return s;
}

const give = (p, res) => { p.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, ...res }; };

test('buildRoad pays the bank, decrements supply, places the road', () => {
  const s = mainPhaseGame(1);
  give(s.players[0], { brick: 1, lumber: 1 });
  const eId = legalRoadEdges(s, 0)[0];
  const bankBrick = s.bank.brick;
  const next = applyAction(s, { type: 'buildRoad', eId });
  assert.equal(next.board.edges[eId].road, 0);
  assert.equal(next.players[0].pieces.roads, 12); // 15 - 2 (setup) - 1
  assert.equal(next.players[0].resources.brick, 0);
  assert.equal(next.bank.brick, bankBrick + 1);
});

test('buildRoad throws when unaffordable or out of supply', () => {
  const s = mainPhaseGame(1);
  const eId = legalRoadEdges(s, 0)[0];
  assert.throws(() => applyAction(s, { type: 'buildRoad', eId })); // no resources

  give(s.players[0], { brick: 1, lumber: 1 });
  s.players[0].pieces.roads = 0;
  assert.throws(() => applyAction(s, { type: 'buildRoad', eId })); // no supply
});

test('buildSettlement places a settlement on a connected, distance-legal site', () => {
  const s = mainPhaseGame(2);
  // Find a distance-legal empty vertex and give player 0 a road into it.
  const v = s.board.vertices.find((x) => x.building === null && distanceRuleOk(s, x.id));
  s.board.edges[v.edges[0]].road = 0;
  give(s.players[0], { brick: 1, lumber: 1, wool: 1, grain: 1 });

  const next = applyAction(s, { type: 'buildSettlement', vId: v.id });
  assert.deepEqual(next.board.vertices[v.id].building, { type: 'settlement', player: 0 });
  assert.equal(next.players[0].pieces.settlements, 2); // 5 - 2 (setup) - 1
  assert.equal(Object.values(next.players[0].resources).reduce((a, b) => a + b, 0), 0);
});

test('buildCity upgrades an own settlement and returns it to supply', () => {
  const s = mainPhaseGame(3);
  const myVertex = s.board.vertices.find((v) => v.building && v.building.player === 0).id;
  give(s.players[0], { ore: 3, grain: 2 });

  const next = applyAction(s, { type: 'buildCity', vId: myVertex });
  assert.equal(next.board.vertices[myVertex].building.type, 'city');
  assert.equal(next.players[0].pieces.cities, 3); // 4 - 1
  assert.equal(next.players[0].pieces.settlements, 4); // 3 after setup, +1 returned
  assert.equal(next.players[0].resources.ore, 0);
});

test('permanent settlements: upgrading to a city does NOT return the settlement piece', () => {
  const s = mainPhaseGame(3, { permanentSettlements: true });
  const myVertex = s.board.vertices.find((v) => v.building && v.building.player === 0).id;
  give(s.players[0], { ore: 3, grain: 2 });
  const before = s.players[0].pieces.settlements; // 3 remaining after setup

  const next = applyAction(s, { type: 'buildCity', vId: myVertex });
  assert.equal(next.board.vertices[myVertex].building.type, 'city');
  assert.equal(next.players[0].pieces.cities, 3);
  assert.equal(next.players[0].pieces.settlements, before); // unchanged — piece is spent for good
});
