import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import '../src/engine/trade.js';

function game(seed = 1) {
  const s = createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed,
  });
  s.phase = 'main';
  s.current = 0;
  return s;
}
const give = (p, res) => { p.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, ...res }; };

test('4:1 bank trade when no port', () => {
  const s = game();
  give(s.players[0], { brick: 4 });
  const next = applyAction(s, { type: 'bankTrade', give: 'brick', get: 'ore' });
  assert.equal(next.players[0].resources.brick, 0);
  assert.equal(next.players[0].resources.ore, 1);
  assert.equal(next.bank.brick, 19 + 4);
});

test('3:1 / 2:1 with a port; wrong ratio throws', () => {
  const s = game();
  const generic = s.board.ports.find((p) => p.type === '3:1');
  s.board.vertices[generic.vertices[0]].building = { type: 'settlement', player: 0 };
  give(s.players[0], { wool: 3 });
  const next = applyAction(s, { type: 'bankTrade', give: 'wool', get: 'ore' });
  assert.equal(next.players[0].resources.wool, 0);
  assert.equal(next.players[0].resources.ore, 1);

  const special = s.board.ports.find((p) => p.type !== '3:1');
  const otherRes = ['brick', 'lumber', 'wool', 'grain', 'ore'].find((r) => r !== special.type);
  const s2 = game();
  s2.board.vertices[special.vertices[0]].building = { type: 'settlement', player: 0 };
  give(s2.players[0], { [special.type]: 2 });
  const n2 = applyAction(s2, { type: 'bankTrade', give: special.type, get: otherRes });
  assert.equal(n2.players[0].resources[special.type], 0);
  assert.equal(n2.players[0].resources[otherRes], 1);

  const s3 = game();
  give(s3.players[0], { brick: 3 }); // only 3, need 4 without a port
  assert.throws(() => applyAction(s3, { type: 'bankTrade', give: 'brick', get: 'ore' }));
});

test('player trade swaps agreed cards; like-for-like and empty sides rejected', () => {
  let s = game();
  give(s.players[0], { brick: 2 });
  give(s.players[1], { ore: 1 });
  assert.throws(() => applyAction(s, { type: 'offerPlayerTrade', to: 1, give: { brick: 1 }, get: { brick: 1 } }));
  assert.throws(() => applyAction(s, { type: 'offerPlayerTrade', to: 1, give: {}, get: { ore: 1 } }));

  s = applyAction(s, { type: 'offerPlayerTrade', to: 1, give: { brick: 2 }, get: { ore: 1 } });
  assert.ok(s.pendingTrade);
  s = applyAction(s, { type: 'resolvePlayerTrade', accept: true });
  assert.equal(s.players[0].resources.brick, 0);
  assert.equal(s.players[0].resources.ore, 1);
  assert.equal(s.players[1].resources.brick, 2);
  assert.equal(s.players[1].resources.ore, 0);
  assert.equal(s.pendingTrade, null);
});

test('endTurn advances the player and returns to the roll phase', () => {
  const s = game();
  s.turn = 5;
  s.freeRoads = 1;
  s.devPlayedThisTurn = true;
  const next = applyAction(s, { type: 'endTurn' });
  assert.equal(next.current, 1);
  assert.equal(next.turn, 6);
  assert.equal(next.phase, 'roll');
  assert.equal(next.freeRoads, 0);
  assert.equal(next.devPlayedThisTurn, false);
});
