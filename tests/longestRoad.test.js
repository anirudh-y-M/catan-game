import { test } from 'node:test';
import assert from 'node:assert/strict';
import { longestRoadLength } from '../src/engine/longestRoad.js';

/** Build a synthetic board from an edge list; `buildings` maps vertexId -> playerId. */
function fakeState(edgeList, roads, buildings = {}) {
  const maxV = Math.max(...edgeList.flat());
  const vertices = Array.from({ length: maxV + 1 }, (_, id) => ({
    id,
    building: buildings[id] != null ? { type: 'settlement', player: buildings[id] } : null,
  }));
  const edges = edgeList.map((vs, id) => ({ id, vertices: vs, road: roads[id] ?? null }));
  return { board: { edges, vertices } };
}

test('straight line of 5 roads -> 5', () => {
  const s = fakeState(
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    [0, 0, 0, 0, 0],
  );
  assert.equal(longestRoadLength(s, 0), 5);
});

test('a fork counts the two longest arms combined, not a stub', () => {
  // Center 0: arm A 0-1-2-3 (3), arm B 0-4-5 (2), stub 0-6 (1).
  const s = fakeState(
    [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [0, 6]],
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(longestRoadLength(s, 0), 5); // 3 + 2 through the fork
});

test('an opponent building mid-path splits the count', () => {
  const s = fakeState(
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    [0, 0, 0, 0, 0],
    { 3: 1 }, // opponent settlement at vertex 3
  );
  assert.equal(longestRoadLength(s, 0), 3); // longer segment (0-1-2-3)
});

test('a loop of 6 roads -> 6', () => {
  const s = fakeState(
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(longestRoadLength(s, 0), 6);
});

test('only the queried player’s roads count', () => {
  const s = fakeState(
    [[0, 1], [1, 2], [2, 3], [3, 4]],
    [0, 0, 1, 1],
  );
  assert.equal(longestRoadLength(s, 0), 2);
  assert.equal(longestRoadLength(s, 1), 2);
});
