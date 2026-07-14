// SVG board renderer. Rebuilds the board from state each call (the board is small).
// Interaction is opt-in: pass `pick` (vertex/edge/hex ids to highlight) + callbacks,
// and only those targets become clickable. Optional hints (`recentEdge`, `recentVertex`,
// `movedRobber`, `producing`) drive one-shot animations.

import { PLAYER_COLORS, PIPS, RED_TOKENS, TERRAIN_RESOURCE } from '../engine/constants.js';

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
const lerp = (a, b, t) => a + (b - a) * t;

/** Reusable gradients + shadow filters. */
function defs() {
  const d = el('defs');
  d.innerHTML = `
    <radialGradient id="seaGrad" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="var(--sea)"/>
      <stop offset="100%" stop-color="var(--sea-2)"/>
    </radialGradient>
    <linearGradient id="hexBevel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.20"/>
    </linearGradient>
    <radialGradient id="tokenGrad" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="var(--token-fill)"/>
    </radialGradient>
    <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity="0.45"/>
    </filter>
    <filter id="frameShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.5"/>
    </filter>`;
  return d;
}

function buildingGlyph(x, y, type, color, isNew) {
  const s = type === 'city' ? 15 : 11;
  const g = el('g', { transform: `translate(${x} ${y})`, filter: 'url(#softShadow)' });
  const inner = el('g', { class: `piece piece--${type}${isNew ? ' piece--new' : ''}` });
  const stroke = { stroke: '#fff', 'stroke-width': 1.6, 'stroke-linejoin': 'round' };
  if (type === 'city') {
    inner.appendChild(el('rect', { x: -s, y: -s * 0.2, width: s * 1.5, height: s * 1.2, rx: 2.5, fill: color, ...stroke }));
    inner.appendChild(el('rect', { x: -s * 0.9, y: -s * 1.1, width: s * 0.8, height: s * 1.0, rx: 2, fill: color, ...stroke }));
    inner.appendChild(el('polygon', { points: `${-s * 0.9},${-s * 1.1} ${-s * 0.5},${-s * 1.7} ${-s * 0.1},${-s * 1.1}`, fill: color, ...stroke }));
  } else {
    inner.appendChild(el('rect', { x: -s, y: -s * 0.1, width: s * 2, height: s * 1.3, rx: 2.5, fill: color, ...stroke }));
    inner.appendChild(el('polygon', { points: `${-s * 1.15},${-s * 0.1} 0,${-s * 1.1} ${s * 1.15},${-s * 0.1}`, fill: color, ...stroke }));
  }
  g.appendChild(inner);
  return g;
}

function robberGlyph(x, y, moved) {
  const g = el('g', { transform: `translate(${x} ${y})`, filter: 'url(#softShadow)' });
  const inner = el('g', { class: `robber-inner${moved ? ' robber--moved' : ''}` });
  inner.appendChild(el('ellipse', { cx: 0, cy: 15, rx: 12, ry: 4.5, fill: 'rgba(0,0,0,.35)' }));
  inner.appendChild(el('path', {
    d: 'M0,-16 C7,-16 9,-8 6,-3 C12,0 12,12 0,12 C-12,12 -12,0 -6,-3 C-9,-8 -7,-16 0,-16 Z',
    fill: 'var(--robber)', stroke: '#f4ecd8', 'stroke-width': 1.6,
  }));
  g.appendChild(inner);
  return g;
}

export function renderBoard(svg, state, opts = {}) {
  const { pick = {}, onVertex, onEdge, onHex, recentEdge, recentVertex, movedRobber, producing = [] } = opts;
  const pickV = new Set(pick.vertices || []);
  const pickE = new Set(pick.edges || []);
  const pickH = new Set(pick.hexes || []);
  const producingSet = new Set(producing);
  const { hexes, vertices, edges, ports, robberHex } = state.board;

  const xs = vertices.map((v) => v.x); const ys = vertices.map((v) => v.y);
  const pad = 70;
  const minX = Math.min(...xs) - pad; const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const cx0 = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy0 = (Math.min(...ys) + Math.max(...ys)) / 2;

  svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Catan board. Robber on the ${hexes[robberHex].terrain}.`);
  svg.replaceChildren();
  svg.appendChild(defs());

  // Wooden frame + sea.
  svg.appendChild(el('rect', { x: minX + 6, y: minY + 6, width: w - 12, height: h - 12, rx: 34, fill: 'var(--board-frame)', filter: 'url(#frameShadow)' }));
  svg.appendChild(el('rect', { x: minX + 20, y: minY + 20, width: w - 40, height: h - 40, rx: 26, fill: 'url(#seaGrad)' }));

  // Ports (dock lines + badge).
  const portLayer = el('g', { class: 'ports' });
  for (const port of ports) {
    const [a, b] = port.vertices.map((id) => vertices[id]);
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
    let dx = mx - cx0; let dy = my - cy0; const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const bx = mx + dx * 33; const by = my + dy * 33;
    portLayer.appendChild(el('line', { x1: a.x, y1: a.y, x2: bx, y2: by, stroke: 'var(--port-fill)', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: .85 }));
    portLayer.appendChild(el('line', { x1: b.x, y1: b.y, x2: bx, y2: by, stroke: 'var(--port-fill)', 'stroke-width': 3.5, 'stroke-linecap': 'round', opacity: .85 }));
    portLayer.appendChild(el('circle', { cx: bx, cy: by, r: 17, fill: 'var(--port-fill)', stroke: 'var(--port-text)', 'stroke-width': 1.5, filter: 'url(#softShadow)' }));
    portLayer.appendChild(el('text', { x: bx, y: by + (port.type === '3:1' ? 4 : 6.5), 'text-anchor': 'middle', class: 'port-label', text: port.type === '3:1' ? '3:1' : '2:1' }));
    if (port.type !== '3:1') portLayer.appendChild(el('text', { x: bx, y: by - 5, 'text-anchor': 'middle', 'font-size': 12, text: RES_ICON[port.type] }));
  }
  svg.appendChild(portLayer);

  // Hexes.
  const hexLayer = el('g', { class: 'hexes' });
  for (const hex of hexes) {
    const pts = hex.vertices.map((id) => `${vertices[id].x},${vertices[id].y}`).join(' ');
    const g = el('g', { class: `hex-group${producingSet.has(hex.id) ? ' hex--producing' : ''}` });
    const res = TERRAIN_RESOURCE[hex.terrain];
    g.appendChild(el('title', { text: `${hex.terrain[0].toUpperCase() + hex.terrain.slice(1)}${res ? ` • produces ${res}` : ' • produces nothing'}${hex.token ? ` • rolls on ${hex.token}` : ''}` }));
    g.appendChild(el('polygon', { points: pts, class: `hex hex--${hex.terrain}`, stroke: 'var(--hex-stroke)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    g.appendChild(el('polygon', { points: pts, fill: 'url(#hexBevel)', 'pointer-events': 'none' }));
    if (hex.terrain !== 'desert') {
      g.appendChild(el('text', { x: hex.cx, y: hex.cy - 20, 'text-anchor': 'middle', class: 'terrain-icon', text: TERRAIN_ICON[hex.terrain] }));
    }
    if (hex.token) {
      const isRed = RED_TOKENS.includes(hex.token);
      const r = isRed ? 18.5 : 16.5; // hot numbers a touch bigger, like the real board
      const tg = el('g', { class: 'token', transform: `translate(${hex.cx} ${hex.cy + 8})`, filter: 'url(#softShadow)' });
      tg.appendChild(el('circle', { r, fill: 'url(#tokenGrad)', stroke: 'var(--token-stroke)', 'stroke-width': 1.5 }));
      tg.appendChild(el('text', { y: 1, 'text-anchor': 'middle', class: `token-num${isRed ? ' token-num--red' : ''}`, 'font-size': isRed ? 18 : 16, text: String(hex.token) }));
      const n = PIPS[hex.token]; const pipW = (n - 1) * 4;
      for (let i = 0; i < n; i++) tg.appendChild(el('circle', { cx: -pipW / 2 + i * 4, cy: r - 5, r: 1.4, class: `pip${isRed ? ' pip--red' : ''}` }));
      g.appendChild(tg);
    }
    hexLayer.appendChild(g);
  }
  svg.appendChild(hexLayer);

  svg.appendChild(robberGlyph(hexes[robberHex].cx, hexes[robberHex].cy - 2, movedRobber));

  // Built roads.
  const roadLayer = el('g', { class: 'roads' });
  for (const e of edges) {
    if (e.road === null) continue;
    const x1 = lerp(e.x1, e.x2, 0.16); const y1 = lerp(e.y1, e.y2, 0.16);
    const x2 = lerp(e.x1, e.x2, 0.84); const y2 = lerp(e.y1, e.y2, 0.84);
    const cls = e.id === recentEdge ? 'road--new' : '';
    roadLayer.appendChild(el('line', { x1, y1, x2, y2, class: cls, stroke: 'var(--road-outline)', 'stroke-width': 9.5, 'stroke-linecap': 'round' }));
    roadLayer.appendChild(el('line', { x1, y1, x2, y2, class: cls, stroke: colorHex(state.players[e.road].color), 'stroke-width': 6, 'stroke-linecap': 'round' }));
  }
  svg.appendChild(roadLayer);

  // Buildings.
  const buildLayer = el('g', { class: 'buildings' });
  for (const v of vertices) {
    if (!v.building) continue;
    buildLayer.appendChild(buildingGlyph(v.x, v.y, v.building.type, colorHex(state.players[v.building.player].color), v.id === recentVertex));
  }
  svg.appendChild(buildLayer);

  // Interaction overlays.
  const pickLayer = el('g', { class: 'pick-layer' });
  for (const eId of pickE) {
    const e = edges[eId];
    const x1 = lerp(e.x1, e.x2, 0.16); const y1 = lerp(e.y1, e.y2, 0.16);
    const x2 = lerp(e.x1, e.x2, 0.84); const y2 = lerp(e.y1, e.y2, 0.84);
    pickLayer.appendChild(el('line', { x1, y1, x2, y2, class: 'pick-edge', 'stroke-linecap': 'round', on: { click: () => onEdge && onEdge(eId) } }));
  }
  for (const vId of pickV) {
    const v = vertices[vId];
    pickLayer.appendChild(el('circle', { cx: v.x, cy: v.y, r: 11, class: 'pick-vertex', on: { click: () => onVertex && onVertex(vId) } }));
  }
  for (const hId of pickH) {
    const hex = hexes[hId];
    const pts = hex.vertices.map((id) => `${vertices[id].x},${vertices[id].y}`).join(' ');
    pickLayer.appendChild(el('polygon', { points: pts, class: 'pick-hex', on: { click: () => onHex && onHex(hId) } }));
  }
  svg.appendChild(pickLayer);
}
