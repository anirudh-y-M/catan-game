// Board generation: a radius-2 axial hex grid (19 hexes) from which we derive the
// 54 vertices (settlement/city sites), 72 edges (road paths), and 9 harbors, plus
// full adjacency. Pointy-top layout renders as the classic 3-4-5-4-3 rows.
//
// Pixel coordinates are baked in at SIZE=60 purely so the UI can draw directly; all
// game logic uses ids + adjacency and is orientation-independent.

import {
  TERRAIN_COUNTS,
  TERRAIN_RESOURCE,
  TOKEN_MULTISET,
  RED_TOKENS,
  PORT_TYPES,
} from './constants.js';

const SIZE = 60;
const SQRT3 = Math.sqrt(3);

/** A standard, balanced fixed layout for "beginner" mode (row-major, 3-4-5-4-3). */
export const BEGINNER_LAYOUT = [
  // top row (3)
  { terrain: 'mountains', token: 10 }, { terrain: 'pasture', token: 2 }, { terrain: 'forest', token: 9 },
  // row 2 (4)
  { terrain: 'fields', token: 12 }, { terrain: 'hills', token: 6 }, { terrain: 'pasture', token: 4 }, { terrain: 'hills', token: 10 },
  // middle row (5)
  { terrain: 'fields', token: 9 }, { terrain: 'forest', token: 11 }, { terrain: 'desert', token: null }, { terrain: 'forest', token: 3 }, { terrain: 'mountains', token: 8 },
  // row 4 (4)
  { terrain: 'forest', token: 8 }, { terrain: 'mountains', token: 3 }, { terrain: 'fields', token: 4 }, { terrain: 'pasture', token: 5 },
  // bottom row (3)
  { terrain: 'hills', token: 5 }, { terrain: 'fields', token: 6 }, { terrain: 'pasture', token: 11 },
];

/** Axial coords of the 19 hexes, row-major (top→bottom, left→right). */
function axialCoords() {
  const coords = [];
  for (let r = -2; r <= 2; r++) {
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) <= 2) coords.push({ q, r });
    }
  }
  return coords; // 19 in the 3-4-5-4-3 row order
}

function hexCenter(q, r) {
  return { x: SIZE * SQRT3 * (q + r / 2), y: SIZE * 1.5 * r };
}

function hexCorner(cx, cy, i) {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return { x: cx + SIZE * Math.cos(angle), y: cy + SIZE * Math.sin(angle) };
}

const key = (p) => `${Math.round(p.x * 100)}:${Math.round(p.y * 100)}`;

/**
 * Build the raw geometry: hexes, deduped vertices & edges, and full adjacency.
 * @returns {{hexes, vertices, edges}}
 */
function buildGeometry() {
  const coords = axialCoords();
  const vertexByKey = new Map();
  const edgeByKey = new Map();
  const vertices = [];
  const edges = [];

  const getVertex = (p) => {
    const k = key(p);
    if (vertexByKey.has(k)) return vertexByKey.get(k);
    const v = {
      id: vertices.length,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      hexes: [],
      edges: [],
      adj: [],
      port: null,
      building: null,
    };
    vertices.push(v);
    vertexByKey.set(k, v);
    return v;
  };

  const getEdge = (va, vb) => {
    const k = [va.id, vb.id].sort((a, b) => a - b).join('-');
    if (edgeByKey.has(k)) return edgeByKey.get(k);
    const e = {
      id: edges.length,
      x1: va.x, y1: va.y, x2: vb.x, y2: vb.y,
      vertices: [va.id, vb.id],
      hexes: [],
      road: null,
    };
    edges.push(e);
    edgeByKey.set(k, e);
    return e;
  };

  const hexes = coords.map(({ q, r }, id) => {
    const c = hexCenter(q, r);
    const corners = Array.from({ length: 6 }, (_, i) => getVertex(hexCorner(c.x, c.y, i)));
    const hex = {
      id,
      q,
      r,
      cx: Math.round(c.x * 100) / 100,
      cy: Math.round(c.y * 100) / 100,
      terrain: null,
      resource: null,
      token: null,
      vertices: corners.map((v) => v.id),
      edges: [],
      neighbors: [],
    };
    for (let i = 0; i < 6; i++) {
      const e = getEdge(corners[i], corners[(i + 1) % 6]);
      hex.edges.push(e.id);
      if (!e.hexes.includes(id)) e.hexes.push(id);
    }
    for (const v of corners) if (!v.hexes.includes(id)) v.hexes.push(id);
    return hex;
  });

  // Vertex incident edges + adjacency, from the deduped edge set.
  for (const e of edges) {
    const [a, b] = e.vertices;
    if (!vertices[a].edges.includes(e.id)) vertices[a].edges.push(e.id);
    if (!vertices[b].edges.includes(e.id)) vertices[b].edges.push(e.id);
    if (!vertices[a].adj.includes(b)) vertices[a].adj.push(b);
    if (!vertices[b].adj.includes(a)) vertices[b].adj.push(a);
  }

  // Hex neighbours: two hexes are adjacent iff they share an edge.
  for (const e of edges) {
    if (e.hexes.length === 2) {
      const [h1, h2] = e.hexes;
      if (!hexes[h1].neighbors.includes(h2)) hexes[h1].neighbors.push(h2);
      if (!hexes[h2].neighbors.includes(h1)) hexes[h2].neighbors.push(h1);
    }
  }

  return { hexes, vertices, edges };
}

/** Walk the coastal ring, returning ordered coastal edge ids. */
function orderedCoastalRing(edges) {
  const coastal = edges.filter((e) => e.hexes.length === 1);
  const byVertex = new Map();
  for (const e of coastal) {
    for (const v of e.vertices) {
      if (!byVertex.has(v)) byVertex.set(v, []);
      byVertex.get(v).push(e.id);
    }
  }
  const ring = [];
  const start = coastal[0];
  let prevVertex = start.vertices[0];
  let cur = start;
  do {
    ring.push(cur.id);
    const next = cur.vertices[0] === prevVertex ? cur.vertices[1] : cur.vertices[0];
    const [e1, e2] = byVertex.get(next);
    const nextId = e1 === cur.id ? e2 : e1;
    prevVertex = next;
    cur = edges[nextId];
  } while (cur.id !== start.id);
  return ring;
}

function assignTerrainRandom(hexes, rng) {
  const bag = [];
  for (const [terrain, n] of Object.entries(TERRAIN_COUNTS)) {
    for (let i = 0; i < n; i++) bag.push(terrain);
  }
  const shuffled = rng.shuffle(bag);
  hexes.forEach((h, i) => {
    h.terrain = shuffled[i];
    h.resource = TERRAIN_RESOURCE[h.terrain];
  });
}

function assignTokensRandom(hexes, rng) {
  const nonDesert = hexes.filter((h) => h.terrain !== 'desert');
  const isRed = (t) => RED_TOKENS.includes(t);
  for (let attempt = 0; attempt < 200; attempt++) {
    const tokens = rng.shuffle(TOKEN_MULTISET);
    nonDesert.forEach((h, i) => { h.token = tokens[i]; });
    const ok = hexes.every((h) =>
      !isRed(h.token) ||
      h.neighbors.every((nId) => !isRed(hexes[nId].token)));
    if (ok) return;
  }
  // Extremely unlikely fallback: leave last assignment (still a valid multiset).
}

function applyBeginnerLayout(hexes) {
  hexes.forEach((h, i) => {
    h.terrain = BEGINNER_LAYOUT[i].terrain;
    h.resource = TERRAIN_RESOURCE[h.terrain];
    h.token = BEGINNER_LAYOUT[i].token;
  });
}

function placePorts(vertices, edges, rng) {
  const ring = orderedCoastalRing(edges);
  const types = rng.shuffle(PORT_TYPES);
  const ports = [];
  for (let i = 0; i < 9; i++) {
    const edgeId = ring[Math.round((i * ring.length) / 9) % ring.length];
    const edge = edges[edgeId];
    const port = { id: ports.length, type: types[i], edge: edgeId, vertices: [...edge.vertices] };
    ports.push(port);
    for (const v of edge.vertices) vertices[v].port = port.id;
  }
  return ports;
}

/**
 * Generate a full board.
 * @param {{mode:'random'|'beginner', rng}} opts
 * @returns {{hexes, vertices, edges, ports, robberHex}}
 */
export function generateBoard({ mode = 'random', rng }) {
  const { hexes, vertices, edges } = buildGeometry();

  if (mode === 'beginner') {
    applyBeginnerLayout(hexes);
  } else {
    assignTerrainRandom(hexes, rng);
    assignTokensRandom(hexes, rng);
  }

  const ports = placePorts(vertices, edges, rng);
  const robberHex = hexes.find((h) => h.terrain === 'desert').id;

  return { hexes, vertices, edges, ports, robberHex };
}
