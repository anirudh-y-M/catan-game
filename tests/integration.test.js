import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, canAfford, portRate, score,
  legalSetupSettlementVertices, legalSetupRoadEdges,
  legalSettlementVertices, legalRoadEdges, longestRoadLength,
} from '../src/engine/index.js';
import { COSTS, RESOURCES, BANK_PER_RESOURCE } from '../src/engine/constants.js';

const handTotal = (p) => RESOURCES.reduce((a, r) => a + p.resources[r], 0);

function runSetup(s) {
  while (s.phase === 'setup') {
    const vId = legalSetupSettlementVertices(s)[0];
    s = applyAction(s, { type: 'placeSetupSettlement', vId });
    const eId = legalSetupRoadEdges(s, vId)[0];
    s = applyAction(s, { type: 'placeSetupRoad', eId });
  }
  return s;
}

function resolveRobber(s) {
  while (['discard', 'moveRobber', 'steal'].includes(s.phase)) {
    if (s.phase === 'discard') {
      const pid = s.pendingDiscards[0];
      const p = s.players[pid];
      let need = Math.floor(handTotal(p) / 2);
      const cards = {};
      for (const r of RESOURCES) {
        if (need <= 0) break;
        const take = Math.min(need, p.resources[r]);
        if (take > 0) { cards[r] = take; need -= take; }
      }
      s = applyAction(s, { type: 'discard', playerId: pid, cards });
    } else if (s.phase === 'moveRobber') {
      const target = s.board.hexes.find((h) => h.id !== s.board.robberHex);
      s = applyAction(s, { type: 'moveRobber', hexId: target.id });
    } else {
      s = applyAction(s, { type: 'steal', targetPlayerId: s.stealCandidates[0] });
    }
  }
  return s;
}

/** Bank-trade surplus toward affording `cost`; returns the (possibly new) state. */
function tradeToward(s, cost) {
  let guard = 0;
  while (!canAfford(s.players[s.current], cost) && guard++ < 40) {
    const p = s.players[s.current];
    const short = RESOURCES.find((r) => p.resources[r] < (cost[r] || 0));
    if (!short) break;
    const donor = RESOURCES.find((r) => {
      if (r === short) return false;
      const rate = portRate(s, p.id, r);
      return p.resources[r] - (cost[r] || 0) >= rate;
    });
    if (!donor) break;
    s = applyAction(s, { type: 'bankTrade', give: donor, get: short });
  }
  return s;
}

function botTurn(s) {
  if (s.phase === 'roll') s = applyAction(s, { type: 'rollDice' });
  s = resolveRobber(s);

  let guard = 0;
  while (s.phase === 'main' && guard++ < 30) {
    const pid = s.current;
    const mySettlement = s.board.vertices.find(
      (v) => v.building && v.building.player === pid && v.building.type === 'settlement');

    if (mySettlement && s.players[pid].pieces.cities > 0) {
      s = tradeToward(s, COSTS.city);
      if (canAfford(s.players[pid], COSTS.city)) { s = applyAction(s, { type: 'buildCity', vId: mySettlement.id }); continue; }
    }
    const spot = legalSettlementVertices(s, pid)[0];
    if (spot != null && s.players[pid].pieces.settlements > 0) {
      s = tradeToward(s, COSTS.settlement);
      if (canAfford(s.players[pid], COSTS.settlement)) { s = applyAction(s, { type: 'buildSettlement', vId: spot }); continue; }
    }
    const edge = legalRoadEdges(s, pid)[0];
    if (edge != null && s.players[pid].pieces.roads > 0) {
      s = tradeToward(s, COSTS.road);
      if (canAfford(s.players[pid], COSTS.road)) { s = applyAction(s, { type: 'buildRoad', eId: edge }); continue; }
    }
    if (s.devDeck.length > 0) {
      s = tradeToward(s, COSTS.devCard);
      if (canAfford(s.players[pid], COSTS.devCard)) { s = applyAction(s, { type: 'buyDevCard' }); continue; }
    }
    break; // nothing affordable this turn
  }
  if (s.phase === 'main') s = applyAction(s, { type: 'endTurn' });
  return s;
}

test('a full seeded 2-player game reaches a legitimate win with conserved cards/pieces', () => {
  let s = runSetup(createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed: 20240714,
  }));

  let turns = 0;
  while (s.phase !== 'gameOver' && turns++ < 3000) s = botTurn(s);

  assert.equal(s.phase, 'gameOver', 'game should end in a win');
  assert.ok(s.winner === 0 || s.winner === 1);
  assert.ok(score(s, s.winner) >= s.config.targetVP);

  // Resource-card conservation: hands + bank == 95.
  const cardsInHands = s.players.reduce((a, p) => a + handTotal(p), 0);
  const cardsInBank = RESOURCES.reduce((a, r) => a + s.bank[r], 0);
  assert.equal(cardsInHands + cardsInBank, BANK_PER_RESOURCE * RESOURCES.length);

  // Dev-card conservation: drawn + remaining == 25.
  const devDrawn = s.players.reduce((a, p) => a + p.dev.length, 0);
  assert.equal(devDrawn + s.devDeck.length, 25);

  // Piece conservation per player: on-board + supply equals the starting supply.
  for (const p of s.players) {
    const built = { settlements: 0, cities: 0, roads: 0 };
    for (const v of s.board.vertices) {
      if (v.building && v.building.player === p.id) {
        built[v.building.type === 'city' ? 'cities' : 'settlements'] += 1;
      }
    }
    for (const e of s.board.edges) if (e.road === p.id) built.roads += 1;
    assert.equal(built.settlements + p.pieces.settlements, 5);
    assert.equal(built.cities + p.pieces.cities, 4);
    assert.equal(built.roads + p.pieces.roads, 15);
  }
});

// Greedy simple-path finder over the real edge/vertex adjacency.
function findPath(board, len, avoid) {
  for (const startE of board.edges) {
    const [a, b] = startE.vertices;
    if (avoid.has(a) || avoid.has(b)) continue;
    const pathEdges = [startE.id];
    const visited = new Set([a, b]);
    let cur = b;
    while (pathEdges.length < len) {
      const v = board.vertices[cur];
      const next = v.edges.map((eid) => board.edges[eid]).find((e) => {
        const o = e.vertices[0] === cur ? e.vertices[1] : e.vertices[0];
        return !avoid.has(o) && !visited.has(o) && !pathEdges.includes(e.id);
      });
      if (!next) break;
      const o = next.vertices[0] === cur ? next.vertices[1] : next.vertices[0];
      visited.add(o); pathEdges.push(next.id); cur = o;
    }
    if (pathEdges.length === len) return { edges: pathEdges, vertices: [...visited] };
  }
  return null;
}

// Reproduces the reported concern: mid-game, an opponent builds a strictly
// longer road through the real buildRoad action and must steal Longest Road.
test('Longest Road transfers when a later opponent builds a strictly longer road', () => {
  // Clean board (skip setup) so the only pieces are the roads placed here.
  let s = createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed: 42,
  });

  // P0 already holds Longest Road with a 5-trail.
  const p0 = findPath(s.board, 5, new Set());
  for (const e of p0.edges) s.board.edges[e].road = 0;
  s.awards.longestRoad = 0; s.awards.longestRoadLen = 5;

  // P1 lays its own connected 5-trail (a tie so far — no steal on a tie).
  const p1 = findPath(s.board, 5, new Set(p0.vertices));
  for (const e of p1.edges) s.board.edges[e].road = 1;

  // Find a legal edge extending an endpoint of P1's trail to length 6.
  const deg = new Map();
  for (const eid of p1.edges) for (const v of s.board.edges[eid].vertices) deg.set(v, (deg.get(v) || 0) + 1);
  const endpoints = [...deg.entries()].filter(([, d]) => d === 1).map(([v]) => v);
  let ext = null;
  for (const ev of endpoints) {
    for (const eid of s.board.vertices[ev].edges) {
      const e = s.board.edges[eid];
      if (e.road != null) continue;
      const fv = e.vertices[0] === ev ? e.vertices[1] : e.vertices[0];
      if (deg.has(fv) || p0.vertices.includes(fv) || s.board.vertices[fv].building) continue;
      ext = eid; break;
    }
    if (ext != null) break;
  }
  assert.ok(ext != null, 'found a legal extending edge for P1');

  // P1 builds the 6th road via the real action path.
  s.current = 1; s.phase = 'main';
  s.players[1].resources = { brick: 5, lumber: 5, wool: 5, grain: 5, ore: 5 };
  s = applyAction(s, { type: 'buildRoad', eId: ext });

  assert.equal(longestRoadLength(s, 1), 6);
  assert.equal(s.awards.longestRoad, 1); // stolen from P0 mid-game
});
