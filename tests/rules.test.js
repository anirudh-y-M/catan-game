import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import {
  canAfford, distanceRuleOk, canBuildSettlement, canBuildCity,
  canBuildRoad, portRate,
} from '../src/engine/rules.js';

function game() {
  return createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed: 7,
  });
}

// Direct board manipulation helpers (actions come later; rules read the board).
const setBuilding = (s, vId, type, player) => { s.board.vertices[vId].building = { type, player }; };
const setRoad = (s, eId, player) => { s.board.edges[eId].road = player; };

test('canAfford checks each resource', () => {
  const s = game();
  const p = s.players[0];
  p.resources = { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 };
  assert.equal(canAfford(p, { brick: 1, lumber: 1 }), true);
  assert.equal(canAfford(p, { brick: 1, lumber: 1, wool: 1, grain: 1 }), false);
});

test('distance rule blocks adjacent sites, allows far ones', () => {
  const s = game();
  const v = s.board.vertices[0];
  setBuilding(s, 0, 'settlement', 0);
  // A neighbour of v0 is now illegal:
  const neighbour = v.adj[0];
  assert.equal(distanceRuleOk(s, neighbour), false);
  // Some vertex not adjacent to v0 remains legal:
  const far = s.board.vertices.find(
    (x) => x.id !== 0 && !v.adj.includes(x.id) && x.building === null,
  );
  assert.equal(distanceRuleOk(s, far.id), true);
});

test('build-phase settlement requires a connecting own road', () => {
  const s = game();
  // Pick a vertex whose distance rule is clear.
  const vId = 20;
  assert.equal(canBuildSettlement(s, 0, vId), false); // no road yet
  setRoad(s, s.board.vertices[vId].edges[0], 0);
  assert.equal(canBuildSettlement(s, 0, vId), true);
});

test('city only upgrades own settlement', () => {
  const s = game();
  setBuilding(s, 5, 'settlement', 0);
  assert.equal(canBuildCity(s, 0, 5), true);
  assert.equal(canBuildCity(s, 1, 5), false); // not owner
  assert.equal(canBuildCity(s, 0, 6), false); // empty
});

test('road connectivity: needs own network, empty edge, not through opponent', () => {
  const s = game();
  const e = s.board.edges[10];
  const [va, vb] = e.vertices;

  assert.equal(canBuildRoad(s, 0, 10), false); // unconnected

  // Give player 0 a road adjacent at va -> now connectable.
  const otherEdgeAtVa = s.board.vertices[va].edges.find((id) => id !== 10);
  setRoad(s, otherEdgeAtVa, 0);
  assert.equal(canBuildRoad(s, 0, 10), true);

  // Occupy the edge -> not buildable.
  setRoad(s, 10, 1);
  assert.equal(canBuildRoad(s, 0, 10), false);
  setRoad(s, 10, null);

  // Opponent building sitting on va blocks extension through va;
  // but if the only connection was via va, it's now blocked.
  setBuilding(s, va, 'settlement', 1);
  // Remove the vb-side connections to isolate the va case:
  for (const id of s.board.vertices[vb].edges) if (id !== 10) setRoad(s, id, null);
  assert.equal(canBuildRoad(s, 0, 10), false);
});

test('portRate: 2 for matching special port, 3 for generic, else 4', () => {
  const s = game();
  const generic = s.board.ports.find((p) => p.type === '3:1');
  const special = s.board.ports.find((p) => p.type !== '3:1');

  assert.equal(portRate(s, 0, 'brick'), 4); // no port buildings yet

  setBuilding(s, generic.vertices[0], 'settlement', 0);
  assert.equal(portRate(s, 0, 'brick'), 3);

  setBuilding(s, special.vertices[0], 'settlement', 0);
  assert.equal(portRate(s, 0, special.type), 2);
  // A non-matching resource still only gets the generic 3:1.
  const other = ['brick', 'lumber', 'wool', 'grain', 'ore'].find((r) => r !== special.type);
  assert.equal(portRate(s, 0, other), 3);
});
