// HUD: top bar + right sidebar (banner, player cards, dice, action bar, bank, log).

import { h } from './dom.js';
import {
  canAfford, legalRoadEdges, legalSettlementVertices, legalCityVertices, score, C,
} from '../engine/index.js';

const RES_ICON = { brick: '🧱', lumber: '🌲', wool: '🐑', grain: '🌾', ore: '⛰️' };
const DEV_ICON = { knight: '🛡️', roadBuilding: '🛣️', yearOfPlenty: '🎁', monopoly: '💰', victoryPoint: '⭐' };
const colorHex = (id) => (C.PLAYER_COLORS.find((c) => c.id === id) || {}).hex || '#999';

function playableDevTypes(state) {
  if (state.phase !== 'main' && state.phase !== 'roll') return [];
  if (state.devPlayedThisTurn) return [];
  const p = state.players[state.current];
  const types = new Set();
  for (const c of p.dev) {
    if (c.played || c.type === 'victoryPoint' || c.boughtTurn === state.turn) continue;
    types.add(c.type);
  }
  return [...types];
}

function vpCardCount(player) { return player.dev.filter((c) => c.type === 'victoryPoint').length; }
function displayVP(state, pid) {
  const full = score(state, pid);
  return pid === state.current ? full : full - vpCardCount(state.players[pid]);
}

function instruction(state) {
  const name = state.players[state.current]?.name;
  switch (state.phase) {
    case 'setup':
      return state.setup.step === 'settlement'
        ? `${state.players[state.setup.order[state.setup.pointer]].name}: place a settlement`
        : `${state.players[state.setup.order[state.setup.pointer]].name}: place a road beside it`;
    case 'roll': return `${name}: roll the dice`;
    case 'discard': return `${state.players[state.pendingDiscards[0]].name} must discard (a 7 was rolled)`;
    case 'moveRobber': return `${name}: move the robber to a new hex`;
    case 'steal': return `${name}: choose a player to rob`;
    case 'main': return `${name}: trade, build, or end your turn`;
    case 'gameOver': return `${state.players[state.winner].name} wins!`;
    default: return '';
  }
}

export function buildTopbar(state, ctx) {
  const themeSeg = h('div', { class: 'theme-toggle' }, [
    h('div', { class: 'seg' }, ['classic', 'modern'].map((t) => h('button', {
      type: 'button', text: t[0].toUpperCase() + t.slice(1),
      'aria-pressed': String(state.config.theme === t),
      on: { click: () => ctx.setTheme(t) },
    }))),
  ]);
  const variantLabel = (C.VARIANTS[state.config.variant] || {}).label || 'Standard';
  return h('header', { class: 'topbar' }, [
    h('h1', { text: '⚓ Catan' }),
    h('span', { class: 'meta', text: `${variantLabel} · first to ${state.config.targetVP} VP · turn ${state.turn}` }),
    h('span', { class: 'spacer' }),
    themeSeg,
    h('button', {
      class: 'btn btn-sm btn-ghost', title: ctx.muted ? 'Unmute' : 'Mute',
      'aria-label': ctx.muted ? 'Unmute sound' : 'Mute sound',
      text: ctx.muted ? '🔇' : '🔊', on: { click: ctx.toggleSound },
    }),
    h('button', { class: 'btn btn-sm', text: 'New Game', on: { click: ctx.newGame } }),
  ]);
}

function playerCard(state, player, ctx) {
  const active = player.id === state.current;
  const showRes = active || !state.config.hideHands;
  const res = showRes
    ? h('div', { class: 'pcard__res' }, C.RESOURCES.map((r) => h('span', { class: 'chip' }, [
        h('span', { class: 'ic', text: RES_ICON[r] }), String(player.resources[r]),
      ])))
    : h('div', { class: 'pcard__hidden', text: `${C.RESOURCES.reduce((a, r) => a + player.resources[r], 0)} cards (hidden)` });

  const handTotal = C.RESOURCES.reduce((a, r) => a + player.resources[r], 0);
  const devSummary = active
    ? player.dev.filter((c) => !c.played).map((c) => DEV_ICON[c.type]).join(' ') || '—'
    : `${player.dev.filter((c) => !c.played).length} dev`;

  const badges = h('span', { class: 'pcard__badges' }, [
    state.awards.longestRoad === player.id ? h('span', { class: 'badge', title: 'Longest Road', text: '🛣️ LR' }) : null,
    state.awards.largestArmy === player.id ? h('span', { class: 'badge', title: 'Largest Army', text: '🛡️ LA' }) : null,
  ]);

  return h('div', {
    class: `pcard${active ? ' active' : ''}`,
    style: { borderLeftColor: colorHex(player.color) },
  }, [
    h('div', { class: 'pcard__top' }, [
      h('span', { class: 'pcard__name', text: player.name }),
      badges,
      h('span', { class: 'pcard__vp', title: 'Victory points', text: `${displayVP(state, player.id)} ★` }),
    ]),
    res,
    h('div', { class: 'pcard__hidden' }, [
      `🎴 ${devSummary}`,
      active && state.config.hideHands ? '' : '',
    ]),
    h('div', { class: 'pcard__hidden', text: `🏠 ${player.pieces.settlements} · 🏛️ ${player.pieces.cities} · 🛤️ ${player.pieces.roads}${active ? '' : ` · ${handTotal} cards`}` }),
  ]);
}

function diceSection(state, ctx) {
  const [d1, d2] = state.dice || [null, null];
  const face = (v) => h('div', { class: `die${ctx.ui.rolling ? ' rolling' : ''}`, text: v == null ? '·' : String(v) });
  return h('div', { class: 'sidebar__section' }, [
    h('div', { class: 'dice' }, [
      face(d1), face(d2),
      state.dice ? h('span', { class: 'dice__sum', text: `= ${state.lastRoll}` }) : null,
    ]),
  ]);
}

function actionBar(state, ctx) {
  const p = state.players[state.current];
  const inMain = state.phase === 'main';
  const freeRoad = state.freeRoads > 0;

  const canRoad = inMain && p.pieces.roads > 0 && legalRoadEdges(state, p.id).length > 0
    && (freeRoad || canAfford(p, C.COSTS.road));
  const canSettle = inMain && p.pieces.settlements > 0 && legalSettlementVertices(state, p.id).length > 0
    && canAfford(p, C.COSTS.settlement);
  const canCity = inMain && p.pieces.cities > 0 && legalCityVertices(state, p.id).length > 0
    && canAfford(p, C.COSTS.city);
  const canBuyDev = inMain && state.devDeck.length > 0 && canAfford(p, C.COSTS.devCard);
  const canPlayDev = (inMain || state.phase === 'roll') && playableDevTypes(state).length > 0;
  const canTrade = inMain;

  const modeBtn = (label, mode, enabled) => h('button', {
    class: `btn btn-sm${ctx.ui.mode === mode ? ' btn-primary' : ''}`,
    disabled: !enabled,
    text: label,
    on: { click: () => ctx.setMode(ctx.ui.mode === mode ? 'idle' : mode) },
  });

  return h('div', { class: 'sidebar__section' }, [
    h('div', { class: 'actionbar' }, [
      state.phase === 'roll'
        ? h('button', { class: 'btn btn-primary', text: '🎲 Roll Dice', on: { click: () => ctx.dispatch({ type: 'rollDice' }) } })
        : null,
      modeBtn(`🛤️ Road${freeRoad ? ` (${state.freeRoads} free)` : ''}`, 'buildRoad', canRoad),
      modeBtn('🏠 Settlement', 'buildSettlement', canSettle),
      modeBtn('🏛️ City', 'buildCity', canCity),
      h('button', { class: 'btn btn-sm', disabled: !canBuyDev, text: '🎴 Buy Dev', on: { click: () => ctx.dispatch({ type: 'buyDevCard' }) } }),
      h('button', { class: 'btn btn-sm', disabled: !canPlayDev, text: '▶️ Play Dev', on: { click: ctx.openPlay } }),
      h('button', { class: 'btn btn-sm', disabled: !canTrade, text: '🔁 Trade', on: { click: ctx.openTrade } }),
      h('button', { class: 'btn btn-sm', disabled: !inMain, text: '⏭️ End Turn', on: { click: () => ctx.dispatch({ type: 'endTurn' }) } }),
    ]),
  ]);
}

export function buildSidebar(state, ctx) {
  const bank = h('div', { class: 'sidebar__section' }, [
    h('div', { class: 'bank' }, C.RESOURCES.map((r) => h('span', { class: 'chip', title: r }, [
      h('span', { class: 'ic', text: RES_ICON[r] }), String(state.bank[r]),
    ]))),
  ]);
  const log = h('div', { class: 'sidebar__section' }, [
    h('ul', { class: 'log' }, state.log.slice(-14).map((line) => h('li', { text: line }))),
  ]);

  const sidebar = h('aside', { class: 'sidebar' }, [
    h('div', { class: 'banner', 'aria-live': 'polite' }, [
      h('div', { class: 'turn', text: `${state.players[state.current]?.name ?? ''}'s turn` }),
      h('div', { class: 'instruction', text: instruction(state) }),
    ]),
    diceSection(state, ctx),
    actionBar(state, ctx),
    h('div', { class: 'sidebar__section' }, state.players.map((p) => playerCard(state, p, ctx))),
    bank,
    log,
  ]);
  return sidebar;
}

export { playableDevTypes };
