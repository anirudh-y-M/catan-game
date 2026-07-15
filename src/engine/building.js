// Building actions: buildRoad / buildSettlement / buildCity. Each validates phase,
// legality, piece supply, and affordability; pays the bank; then recomputes awards
// and checks for a win. Registers these into the reducer.

import { registerHandlers, currentPlayer, payToBank } from './actions.js';
import { logMsg } from './state.js';
import {
  canBuildRoad, canBuildSettlement, canBuildCity, canAfford,
} from './rules.js';
import { updateAwards, checkWin } from './awards.js';
import { COSTS } from './constants.js';

function requireMain(state) {
  if (state.phase !== 'main') throw new Error('You can only build during your build phase');
}

registerHandlers({
  buildRoad(state, { eId }) {
    requireMain(state);
    const player = currentPlayer(state);
    if (!canBuildRoad(state, player.id, eId)) throw new Error('Illegal road placement');
    if (player.pieces.roads <= 0) throw new Error('No roads left in your supply');

    const free = state.freeRoads > 0;
    if (!free && !canAfford(player, COSTS.road)) throw new Error('Cannot afford a road');

    state.board.edges[eId].road = player.id;
    player.pieces.roads -= 1;
    if (free) state.freeRoads -= 1;
    else payToBank(state, player.id, COSTS.road);

    logMsg(state, `${player.name} built a road${free ? ' (free)' : ''}.`);
    updateAwards(state);
    checkWin(state);
  },

  buildSettlement(state, { vId }) {
    requireMain(state);
    const player = currentPlayer(state);
    if (!canBuildSettlement(state, player.id, vId)) throw new Error('Illegal settlement placement');
    if (player.pieces.settlements <= 0) throw new Error('No settlements left in your supply');
    if (!canAfford(player, COSTS.settlement)) throw new Error('Cannot afford a settlement');

    state.board.vertices[vId].building = { type: 'settlement', player: player.id };
    player.pieces.settlements -= 1;
    payToBank(state, player.id, COSTS.settlement);

    logMsg(state, `${player.name} built a settlement.`);
    updateAwards(state); // a new settlement can break an opponent's longest road
    checkWin(state);
  },

  buildCity(state, { vId }) {
    requireMain(state);
    const player = currentPlayer(state);
    if (!canBuildCity(state, player.id, vId)) throw new Error('You can only upgrade your own settlement');
    if (player.pieces.cities <= 0) throw new Error('No cities left in your supply');
    if (!canAfford(player, COSTS.city)) throw new Error('Cannot afford a city');

    state.board.vertices[vId].building = { type: 'city', player: player.id };
    player.pieces.cities -= 1;
    // Normally the settlement returns to your supply. In "permanent settlements"
    // mode it does not — you get 5 settlements for the whole game.
    if (!state.config.permanentSettlements) player.pieces.settlements += 1;
    payToBank(state, player.id, COSTS.city);

    logMsg(state, `${player.name} upgraded to a city.`);
    checkWin(state);
  },
});
