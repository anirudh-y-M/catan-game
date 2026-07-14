// SVG board renderer. Rebuilds the board from state each call (the board is small).
// Interaction is opt-in: pass `pick` (vertex/edge/hex ids to highlight) + callbacks,
// and only those targets become clickable.

import { PLAYER_COLORS, PIPS, RED_TOKENS } from '../engine/constants.js';

const SVGNS = 'http://www.w3.org/2000/svg';

const TERRAIN_ICON = {
  forest: '🌲', pasture: '🐑', fields: '🌾', hills: '🧱', mountains: '⛰️', desert: '🏜️',
};
const RES_ICON = { brick: '🧱', lumber: '🌲', wool: '🐑', grain: '🌾', ore: '⛰️' };

const colorHex = (id) => (PLAYER_COLORS.find((c) => c.id === id) || {}).hex || '#999';

function el(tag, attrs = {}, kids = []) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'on') for (const [evt, fn] of Object.entries(v)) node.addEventListener(evt, fn);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid) node.appendChild(kid);
  return node;
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** House glyph (settlement) or church glyph (city) centred at (x,y), in player colour. */
function buildingGlyph(x, y, type, color) {
  const s = type === 'city' ? 15 : 11;
  const g = el('g', { class: `piece piece--${type}`, transform: `translate(${x} ${y})` });
  if (type === 'city') {
    // Body + tower.
    g.appendChild(el('rect', { x: -s, y: -s * 0.2, width: s * 1.5, height: s * 1.2, rx: 2, fill: color, stroke: 'var(--road-outline)', 'stroke-width': 1.5 }));
    g.appendChild(el('rect', { x: -s * 0.9, y: -s * 1.1, width: s * 0.8, height: s * 1.0, rx: 1.5, fill: color, stroke: 'var(--road-outline)', 'stroke-width': 1.5 }));
    g.appendChild(el('polygon', { points: `${-s * 0.9},${-s * 1.1} ${-s * 0.5},${-s * 1.7} ${-s * 0.1},${-s * 1.1}`, fill: color, stroke: 'var(--road-outline)', 'stroke-width': 1.5 }));
  } else {
    g.appendChild(el('rect', { x: -s, y: -s * 0.1, width: s * 2, height: s * 1.3, rx: 2, fill: color, stroke: 'var(--road-outline)', 'stroke-width': 1.5 }));
    g.appendChild(el('polygon', { points: `${-s * 1.15},${-s * 0.1} 0,${-s * 1.1} ${s * 1.15},${-s * 0.1}`, fill: color, stroke: 'var(--road-outline)', 'stroke-width': 1.5 }));
  }
  return g;
}

/** Robber pawn centred at (x, y). */
function robberGlyph(x, y) {
  const g = el('g', { class: 'robber', transform: `translate(${x} ${y})` });
  g.appendChild(el('ellipse', { cx: 0, cy: 14, rx: 13, ry: 6, fill: 'rgba(0,0,0,.3)' }));
  g.appendChild(el('path', {
    d: 'M0,-16 C7,-16 9,-8 6,-3 C12,0 12,12 0,12 C-12,12 -12,0 -6,-3 C-9,-8 -7,-16 0,-16 Z',
    fill: 'var(--robber)', stroke: '#f2e9d8', 'stroke-width': 1.5,
  }));
  return g;
}

export function renderBoard(svg, state, opts = {}) {
  const { pick = {}, onVertex, onEdge, onHex } = opts;
  const pickV = new Set(pick.vertices || []);
  const pickE = new Set(pick.edges || []);
  const pickH = new Set(pick.hexes || []);
  const { hexes, vertices, edges, ports, robberHex } = state.board;

  const xs = vertices.map((v) => v.x); const ys = vertices.map((v) => v.y);
  const pad = 66;
  const minX = Math.min(...xs) - pad; const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const cx0 = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy0 = (Math.min(...ys) + Math.max(...ys)) / 2;

  svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Catan board. Robber on the ${hexes[robberHex].terrain}.`);
  svg.replaceChildren();

  // Sea background.
  svg.appendChild(el('rect', { x: minX, y: minY, width: w, height: h, rx: 28, fill: 'var(--sea)' }));

  // Ports (dock lines + badge).
  const portLayer = el('g', { class: 'ports' });
  for (const port of ports) {
    const [a, b] = port.vertices.map((id) => vertices[id]);
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
    let dx = mx - cx0; let dy = my - cy0; const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const bx = mx + dx * 34; const by = my + dy * 34;
    portLayer.appendChild(el('line', { x1: a.x, y1: a.y, x2: bx, y2: by, stroke: 'var(--port-fill)', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .8 }));
    portLayer.appendChild(el('line', { x1: b.x, y1: b.y, x2: bx, y2: by, stroke: 'var(--port-fill)', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .8 }));
    portLayer.appendChild(el('circle', { cx: bx, cy: by, r: 17, fill: 'var(--port-fill)', stroke: 'var(--port-text)', 'stroke-width': 1.5 }));
    const label = port.type === '3:1' ? '3:1' : '2:1';
    portLayer.appendChild(el('text', { x: bx, y: by + (port.type === '3:1' ? 4 : 6), 'text-anchor': 'middle', class: 'port-label', text: label }));
    if (port.type !== '3:1') {
      portLayer.appendChild(el('text', { x: bx, y: by - 5, 'text-anchor': 'middle', 'font-size': 12, text: RES_ICON[port.type] }));
    }
  }
  svg.appendChild(portLayer);

  // Hexes.
  const hexLayer = el('g', { class: 'hexes' });
  for (const hex of hexes) {
    const pts = hex.vertices.map((id) => `${vertices[id].x},${vertices[id].y}`).join(' ');
    hexLayer.appendChild(el('polygon', {
      points: pts, class: `hex hex--${hex.terrain}`,
      stroke: 'var(--hex-stroke)', 'stroke-width': 2, 'stroke-linejoin': 'round',
    }));
    if (hex.terrain !== 'desert') {
      hexLayer.appendChild(el('text', {
        x: hex.cx, y: hex.cy - (hex.token ? 20 : 6), 'text-anchor': 'middle',
        class: 'terrain-icon', text: TERRAIN_ICON[hex.terrain],
      }));
    }
    if (hex.token) {
      const isRed = RED_TOKENS.includes(hex.token);
      const g = el('g', { class: 'token', transform: `translate(${hex.cx} ${hex.cy + 8})` });
      g.appendChild(el('circle', { r: 17, class: 'token-bg' }));
      g.appendChild(el('text', { y: 1, 'text-anchor': 'middle', class: `token-num${isRed ? ' token-num--red' : ''}`, text: String(hex.token) }));
      const n = PIPS[hex.token];
      const pipW = (n - 1) * 4;
      for (let i = 0; i < n; i++) {
        g.appendChild(el('circle', { cx: -pipW / 2 + i * 4, cy: 11, r: 1.3, class: `pip${isRed ? ' pip--red' : ''}` }));
      }
      hexLayer.appendChild(g);
    }
  }
  svg.appendChild(hexLayer);

  // Robber.
  const rhex = hexes[robberHex];
  svg.appendChild(robberGlyph(rhex.cx, rhex.cy - 2));

  // Built roads.
  const roadLayer = el('g', { class: 'roads' });
  for (const e of edges) {
    if (e.road === null) continue;
    const x1 = lerp(e.x1, e.x2, 0.16); const y1 = lerp(e.y1, e.y2, 0.16);
    const x2 = lerp(e.x1, e.x2, 0.84); const y2 = lerp(e.y1, e.y2, 0.84);
    roadLayer.appendChild(el('line', { x1, y1, x2, y2, stroke: 'var(--road-outline)', 'stroke-width': 9, 'stroke-linecap': 'round' }));
    roadLayer.appendChild(el('line', { x1, y1, x2, y2, stroke: colorHex(state.players[e.road].color), 'stroke-width': 6, 'stroke-linecap': 'round' }));
  }
  svg.appendChild(roadLayer);

  // Buildings.
  const buildLayer = el('g', { class: 'buildings' });
  for (const v of vertices) {
    if (!v.building) continue;
    buildLayer.appendChild(buildingGlyph(v.x, v.y, v.building.type, colorHex(state.players[v.building.player].color)));
  }
  svg.appendChild(buildLayer);

  // ---- Interaction overlays ----
  const pickLayer = el('g', { class: 'pick-layer' });
  for (const eId of pickE) {
    const e = edges[eId];
    const x1 = lerp(e.x1, e.x2, 0.16); const y1 = lerp(e.y1, e.y2, 0.16);
    const x2 = lerp(e.x1, e.x2, 0.84); const y2 = lerp(e.y1, e.y2, 0.84);
    pickLayer.appendChild(el('line', {
      x1, y1, x2, y2, class: 'pick-edge', 'stroke-linecap': 'round',
      on: { click: () => onEdge && onEdge(eId) },
    }));
  }
  for (const vId of pickV) {
    const v = vertices[vId];
    pickLayer.appendChild(el('circle', {
      cx: v.x, cy: v.y, r: 11, class: 'pick-vertex',
      on: { click: () => onVertex && onVertex(vId) },
    }));
  }
  for (const hId of pickH) {
    const hex = hexes[hId];
    const pts = hex.vertices.map((id) => `${vertices[id].x},${vertices[id].y}`).join(' ');
    pickLayer.appendChild(el('polygon', {
      points: pts, class: 'pick-hex',
      on: { click: () => onHex && onHex(hId) },
    }));
  }
  svg.appendChild(pickLayer);
}
