import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  updateLongestRoad, updateLargestArmy, score, checkWin,
} from '../src/engine/awards.js';

/** Minimal controllable state for award logic. */
function fake({
  edgeList = [], roads = [], buildings = {}, knights = [0, 0], dev = [[], []],
  longestRoad = null, largestArmy = null, targetVP = 10, phase = 'main', current = 0,
} = {}) {
  const buildingVids = Object.keys(buildings).map(Number);
  const maxV = Math.max(-1, ...edgeList.flat(), ...buildingVids);
  const vertices = Array.from({ length: maxV + 1 }, (_, id) => ({
    id, building: buildings[id] ? { ...buildings[id] } : null,
  }));
  const edges = edgeList.map((vs, id) => ({ id, vertices: vs, road: roads[id] ?? null }));
  const players = [0, 1].map((id) => ({
    id, name: `P${id}`, playedKnights: knights[id],
    dev: dev[id].map((type) => ({ type })),
  }));
  return {
    board: { edges, vertices }, players, current, phase,
    config: { targetVP },
    awards: { longestRoad, longestRoadLen: 0, largestArmy, largestArmySize: 0 },
    log: [],
  };
}

const line = (n) => Array.from({ length: n }, (_, i) => [i, i + 1]);

test('first to a 5-road gets Longest Road worth 2 VP', () => {
  const s = fake({ edgeList: line(5), roads: Array(5).fill(0) });
  updateLongestRoad(s);
  assert.equal(s.awards.longestRoad, 0);
  assert.equal(score(s, 0), 2); // just the award (no buildings)
});

test('a strictly longer road steals it; an equal one does not', () => {
  // Player 0 holds LR with 5; player 1 builds 5 too -> no steal.
  let s = fake({
    edgeList: [...line(5), [10, 11], [11, 12], [12, 13], [13, 14], [14, 15]],
    roads: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    longestRoad: 0,
  });
  updateLongestRoad(s);
  assert.equal(s.awards.longestRoad, 0); // tie keeps holder

  // Now player 1 has 6 -> steals.
  s = fake({
    edgeList: [...line(5), [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16]],
    roads: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    longestRoad: 0,
  });
  updateLongestRoad(s);
  assert.equal(s.awards.longestRoad, 1);
});

test('Largest Army: first to 3 knights; a 4th by another steals it', () => {
  let s = fake({ knights: [3, 2] });
  updateLargestArmy(s);
  assert.equal(s.awards.largestArmy, 0);

  s = fake({ knights: [3, 4], largestArmy: 0 });
  updateLargestArmy(s);
  assert.equal(s.awards.largestArmy, 1);

  s = fake({ knights: [3, 3], largestArmy: 0 });
  updateLargestArmy(s);
  assert.equal(s.awards.largestArmy, 0); // tie keeps holder
});

test('score sums buildings, awards, and VP dev cards', () => {
  const s = fake({
    buildings: { 0: { type: 'settlement', player: 0 }, 1: { type: 'city', player: 0 } },
    dev: [['victoryPoint', 'victoryPoint'], []],
    longestRoad: 0, largestArmy: 0,
  });
  // 1 (settlement) + 2 (city) + 2 (LR) + 2 (LA) + 2 (VP cards) = 9
  assert.equal(score(s, 0), 9);
});

test('win only triggers on the current player’s turn', () => {
  const s = fake({
    buildings: {
      0: { type: 'city', player: 0 }, 1: { type: 'city', player: 0 },
      2: { type: 'city', player: 0 }, 3: { type: 'city', player: 0 },
    },
    dev: [['victoryPoint', 'victoryPoint'], []],
    current: 0, phase: 'main', targetVP: 10,
  });
  // Player 0: 4 cities (8) + 2 VP cards (2) = 10.
  checkWin(s);
  assert.equal(s.winner, 0);
  assert.equal(s.phase, 'gameOver');

  // Same standings but it's player 1's turn -> no win for 0.
  const s2 = fake({
    buildings: {
      0: { type: 'city', player: 0 }, 1: { type: 'city', player: 0 },
      2: { type: 'city', player: 0 }, 3: { type: 'city', player: 0 },
    },
    dev: [['victoryPoint', 'victoryPoint'], []],
    current: 1, phase: 'main', targetVP: 10,
  });
  checkWin(s2);
  assert.equal(s2.winner, undefined);
  assert.equal(s2.phase, 'main');
});
