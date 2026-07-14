// App orchestrator: setup screen, game render loop, board interaction, modal sync.

import { h, clear } from './ui/dom.js';
import {
  createGame, applyAction, C,
  legalSetupSettlementVertices, legalSetupRoadEdges,
  legalSettlementVertices, legalCityVertices, legalRoadEdges,
} from './engine/index.js';
import { renderBoard } from './ui/render.js';
import { buildTopbar, buildSidebar } from './ui/hud.js';
import {
  discardModal, stealModal, tradeModal, offerResolveModal,
  resourcePickerModal, playDevModal, winModal,
} from './ui/modals.js';
import { applyTheme } from './ui/themes.js';
import { save, load, clearSave } from './ui/persistence.js';
import { play, isMuted, toggleMute } from './ui/sound.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const app = document.getElementById('app');

let state = null;
let ui = { mode: 'idle', modal: null, rolling: false, logOpen: true };
let modalEl = null;

// ---------- Dispatch ----------
function dispatch(action) {
  if (action.type === 'rollDice' && !ui.rolling) {
    ui.rolling = true; play('dice'); render();
    setTimeout(() => { ui.rolling = false; applyAndRender(action); }, 450);
    return;
  }
  applyAndRender(action);
}
function applyAndRender(action) {
  try { state = applyAction(state, action); } catch (e) { console.warn('rejected', action.type, e.message); return; }
  save(state);
  if (action.type === 'buildRoad') ui.mode = state.freeRoads > 0 ? 'buildRoad' : 'idle';
  else if (action.type === 'buildSettlement' || action.type === 'buildCity') ui.mode = 'idle';
  playFor(action);
  render();
}

// Map an applied action (and its result) to a sound effect.
function playFor(action) {
  const t = action.type;
  if (state.winner != null && state.phase === 'gameOver') { play('win'); return; }
  if (['buildRoad', 'buildSettlement', 'buildCity', 'placeSetupSettlement', 'placeSetupRoad'].includes(t)) play('build');
  else if (['buyDevCard', 'playKnight', 'playRoadBuilding', 'playYearOfPlenty', 'playMonopoly'].includes(t)) play('dev');
  else if (t === 'moveRobber') play('robber');
  else if (t === 'steal') play('steal');
  else if (t === 'bankTrade' || (t === 'resolvePlayerTrade' && action.accept)) play('trade');
  else if (t === 'rollDice' && state.lastRoll === 7) play('robber');
}
const setMode = (m) => { ui.mode = m; render(); };
const toggleSound = () => { toggleMute(); render(); };
const toggleLog = () => { ui.logOpen = !ui.logOpen; render(); };
const openTrade = () => { ui.modal = 'trade'; render(); };
const openPlay = () => { ui.modal = 'play'; render(); };
const setTheme = (t) => { if (state) { state.config.theme = t; save(state); } applyTheme(t); state ? render() : renderSetup(); };
function newGame() { clearSave(); state = null; ui = { mode: 'idle', modal: null, rolling: false, logOpen: true }; removeModal(); renderSetup(); }

function onPlayDev(type) {
  ui.modal = null;
  if (type === 'knight') dispatch({ type: 'playKnight' });
  else if (type === 'roadBuilding') { ui.mode = 'buildRoad'; dispatch({ type: 'playRoadBuilding' }); }
  else if (type === 'yearOfPlenty') { ui.modal = 'yearOfPlenty'; render(); }
  else if (type === 'monopoly') { ui.modal = 'monopoly'; render(); }
}

// ---------- Board interaction targets for the current phase/mode ----------
function pickFor() {
  if (state.phase === 'setup') {
    return state.setup.step === 'settlement'
      ? { vertices: legalSetupSettlementVertices(state), onVertex: (v) => dispatch({ type: 'placeSetupSettlement', vId: v }) }
      : { edges: legalSetupRoadEdges(state, state.setup.lastVertex), onEdge: (e) => dispatch({ type: 'placeSetupRoad', eId: e }) };
  }
  if (state.phase === 'moveRobber') {
    return { hexes: state.board.hexes.filter((hx) => hx.id !== state.board.robberHex).map((hx) => hx.id), onHex: (hx) => dispatch({ type: 'moveRobber', hexId: hx }) };
  }
  if (state.phase === 'main') {
    const pid = state.current;
    if (ui.mode === 'buildRoad') return { edges: legalRoadEdges(state, pid), onEdge: (e) => dispatch({ type: 'buildRoad', eId: e }) };
    if (ui.mode === 'buildSettlement') return { vertices: legalSettlementVertices(state, pid), onVertex: (v) => dispatch({ type: 'buildSettlement', vId: v }) };
    if (ui.mode === 'buildCity') return { vertices: legalCityVertices(state, pid), onVertex: (v) => dispatch({ type: 'buildCity', vId: v }) };
  }
  return {};
}

// ---------- Modals ----------
function removeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
function showModal(content, dismissable) {
  const overlay = h('div', { class: 'overlay' }, [content]);
  if (dismissable) overlay.addEventListener('click', (e) => { if (e.target === overlay) { ui.modal = null; render(); } });
  document.body.appendChild(overlay);
  modalEl = overlay;
}
function syncModals() {
  removeModal();
  let content = null; let dismissable = false;
  if (state.phase === 'gameOver') content = winModal(state, { onNewGame: newGame });
  else if (state.phase === 'discard') content = discardModal(state, { onConfirm: (cards) => dispatch({ type: 'discard', playerId: state.pendingDiscards[0], cards }) });
  else if (state.phase === 'steal') content = stealModal(state, { onPick: (pid) => dispatch({ type: 'steal', targetPlayerId: pid }) });
  else if (state.pendingTrade) content = offerResolveModal(state, { onResolve: (accept) => dispatch({ type: 'resolvePlayerTrade', accept }) });
  else if (ui.modal === 'trade') {
    dismissable = true;
    content = tradeModal(state, {
      onBankTrade: (give, get) => dispatch({ type: 'bankTrade', give, get }),
      onOfferTrade: (o) => { ui.modal = null; dispatch({ type: 'offerPlayerTrade', ...o }); },
      onClose: () => { ui.modal = null; render(); },
    });
  } else if (ui.modal === 'play') { dismissable = true; content = playDevModal(state, { onPlay: onPlayDev, onClose: () => { ui.modal = null; render(); } }); }
  else if (ui.modal === 'yearOfPlenty') content = resourcePickerModal({ title: 'Year of Plenty', desc: 'Take any two resources from the bank.', count: 2, onConfirm: (rs) => { ui.modal = null; dispatch({ type: 'playYearOfPlenty', resources: rs }); } });
  else if (ui.modal === 'monopoly') content = resourcePickerModal({ title: 'Monopoly', desc: 'Name a resource — take all of it from every opponent.', count: 1, onConfirm: (rs) => { ui.modal = null; dispatch({ type: 'playMonopoly', resource: rs[0] }); } });
  if (content) showModal(content, dismissable);
}

// ---------- Render ----------
function render() {
  const ctx = { ui, dispatch, setMode, openTrade, openPlay, newGame, setTheme, muted: isMuted(), toggleSound, toggleLog };
  clear(app);
  const svg = document.createElementNS(SVGNS, 'svg');
  const board = h('div', { class: 'board-wrap' }, [svg]);
  app.appendChild(h('div', { class: 'game' }, [
    buildTopbar(state, ctx),
    h('div', { class: 'game__body' }, [board, buildSidebar(state, ctx)]),
  ]));
  const p = pickFor();
  renderBoard(svg, state, { pick: { vertices: p.vertices, edges: p.edges, hexes: p.hexes }, onVertex: p.onVertex, onEdge: p.onEdge, onHex: p.onHex });
  syncModals();
}

// ---------- Setup screen ----------
const cfg = {
  players: [{ name: 'Player 1', color: 'red' }, { name: 'Player 2', color: 'blue' }],
  variant: 'standard', boardMode: 'random', theme: 'classic', hideHands: false,
};

function seg(options, value, onPick) {
  return h('div', { class: 'seg' }, options.map(([val, label]) => h('button', {
    type: 'button', text: label, 'aria-pressed': String(value === val), on: { click: () => onPick(val) },
  })));
}

function renderSetup() {
  applyTheme(cfg.theme);
  clear(app);
  const saved = load();

  const takenColors = new Set(cfg.players.map((p) => p.color));
  const playerRows = h('div', { class: 'player-rows' }, cfg.players.map((pl, i) => h('div', { class: 'player-row' }, [
    h('input', { type: 'text', value: pl.name, 'aria-label': `Player ${i + 1} name`, on: { input: (e) => { cfg.players[i].name = e.target.value; } } }),
    h('div', { class: 'color-picker' }, C.PLAYER_COLORS.map((c) => h('button', {
      class: 'swatch', title: c.label, style: { background: c.hex },
      'aria-pressed': String(pl.color === c.id),
      disabled: c.id !== pl.color && takenColors.has(c.id),
      on: { click: () => { cfg.players[i].color = c.id; renderSetup(); } },
    }))),
    cfg.players.length > 2 ? h('button', { class: 'row-remove', title: 'Remove', text: '×', on: { click: () => { cfg.players.splice(i, 1); renderSetup(); } } }) : null,
  ])));

  const addBtn = cfg.players.length < 4 ? h('button', {
    class: 'btn btn-sm btn-ghost', text: '+ Add player',
    on: { click: () => { const free = C.PLAYER_COLORS.find((c) => !takenColors.has(c.id)); cfg.players.push({ name: `Player ${cfg.players.length + 1}`, color: free.id }); renderSetup(); } },
  }) : null;

  const hideToggle = h('label', { class: 'toggle-row' }, [
    h('span', { text: 'Hide opponents’ hands between turns' }),
    h('input', { type: 'checkbox', checked: cfg.hideHands, on: { change: (e) => { cfg.hideHands = e.target.checked; } } }),
  ]);

  const setup = h('div', { class: 'setup' }, [
    h('div', { class: 'setup__hero' }, [
      h('h1', { html: '<span class="anchor">⚓</span> Catan' }),
      h('p', { text: 'Hot-seat for 2–4 players · full base game · pass and play' }),
    ]),
    saved ? h('div', { class: 'card' }, [
      h('div', { class: 'toggle-row' }, [
        h('span', { text: 'You have a game in progress.' }),
        h('button', { class: 'btn btn-primary btn-sm', text: '▶ Resume', on: { click: () => { state = saved; ui = { mode: 'idle', modal: null, rolling: false, logOpen: true }; applyTheme(saved.config.theme); render(); } } }),
      ]),
    ]) : null,
    h('div', { class: 'card' }, [
      h('h2', { text: 'Players' }),
      playerRows,
      h('div', { style: { marginTop: '.6rem' } }, [addBtn]),
    ]),
    h('div', { class: 'card' }, [
      h('h2', { text: 'Rules variant' }),
      seg([['standard', 'Standard — 10 VP'], ['quick', 'Quick Play — 8 VP'], ['works', 'The Works — 8 VP']], cfg.variant, (v) => { cfg.variant = v; renderSetup(); }),
      h('p', { class: 'hint', text: cfg.variant === 'works'
        ? 'The Works: 8 VP · 3 starting settlements each · +3 bonus resources · a free dev card · discard only above 9 cards.'
        : cfg.variant === 'quick'
          ? 'Quick Play: 8 VP and a small starting boost for a shorter game.'
          : 'Standard: the classic race to 10 victory points.' }),
    ]),
    h('div', { class: 'card' }, [
      h('h2', { text: 'Board & look' }),
      h('div', { class: 'field' }, [h('label', { text: 'Board layout' }), seg([['random', 'Random (balanced)'], ['beginner', 'Beginner (fixed)']], cfg.boardMode, (v) => { cfg.boardMode = v; renderSetup(); })]),
      h('div', { class: 'field' }, [h('label', { text: 'Theme' }), seg([['classic', 'Classic'], ['modern', 'Modern']], cfg.theme, (v) => { cfg.theme = v; renderSetup(); })]),
      hideToggle,
    ]),
    h('div', { class: 'setup__actions' }, [
      h('button', { class: 'btn btn-primary', text: '⚓ Start Game', on: { click: startGame } }),
    ]),
  ]);
  app.appendChild(setup);
}

function startGame() {
  state = createGame({
    players: cfg.players.map((p) => ({ name: p.name.trim() || undefined, color: p.color })),
    variant: cfg.variant, boardMode: cfg.boardMode, theme: cfg.theme, hideHands: cfg.hideHands,
    seed: Math.floor(Math.random() * 0x7fffffff),
  });
  ui = { mode: 'idle', modal: null, rolling: false, logOpen: true };
  applyTheme(cfg.theme);
  save(state);
  render();
}

// ---------- Boot ----------
function demoBoot(params) {
  const theme = params.get('theme') || 'classic';
  const d = params.get('demo');
  const variant = d === 'quick' ? 'quick' : d === 'works' ? 'works' : 'standard';
  let s = createGame({
    players: [{ name: 'Ann', color: 'red' }, { name: 'Bo', color: 'blue' }, { name: 'Cy', color: 'orange' }, { name: 'Di', color: 'violet' }],
    variant, boardMode: 'random', theme, seed: 20260714,
  });
  while (s.phase === 'setup') {
    const vId = legalSetupSettlementVertices(s)[0];
    s = applyAction(s, { type: 'placeSetupSettlement', vId });
    const eId = legalSetupRoadEdges(s, vId)[0];
    s = applyAction(s, { type: 'placeSetupRoad', eId });
  }
  s.players[s.current].resources = { brick: 2, lumber: 2, wool: 1, grain: 2, ore: 3 };
  state = s; ui = { mode: 'idle', modal: null, rolling: false, logOpen: true };
  const act = params.get('act'); // demo build-mode highlight for verification
  if (act) { state.phase = 'main'; state.lastRoll = 8; state.dice = [3, 5]; ui.mode = act; }
  applyTheme(theme); render();
  // Debug hook (demo only) for automated interaction tests.
  window.__catan = {
    getState: () => state, getUI: () => ui, dispatch,
    legalRoad: () => legalRoadEdges(state, state.current),
    setState: (patch) => { Object.assign(state, patch); render(); },
  };
}

function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) demoBoot(params);
  else renderSetup();
}
boot();
