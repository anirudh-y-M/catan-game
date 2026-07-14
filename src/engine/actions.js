// The single mutation surface: applyAction(state, action) -> new state.
// Each handler clones, validates (throws on illegal moves), mutates the clone,
// logs, and (from Phase 3 on) recomputes awards/win. Handlers are registered in
// the HANDLERS map; later modules extend it via registerHandlers().

import { cloneState, rngFrom, commitRng, logMsg } from './state.js';
import {
  canPlaceSetupSettlement, legalSetupRoadEdges,
} from './rules.js';
import { RESOURCES } from './constants.js';

const HANDLERS = {};

/** Register one or more action handlers (used by production/robber/etc. modules). */
export function registerHandlers(map) {
  Object.assign(HANDLERS, map);
}

/** Apply an action, returning a fresh state. Throws on unknown/illegal actions. */
export function applyAction(state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) throw new Error(`Unknown action: ${action.type}`);
  const next = cloneState(state);
  handler(next, action);
  return next;
}

// ---- Shared helpers (imported by sibling engine modules) ----

export function currentPlayer(state) {
  return state.players[state.current];
}

/** Move `n` of a resource from the bank to a player (no-op beyond bank stock). */
export function giveResource(state, playerId, resource, n = 1) {
  const take = Math.min(n, state.bank[resource]);
  state.bank[resource] -= take;
  state.players[playerId].resources[resource] += take;
  return take;
}

/** Pay a cost map from a player back to the bank. */
export function payToBank(state, playerId, cost) {
  for (const [r, n] of Object.entries(cost)) {
    state.players[playerId].resources[r] -= n;
    state.bank[r] += n;
  }
}

function grantStartingResources(state, playerId, vId) {
  const v = state.board.vertices[vId];
  for (const hId of v.hexes) {
    const hex = state.board.hexes[hId];
    if (hex.resource) giveResource(state, playerId, hex.resource, 1);
  }
}

function finishSetup(state) {
  state.phase = 'roll';
  state.turn = 1;
  state.current = state.setup.order[state.setup.order.length - 1];

  const { bonusResources, freeDevCards } = state.config;
  if (bonusResources > 0 || freeDevCards > 0) {
    const rng = rngFrom(state);
    for (const p of state.players) {
      for (let i = 0; i < bonusResources; i++) giveResource(state, p.id, rng.pick(RESOURCES), 1);
      for (let i = 0; i < freeDevCards; i++) {
        if (state.devDeck.length) p.dev.push({ type: state.devDeck.pop(), boughtTurn: 0, played: false });
      }
    }
    commitRng(state, rng);
    logMsg(state, `Variant bonus dealt (${bonusResources} resource(s)${freeDevCards ? ` + ${freeDevCards} dev card` : ''} each).`);
  }
  logMsg(state, `Setup complete. ${currentPlayer(state).name} rolls first.`);
}

registerHandlers({
  placeSetupSettlement(state, { vId }) {
    if (state.phase !== 'setup' || state.setup.step !== 'settlement') {
      throw new Error('Not expecting a setup settlement now');
    }
    const playerId = state.setup.order[state.setup.pointer];
    if (!canPlaceSetupSettlement(state, vId)) throw new Error('Illegal settlement placement');
    state.board.vertices[vId].building = { type: 'settlement', player: playerId };
    state.players[playerId].pieces.settlements -= 1;
    state.setup.lastVertex = vId;
    state.setup.step = 'road';
    // The final setup round grants starting resources from that settlement.
    const rounds = state.setup.order.length / state.config.playerCount;
    if (state.setup.pointer >= (rounds - 1) * state.config.playerCount) {
      grantStartingResources(state, playerId, vId);
    }
    logMsg(state, `${state.players[playerId].name} placed a settlement.`);
  },

  placeSetupRoad(state, { eId }) {
    if (state.phase !== 'setup' || state.setup.step !== 'road') {
      throw new Error('Not expecting a setup road now');
    }
    const playerId = state.setup.order[state.setup.pointer];
    if (!legalSetupRoadEdges(state, state.setup.lastVertex).includes(eId)) {
      throw new Error('Setup road must attach to the settlement just placed');
    }
    state.board.edges[eId].road = playerId;
    state.players[playerId].pieces.roads -= 1;
    logMsg(state, `${state.players[playerId].name} placed a road.`);

    state.setup.pointer += 1;
    if (state.setup.pointer < state.setup.order.length) {
      state.current = state.setup.order[state.setup.pointer];
      state.setup.step = 'settlement';
    } else {
      finishSetup(state);
    }
  },
});
