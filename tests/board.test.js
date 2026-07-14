import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard, BEGINNER_LAYOUT } from '../src/engine/board.js';
import { createRng } from '../src/engine/rng.js';
import { TOKEN_MULTISET, RED_TOKENS } from '../src/engine/constants.js';

function board(mode = 'random', seed = 123) {
  return generateBoard({ mode, rng: createRng(seed) });
}

test('board has 19 hexes, 54 vertices, 72 edges, 9 ports', () => {
  const b = board();
  assert.equal(b.hexes.length, 19);
  assert.equal(b.vertices.length, 54);
  assert.equal(b.edges.length, 72);
  assert.equal(b.ports.length, 9);
});

test('desert has no token/resource; robber starts on desert', () => {
  const b = board();
  const desert = b.hexes.find((h) => h.terrain === 'desert');
  assert.equal(desert.token, null);
  assert.equal(desert.resource, null);
  assert.equal(b.robberHex, desert.id);
});

test('the 18 non-desert tokens match the multiset', () => {
  const b = board();
  const tokens = b.hexes.filter((h) => h.terrain !== 'desert').map((h) => h.token).sort((a, b) => a - b);
  assert.deepEqual(tokens, [...TOKEN_MULTISET].sort((a, b) => a - b));
});

test('every edge has 2 vertices; vertices touch 1-3 hexes and 2-3 edges; adjacency symmetric', () => {
  const b = board();
  for (const e of b.edges) {
    assert.equal(e.vertices.length, 2);
    assert.ok(e.hexes.length === 1 || e.hexes.length === 2);
  }
  for (const v of b.vertices) {
    assert.ok(v.hexes.length >= 1 && v.hexes.length <= 3);
    assert.ok(v.edges.length >= 2 && v.edges.length <= 3);
    for (const a of v.adj) assert.ok(b.vertices[a].adj.includes(v.id));
  }
});

test('coastal ring has 30 edges (perimeter)', () => {
  const b = board();
  const coastal = b.edges.filter((e) => e.hexes.length === 1);
  assert.equal(coastal.length, 30);
});

test('random mode (fixed seed): no two red tokens on adjacent hexes', () => {
  for (const seed of [1, 2, 3, 42, 777, 9999]) {
    const b = board('random', seed);
    for (const h of b.hexes) {
      if (RED_TOKENS.includes(h.token)) {
        for (const nId of h.neighbors) {
          assert.ok(!RED_TOKENS.includes(b.hexes[nId].token),
            `red ${h.token} adjacent to red ${b.hexes[nId].token} (seed ${seed})`);
        }
      }
    }
  }
});

test('ports assigned to valid coastal edges; both endpoints get the port', () => {
  const b = board();
  const portTypes = b.ports.map((p) => p.type).sort();
  assert.equal(b.ports.length, 9);
  for (const p of b.ports) {
    assert.equal(p.vertices.length, 2);
    for (const v of p.vertices) assert.equal(b.vertices[v].port, p.id);
  }
  assert.equal(portTypes.filter((t) => t === '3:1').length, 4);
});

test('beginner mode matches the fixed layout (deterministic, valid multiset)', () => {
  const b1 = board('beginner', 1);
  const b2 = board('beginner', 2);
  b1.hexes.forEach((h, i) => {
    assert.equal(h.terrain, BEGINNER_LAYOUT[i].terrain);
    assert.equal(h.token, BEGINNER_LAYOUT[i].token);
  });
  // Independent of seed for terrain/tokens.
  b2.hexes.forEach((h, i) => assert.equal(h.terrain, BEGINNER_LAYOUT[i].terrain));
  const tokens = b1.hexes.filter((h) => h.token != null).map((h) => h.token).sort((a, b) => a - b);
  assert.deepEqual(tokens, [...TOKEN_MULTISET].sort((a, b) => a - b));
});
