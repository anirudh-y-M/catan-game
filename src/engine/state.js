// Game-state factory and small state helpers. State is a plain serializable object
// (no functions) so it can be structuredClone'd by the reducer and saved to
// localStorage. Randomness lives as `rngState` (a number); helpers restore a
// transient RNG from it and write the advanced state back.

import { createRng } from './rng.js';
import { generateBoard } from './board.js';
import {
  RESOURCES,
  BANK_PER_RESOURCE,
  DEV_DECK_COUNTS,
  PIECE_LIMITS,
  VARIANTS,
} from './constants.js';

function emptyResources() {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0]));
}

function buildDevDeck() {
  const deck = [];
  for (const [type, n] of Object.entries(DEV_DECK_COUNTS)) {
    for (let i = 0; i < n; i++) deck.push(type);
  }
  return deck;
}

/** Snake placement order for `rounds` setup rounds (forward, reverse, forward, …). */
function snakeOrder(n, rounds) {
  const forward = Array.from({ length: n }, (_, i) => i);
  let order = [];
  for (let r = 0; r < rounds; r++) {
    order = order.concat(r % 2 === 0 ? forward : [...forward].reverse());
  }
  return order;
}

/**
 * @param {{players:{name,color}[], variant?, boardMode?, seed?, hideHands?, theme?}} cfg
 * @returns full initial game State in the 'setup' phase.
 */
export function createGame(cfg) {
  const {
    players: playerCfgs,
    variant = 'standard',
    boardMode = 'random',
    seed = (Math.floor(Math.random() * 0x7fffffff)),
    hideHands = false,
    theme = 'classic',
    turnSeconds = 30,
    sevensMode = 'normal',
    targetVP, // optional override; falls back to the variant default
    permanentSettlements = false, // house rule: upgrading to a city does NOT return the settlement piece
  } = cfg;

  if (!Array.isArray(playerCfgs) || playerCfgs.length < 2 || playerCfgs.length > 4) {
    throw new Error('Catan requires 2 to 4 players');
  }
  const colors = playerCfgs.map((p) => p.color);
  if (new Set(colors).size !== colors.length) {
    throw new Error('Players must have distinct colours');
  }

  const rng = createRng(seed);
  const board = generateBoard({ mode: boardMode, rng });
  const devDeck = rng.shuffle(buildDevDeck());

  const players = playerCfgs.map((p, id) => ({
    id,
    name: p.name || `Player ${id + 1}`,
    color: p.color,
    resources: emptyResources(),
    dev: [],
    playedKnights: 0,
    pieces: { ...PIECE_LIMITS },
  }));

  const v = VARIANTS[variant] ?? VARIANTS.standard;
  const order = snakeOrder(players.length, v.setupSettlements);
  // Custom win target overrides the variant default; clamp to a sane range.
  const finalTarget = Number.isFinite(targetVP)
    ? Math.max(3, Math.min(25, Math.round(targetVP)))
    : v.targetVP;

  return {
    config: {
      variant,
      targetVP: finalTarget,
      setupSettlements: v.setupSettlements,
      bonusResources: v.bonusResources,
      freeDevCards: v.freeDevCards,
      discardLimit: v.discardLimit,
      permanentSettlements,
      boardMode,
      theme,
      hideHands,
      turnSeconds,
      sevensMode,
      playerCount: players.length,
    },
    seed,
    rngState: rng.state(),
    board,
    players,
    current: order[0],
    bank: Object.fromEntries(RESOURCES.map((r) => [r, BANK_PER_RESOURCE])),
    devDeck,
    phase: 'setup',
    turn: 0,
    dice: null,
    lastRoll: null,
    devPlayedThisTurn: false,
    freeRoads: 0,
    pendingDiscards: [],
    stealCandidates: [],
    robberReturnPhase: null,
    pendingTrade: null,
    setup: { order, pointer: 0, step: 'settlement' },
    awards: { longestRoad: null, longestRoadLen: 0, largestArmy: null, largestArmySize: 0 },
    winner: null,
    log: ['Game created. Setup phase: place your first settlement.'],
  };
}

/** Deep, serializable clone (reducer works on a fresh copy each action). */
export function cloneState(state) {
  return structuredClone(state);
}

/** A transient RNG positioned at the state's current stream point. */
export function rngFrom(state) {
  return createRng(state.rngState);
}

/** Persist the RNG's advanced position back into the state. */
export function commitRng(state, rng) {
  state.rngState = rng.state();
}

/** Append a line to the game log. */
export function logMsg(state, msg) {
  state.log.push(msg);
}
