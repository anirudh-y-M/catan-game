import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine/state.js';
import { applyAction } from '../src/engine/actions.js';
import '../src/engine/devcards.js';
import '../src/engine/robber.js';
import { score } from '../src/engine/awards.js';

function game(seed = 1) {
  const s = createGame({
    players: [{ name: 'A', color: 'red' }, { name: 'B', color: 'blue' }],
    seed,
  });
  s.phase = 'main';
  s.turn = 3;
  s.current = 0;
  return s;
}
const give = (p, res) => { p.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, ...res }; };

test('buyDevCard pays, draws a card, shrinks the deck; empty deck throws', () => {
  const s = game();
  give(s.players[0], { ore: 1, wool: 1, grain: 1 });
  const deckBefore = s.devDeck.length;
  const next = applyAction(s, { type: 'buyDevCard' });
  assert.equal(next.devDeck.length, deckBefore - 1);
  assert.equal(next.players[0].dev.length, 1);
  assert.equal(next.players[0].resources.ore, 0);

  next.devDeck = [];
  give(next.players[0], { ore: 1, wool: 1, grain: 1 });
  assert.throws(() => applyAction(next, { type: 'buyDevCard' }));
});

test('cannot play a card bought this turn, nor two dev cards in a turn', () => {
  const s = game();
  s.players[0].dev = [
    { type: 'knight', boughtTurn: 3, played: false }, // bought this turn
    { type: 'monopoly', boughtTurn: 1, played: false },
    { type: 'yearOfPlenty', boughtTurn: 1, played: false },
  ];
  assert.throws(() => applyAction(s, { type: 'playKnight' })); // bought this turn

  let next = applyAction(s, { type: 'playMonopoly', resource: 'brick' });
  assert.equal(next.devPlayedThisTurn, true);
  assert.throws(() => applyAction(next, { type: 'playYearOfPlenty', resources: ['ore', 'ore'] }));
});

test('Knight increments army, may grant Largest Army, and enters the robber move', () => {
  const s = game();
  s.players[0].playedKnights = 2;
  s.players[0].dev = [{ type: 'knight', boughtTurn: 1, played: false }];
  const next = applyAction(s, { type: 'playKnight' });
  assert.equal(next.players[0].playedKnights, 3);
  assert.equal(next.awards.largestArmy, 0);
  assert.equal(next.phase, 'moveRobber');
  assert.equal(next.robberReturnPhase, 'main');
});

test('Monopoly takes all of a resource from opponents', () => {
  const s = game();
  s.players[0].dev = [{ type: 'monopoly', boughtTurn: 1, played: false }];
  give(s.players[0], { wool: 1 });
  give(s.players[1], { wool: 4, ore: 2 });
  const next = applyAction(s, { type: 'playMonopoly', resource: 'wool' });
  assert.equal(next.players[0].resources.wool, 5);
  assert.equal(next.players[1].resources.wool, 0);
  assert.equal(next.players[1].resources.ore, 2);
});

test('Year of Plenty draws two from the bank; Road Building grants 2 free roads', () => {
  let s = game();
  s.players[0].dev = [{ type: 'yearOfPlenty', boughtTurn: 1, played: false }];
  const bankOre = s.bank.ore;
  s = applyAction(s, { type: 'playYearOfPlenty', resources: ['ore', 'grain'] });
  assert.equal(s.players[0].resources.ore, 1);
  assert.equal(s.players[0].resources.grain, 1);
  assert.equal(s.bank.ore, bankOre - 1);

  let r = game();
  r.players[0].dev = [{ type: 'roadBuilding', boughtTurn: 1, played: false }];
  r = applyAction(r, { type: 'playRoadBuilding' });
  assert.equal(r.freeRoads, 2);
});

test('a Victory Point card counts toward score immediately', () => {
  const s = game();
  s.players[0].dev = [{ type: 'victoryPoint', boughtTurn: 3, played: false }];
  assert.equal(score(s, 0), 1);
});
