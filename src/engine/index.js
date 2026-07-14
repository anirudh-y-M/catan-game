// Engine barrel: importing this registers every action handler and re-exports the
// public API the UI (and tests) use.

import './production.js';
import './robber.js';
import './building.js';
import './devcards.js';
import './trade.js';

export { createGame, cloneState, logMsg } from './state.js';
export { applyAction, currentPlayer } from './actions.js';
export { robberCandidates } from './robber.js';
export { score, checkWin } from './awards.js';
export { longestRoadLength } from './longestRoad.js';
export {
  canAfford, distanceRuleOk, canBuildRoad, canBuildSettlement, canBuildCity, portRate,
  legalSetupSettlementVertices, legalSetupRoadEdges,
  legalSettlementVertices, legalCityVertices, legalRoadEdges,
} from './rules.js';
export * as C from './constants.js';
