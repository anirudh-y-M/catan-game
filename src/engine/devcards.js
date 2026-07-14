// Development cards: buy one, or play a Knight / Road Building / Year of Plenty /
// Monopoly. Enforces "at most one dev card per turn" and "not the turn it was bought"
// (Victory Point cards are exempt — they score automatically and are never "played").

import { registerHandlers, currentPlayer, giveResource, payToBank } from './actions.js';
import { logMsg } from './state.js';
import { canAfford } from './rules.js';
import { updateAwards, checkWin } from './awards.js';
import { COSTS, RESOURCES } from './constants.js';

/** An owned, unplayed card of `type` that wasn't bought this very turn. */
function playable(player, type, turn) {
  return player.dev.find((c) => c.type === type && !c.played && c.boughtTurn !== turn);
}

function beginPlay(state, type) {
  if (state.phase !== 'main' && !(type === 'knight' && state.phase === 'roll')) {
    throw new Error('You can only play that card during your turn');
  }
  if (state.devPlayedThisTurn) throw new Error('You may only play one development card per turn');
  const player = currentPlayer(state);
  const card = playable(player, type, state.turn);
  if (!card) throw new Error(`No playable ${type} card`);
  card.played = true;
  state.devPlayedThisTurn = true;
  return player;
}

registerHandlers({
  buyDevCard(state) {
    if (state.phase !== 'main') throw new Error('You can only buy during your build phase');
    const player = currentPlayer(state);
    if (!canAfford(player, COSTS.devCard)) throw new Error('Cannot afford a development card');
    if (state.devDeck.length === 0) throw new Error('The development deck is empty');

    payToBank(state, player.id, COSTS.devCard);
    const type = state.devDeck.pop();
    player.dev.push({ type, boughtTurn: state.turn, played: false });
    logMsg(state, `${player.name} bought a development card.`);
    if (type === 'victoryPoint') checkWin(state); // could clinch a win the turn it's bought
  },

  playKnight(state) {
    const player = beginPlay(state, 'knight');
    player.playedKnights += 1;
    logMsg(state, `${player.name} played a Knight.`);
    updateAwards(state);
    checkWin(state);
    if (state.phase !== 'gameOver') {
      // Enter the robber sequence, returning to the pre-play phase afterwards.
      state.robberReturnPhase = state.phase;
      state.phase = 'moveRobber';
    }
  },

  playRoadBuilding(state) {
    const player = beginPlay(state, 'roadBuilding');
    state.freeRoads += 2;
    logMsg(state, `${player.name} played Road Building (2 free roads).`);
  },

  playYearOfPlenty(state, { resources }) {
    const player = beginPlay(state, 'yearOfPlenty');
    if (!Array.isArray(resources) || resources.length !== 2) {
      throw new Error('Choose exactly two resources');
    }
    for (const r of resources) {
      if (!RESOURCES.includes(r)) throw new Error(`Unknown resource ${r}`);
      if (state.bank[r] < 1) throw new Error(`The bank is out of ${r}`);
    }
    for (const r of resources) giveResource(state, player.id, r, 1);
    logMsg(state, `${player.name} played Year of Plenty (${resources.join(', ')}).`);
  },

  playMonopoly(state, { resource }) {
    const player = beginPlay(state, 'monopoly');
    if (!RESOURCES.includes(resource)) throw new Error(`Unknown resource ${resource}`);
    let taken = 0;
    for (const other of state.players) {
      if (other.id === player.id) continue;
      taken += other.resources[resource];
      other.resources[resource] = 0;
    }
    player.resources[resource] += taken;
    logMsg(state, `${player.name} monopolised ${resource} (+${taken}).`);
  },
});
