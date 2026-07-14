import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/engine/constants.js';

test('terrain counts sum to 19 land hexes', () => {
  const total = Object.values(C.TERRAIN_COUNTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 19);
  assert.equal(C.TERRAIN_COUNTS.desert, 1);
});

test('every terrain maps to a resource except desert', () => {
  for (const terrain of Object.keys(C.TERRAIN_COUNTS)) {
    if (terrain === 'desert') {
      assert.equal(C.TERRAIN_RESOURCE[terrain], null);
    } else {
      assert.ok(C.RESOURCES.includes(C.TERRAIN_RESOURCE[terrain]));
    }
  }
});

test('token multiset has 18 tokens with correct distribution', () => {
  assert.equal(C.TOKEN_MULTISET.length, 18);
  const count = (n) => C.TOKEN_MULTISET.filter((t) => t === n).length;
  assert.equal(count(2), 1);
  assert.equal(count(12), 1);
  assert.equal(count(6), 2);
  assert.equal(count(8), 2);
  for (const n of [3, 4, 5, 9, 10, 11]) assert.equal(count(n), 2);
  assert.ok(!C.TOKEN_MULTISET.includes(7));
});

test('red tokens are 6 and 8 with 5 pips each', () => {
  assert.deepEqual([...C.RED_TOKENS].sort((a, b) => a - b), [6, 8]);
  assert.equal(C.PIPS[6], 5);
  assert.equal(C.PIPS[8], 5);
  assert.equal(C.PIPS[2], 1);
});

test('dev deck composition sums to 25', () => {
  const total = Object.values(C.DEV_DECK_COUNTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 25);
  assert.equal(C.DEV_DECK_COUNTS.knight, 14);
  assert.equal(C.DEV_DECK_COUNTS.victoryPoint, 5);
});

test('port types: 9 harbors, four generic 3:1, one 2:1 per resource', () => {
  assert.equal(C.PORT_TYPES.length, 9);
  assert.equal(C.PORT_TYPES.filter((p) => p === '3:1').length, 4);
  for (const r of C.RESOURCES) {
    assert.equal(C.PORT_TYPES.filter((p) => p === r).length, 1);
  }
});

test('costs, piece limits, VP values, and variant targets', () => {
  assert.deepEqual(C.COSTS.city, { ore: 3, grain: 2 });
  assert.deepEqual(C.PIECE_LIMITS, { settlements: 5, cities: 4, roads: 15 });
  assert.equal(C.VP.city, 2);
  assert.equal(C.TARGET_VP.standard, 10);
  assert.equal(C.TARGET_VP.quick, 8);
  assert.equal(C.PLAYER_COLORS.length, 4);
});
