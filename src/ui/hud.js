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
// Secret VP-dev-cards only count in the total shown to a seat that's allowed to see them:
// 'all' (offline, shared screen) reveals everyone; online reveals only your own seat.
function displayVP(state, pid, viewer) {
  const full = score(state, pid);
  return (viewer === 'all' || pid === viewer) ? full : full - vpCardCount(state.players[pid]);
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
  const activeTheme = ctx.theme || state.config.theme;
  const themeSeg = h('div', { class: 'theme-toggle' }, [
    h('div', { class: 'seg' }, ['classic', 'modern'].map((t) => h('button', {
      type: 'button', text: t[0].toUpperCase() + t.slice(1),
      'aria-pressed': String(activeTheme === t),
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
  const isCurrent = player.id === state.current;
  const viewer = ctx.online ? ctx.localSeat : 'all';
  // Online: reveal only your own seat. Offline: the active player (plus everyone if
  // "hide hands" is off).
  const reveal = ctx.online ? (player.id === ctx.localSeat) : (isCurrent || !state.config.hideHands);
  const res = reveal
    ? h('div', { class: 'pcard__res' }, C.RESOURCES.map((r) => h('span', { class: 'chip', dataset: { res: r } }, [
        h('span', { class: 'ic', text: RES_ICON[r] }), h('span', { class: 'num', text: String(player.resources[r]) }),
      ])))
    : h('div', { class: 'pcard__hidden', text: `${C.RESOURCES.reduce((a, r) => a + player.resources[r], 0)} cards (hidden)` });

  const unplayed = player.dev.filter((c) => !c.played);
  const devSummary = reveal
    ? (unplayed.map((c) => DEV_ICON[c.type]).join(' ') || 'no cards')
    : `${unplayed.length} dev`;

  const badges = h('span', { class: 'pcard__badges' }, [
    state.awards.longestRoad === player.id ? h('span', { class: 'badge', title: 'Longest Road', text: '🛣️ LR' }) : null,
    state.awards.largestArmy === player.id ? h('span', { class: 'badge', title: 'Largest Army', text: '🛡️ LA' }) : null,
  ]);

  const vp = displayVP(state, player.id, viewer);
  const target = state.config.targetVP || 10;
  return h('div', {
    class: `pcard${isCurrent ? ' active' : ''}`, dataset: { player: String(player.id) },
    style: { borderLeftColor: colorHex(player.color) },
  }, [
    h('div', { class: 'pcard__top' }, [
      h('span', { class: 'pcard__avatar', style: { background: colorHex(player.color) }, text: (player.name[0] || '?').toUpperCase() }),
      h('span', { class: 'pcard__name', text: player.name + (ctx.online && player.id === ctx.localSeat ? ' (you)' : '') }),
      badges,
      h('span', { class: 'pcard__vp', title: `${vp} / ${target} victory points`, text: `${vp} ★` }),
    ]),
    h('div', { class: 'vp-bar' }, [h('span', { style: { width: `${Math.min(100, (vp / target) * 100)}%` } })]),
    res,
    h('div', { class: 'pcard__hidden', text: `🎴 ${devSummary}` }),
    h('div', { class: 'pcard__hidden', text: `🏠 ${player.pieces.settlements} · 🏛️ ${player.pieces.cities} · 🛤️ ${player.pieces.roads}` }),
  ]);
}

// Which of the 9 grid cells hold a pip, per die value.
const PIP_MAP = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
function die(v, rolling) {
  const cells = Array.from({ length: 9 }, (_, i) => h('span', v != null && PIP_MAP[v].includes(i) ? { class: 'dp' } : {}));
  return h('div', { class: `die${rolling ? ' rolling' : ''}`, 'aria-label': v != null ? `die showing ${v}` : 'die' }, cells);
}
function diceSection(state, ctx) {
  const [d1, d2] = state.dice || [null, null];
  return h('div', { class: 'sidebar__section' }, [
    h('div', { class: 'dice' }, [
      die(d1, ctx.ui.rolling), die(d2, ctx.ui.rolling),
      state.dice ? h('span', { class: 'dice__sum', text: `= ${state.lastRoll}` }) : null,
    ]),
  ]);
}

function actionBar(state, ctx) {
  const p = state.players[state.current];
  const gate = ctx.myTurn !== false; // online: only on your turn; offline: always
  const inMain = gate && state.phase === 'main';
  const freeRoad = state.freeRoads > 0;

  const canRoad = inMain && p.pieces.roads > 0 && legalRoadEdges(state, p.id).length > 0
    && (freeRoad || canAfford(p, C.COSTS.road));
  const canSettle = inMain && p.pieces.settlements > 0 && legalSettlementVertices(state, p.id).length > 0
    && canAfford(p, C.COSTS.settlement);
  const canCity = inMain && p.pieces.cities > 0 && legalCityVertices(state, p.id).length > 0
    && canAfford(p, C.COSTS.city);
  const canBuyDev = inMain && state.devDeck.length > 0 && canAfford(p, C.COSTS.devCard);
  const canPlayDev = gate && (state.phase === 'main' || state.phase === 'roll') && playableDevTypes(state).length > 0;
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
        ? h('button', { class: 'btn btn-primary', disabled: !gate, text: '🎲 Roll Dice', on: { click: () => ctx.dispatch({ type: 'rollDice' }) } })
        : null,
      modeBtn(`🛤️ Road${freeRoad ? ` (${state.freeRoads} free)` : ''}`, 'buildRoad', canRoad),
      modeBtn('🏠 Settlement', 'buildSettlement', canSettle),
      modeBtn('🏛️ City', 'buildCity', canCity),
      h('button', { class: 'btn btn-sm', disabled: !canBuyDev, text: '🎴 Buy Dev', on: { click: () => ctx.dispatch({ type: 'buyDevCard' }) } }),
      h('button', { class: 'btn btn-sm', disabled: !canPlayDev, text: '▶️ Play Dev', on: { click: ctx.openPlay } }),
      h('button', { class: 'btn btn-sm', disabled: !canTrade, text: '🔁 Trade', on: { click: ctx.openTrade } }),
      h('button', { class: 'btn btn-sm end-turn', disabled: !(gate && state.phase === 'main'), text: '⏭️ End Turn', on: { click: () => ctx.dispatch({ type: 'endTurn' }) } }),
    ]),
  ]);
}

const BUILD_COSTS = [
  ['road', '🛤️ Road'],
  ['settlement', '🏠 Settlement'],
  ['city', '🏛️ City'],
  ['devCard', '🎴 Dev card'],
];

function costIcons(cost) {
  const icons = [];
  for (const [r, n] of Object.entries(cost)) for (let i = 0; i < n; i++) icons.push(RES_ICON[r]);
  return icons.join(' ');
}

// The classic "Building Costs" card: what each build needs. Rows you can't currently
// afford (during your build phase) are dimmed.
function buildCostsSection(state, ctx) {
  const open = ctx.ui.costsOpen !== false;
  const p = state.players[state.current];
  const inMain = state.phase === 'main';
  const rows = BUILD_COSTS.map(([key, label]) => h('div', {
    class: `cost-row${inMain && !canAfford(p, C.COSTS[key]) ? ' unaffordable' : ''}`,
  }, [
    h('span', { class: 'cost-name', text: label }),
    h('span', { class: 'cost-icons', text: costIcons(C.COSTS[key]) }),
  ]));
  return h('div', { class: 'sidebar__section' }, [
    h('button', {
      class: 'section-toggle', 'aria-expanded': String(open), on: { click: ctx.toggleCosts },
    }, [
      h('span', { text: 'Build costs' }),
      h('span', { class: 'section-chevron', text: open ? '▾' : '▸' }),
    ]),
    open ? h('div', { class: 'costs' }, rows) : null,
  ]);
}

export function buildSidebar(state, ctx) {
  const bank = h('div', { class: 'sidebar__section' }, [
    h('div', { class: 'bank' }, C.RESOURCES.map((r) => h('span', { class: 'chip', title: r }, [
      h('span', { class: 'ic', text: RES_ICON[r] }), String(state.bank[r]),
    ]))),
  ]);
  const logOpen = ctx.ui.logOpen !== false;
  const log = h('div', { class: 'sidebar__section' }, [
    h('button', {
      class: 'section-toggle', 'aria-expanded': String(logOpen),
      on: { click: ctx.toggleLog },
    }, [
      h('span', { text: 'Game Log' }),
      h('span', { class: 'section-chevron', text: logOpen ? '▾' : '▸' }),
    ]),
    logOpen ? h('ul', { class: 'log' }, state.log.slice(-14).map((line) => h('li', { text: line }))) : null,
  ]);

  const activePlacer = state.phase === 'setup' ? state.setup.order[state.setup.pointer] : state.current;
  const waiting = ctx.online && ctx.myTurn === false;
  const buildLabels = { buildRoad: 'road', buildSettlement: 'settlement', buildCity: 'city' };
  let instructionText = waiting
    ? `Waiting for ${state.players[activePlacer]?.name ?? '…'}…`
    : instruction(state);
  if (!waiting && buildLabels[ctx.ui.mode]) {
    instructionText = `Tap a highlighted spot to build a ${buildLabels[ctx.ui.mode]} — or tap the board / press Esc to cancel.`;
  }
  const showTimer = ctx.turnSeconds > 0 && (state.phase === 'roll' || state.phase === 'main');
  const timerEl = showTimer ? h('span', {
    class: `turn-timer${ctx.timerPaused ? ' paused' : ''}${(!ctx.timerPaused && ctx.timeLeft <= 10) ? ' low' : ''}`,
    text: ctx.timerPaused ? '⏱ paused' : `⏱ ${ctx.timeLeft}s`,
  }) : null;
  const sidebar = h('aside', { class: 'sidebar' }, [
    buildTopbar(state, ctx),
    h('div', { class: 'banner', 'aria-live': 'polite' }, [
      h('div', { class: 'banner__row' }, [
        h('div', { class: 'turn', text: `${state.players[state.current]?.name ?? ''}'s turn` }),
        timerEl,
      ]),
      h('div', { class: 'instruction', text: instructionText }),
    ]),
    diceSection(state, ctx),
    actionBar(state, ctx),
    buildCostsSection(state, ctx),
    h('div', { class: 'sidebar__section' }, state.players.map((p) => playerCard(state, p, ctx))),
    bank,
    log,
  ]);
  return sidebar;
}

export { playableDevTypes };
