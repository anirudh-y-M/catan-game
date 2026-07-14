// Pure placement/affordability rules over state.board. No mutation. These power both
// action validation and the UI's legal-move highlighting.

import { COSTS } from './constants.js';

/** Does the player hold enough resources for a cost map? */
export function canAfford(player, cost) {
  return Object.entries(cost).every(([r, n]) => player.resources[r] >= n);
}

/** Distance rule: the site and all directly adjacent sites must be vacant. */
export function distanceRuleOk(state, vId) {
  const v = state.board.vertices[vId];
  if (v.building) return false;
  return v.adj.every((aId) => state.board.vertices[aId].building === null);
}

/** During setup a settlement may go on any vacant site obeying the distance rule. */
export function canPlaceSetupSettlement(state, vId) {
  return distanceRuleOk(state, vId);
}

/** Is there a road/building of this player at the given vertex? */
function playerTouchesVertex(state, playerId, vId) {
  const v = state.board.vertices[vId];
  if (v.building && v.building.player === playerId) return true;
  return v.edges.some((eId) => state.board.edges[eId].road === playerId);
}

/** A build-phase settlement needs the distance rule AND a connecting own road. */
export function canBuildSettlement(state, playerId, vId) {
  if (!distanceRuleOk(state, vId)) return false;
  const v = state.board.vertices[vId];
  return v.edges.some((eId) => state.board.edges[eId].road === playerId);
}

/** A city upgrades one of the player's own settlements. */
export function canBuildCity(state, playerId, vId) {
  const b = state.board.vertices[vId].building;
  return !!b && b.type === 'settlement' && b.player === playerId;
}

/**
 * A road is legal on an empty edge that connects to the player's network, where a
 * connection may not be made *through* a vertex occupied by an opponent's building.
 */
export function canBuildRoad(state, playerId, eId) {
  const e = state.board.edges[eId];
  if (e.road !== null) return false;
  return e.vertices.some((vId) => {
    const v = state.board.vertices[vId];
    const blockedByOpponent = v.building && v.building.player !== playerId;
    if (blockedByOpponent) return false;
    // Own building here, or an own road meeting at this (unblocked) vertex.
    if (v.building && v.building.player === playerId) return true;
    return v.edges.some((oeId) => oeId !== eId && state.board.edges[oeId].road === playerId);
  });
}

/** Maritime trade rate for a given resource: 2 (special port), 3 (generic), else 4. */
export function portRate(state, playerId, resource) {
  let rate = 4;
  for (const v of state.board.vertices) {
    if (!v.building || v.building.player !== playerId || v.port === null) continue;
    const type = state.board.ports[v.port].type;
    if (type === resource) return 2;
    if (type === '3:1') rate = Math.min(rate, 3);
  }
  return rate;
}

// ---- Legal-move enumerations (used by the UI to highlight only valid targets) ----

export function legalSetupSettlementVertices(state) {
  return state.board.vertices.filter((v) => canPlaceSetupSettlement(state, v.id)).map((v) => v.id);
}

/** Setup road must attach to the settlement just placed at `vId`. */
export function legalSetupRoadEdges(state, vId) {
  return state.board.vertices[vId].edges.filter((eId) => state.board.edges[eId].road === null);
}

export function legalSettlementVertices(state, playerId) {
  return state.board.vertices.filter((v) => canBuildSettlement(state, playerId, v.id)).map((v) => v.id);
}

export function legalCityVertices(state, playerId) {
  return state.board.vertices.filter((v) => canBuildCity(state, playerId, v.id)).map((v) => v.id);
}

export function legalRoadEdges(state, playerId) {
  return state.board.edges.filter((e) => canBuildRoad(state, playerId, e.id)).map((e) => e.id);
}

export { COSTS };
