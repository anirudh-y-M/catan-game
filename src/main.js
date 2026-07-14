// App orchestrator: setup, lobbies (local + online P2P), game render loop, board
// interaction, modal sync, and host-authoritative networking.

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
import { createHost, createClient } from './ui/net.js';
import {
  signalingEnabled, generateRoomCode, formatRoomCode, hostRoom, joinRoom,
} from './ui/signaling.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const app = document.getElementById('app');

let state = null;
let ui = { mode: 'idle', modal: null, rolling: false, logOpen: true, costsOpen: true };
let modalEl = null;
let online = null;   // { role:'host'|'client', seat, host?, client? }
let hostState = null; // host lobby state
let joinState = null; // joiner lobby state
let uiTheme = (() => { try { return localStorage.getItem('catan-theme') || 'classic'; } catch { return 'classic'; } })();
const freshUi = () => ({ mode: 'idle', modal: null, rolling: false, logOpen: true, costsOpen: true });

// ---------- Turn/authority helpers ----------
const activeSeat = () => (state.phase === 'setup' ? state.setup.order[state.setup.pointer] : state.current);
const localSeat = () => (online ? online.seat : state.current);
const myTurn = () => !online || activeSeat() === online.seat;

// Is `seat` allowed to perform `action` given the state? (host authority)
function authorize(st, seat, action) {
  const t = action.type;
  if (t === 'discard') return action.playerId === seat;
  if (t === 'resolvePlayerTrade') return !!st.pendingTrade && st.pendingTrade.to === seat;
  if (st.phase === 'setup') return st.setup.order[st.setup.pointer] === seat;
  return st.current === seat;
}

// ---------- Dispatch ----------
function dispatch(action) {
  if (online && online.role === 'client') { online.client.send({ t: 'intent', action }); return; }
  if (online && online.role === 'host' && !authorize(state, 0, action)) return; // host acts as seat 0
  if (action.type === 'rollDice' && !ui.rolling) {
    ui.rolling = true; play('dice'); render();
    setTimeout(() => { ui.rolling = false; applyAndRender(action); }, 450);
    return;
  }
  applyAndRender(action);
}

function applyAndRender(action) {
  try { state = applyAction(state, action); } catch (e) { console.warn('rejected', action.type, e.message); return; }
  if (!online) save(state);
  if (action.type === 'buildRoad') ui.mode = state.freeRoads > 0 ? 'buildRoad' : 'idle';
  else if (action.type === 'buildSettlement' || action.type === 'buildCity') ui.mode = 'idle';
  playFor(action);
  if (online && online.role === 'host') online.host.broadcast({ t: 'state', state });
  render();
}

// Host: apply an authorized action that arrived from a remote seat.
function hostApply(seat, action) { if (authorize(state, seat, action)) applyAndRender(action); }

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
const toggleCosts = () => { ui.costsOpen = !ui.costsOpen; render(); };
const openTrade = () => { ui.modal = 'trade'; render(); };
const openPlay = () => { ui.modal = 'play'; render(); };
const setTheme = (t) => { uiTheme = t; try { localStorage.setItem('catan-theme', t); } catch { /* ignore */ } applyTheme(t); state ? render() : renderSetup(); };

function teardownOnline() {
  if (hostState && hostState.roomCtrl) hostState.roomCtrl.stop();
  online = null; hostState = null; joinState = null;
}
function newGame() { clearSave(); teardownOnline(); state = null; ui = freshUi(); removeModal(); renderSetup(); }

function onPlayDev(type) {
  ui.modal = null;
  if (type === 'knight') dispatch({ type: 'playKnight' });
  else if (type === 'roadBuilding') { ui.mode = 'buildRoad'; dispatch({ type: 'playRoadBuilding' }); }
  else if (type === 'yearOfPlenty') { ui.modal = 'yearOfPlenty'; render(); }
  else if (type === 'monopoly') { ui.modal = 'monopoly'; render(); }
}

// ---------- Board interaction ----------
function pickFor() {
  if (online && !myTurn()) return {};
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
  const seat = localSeat();
  const mine = !online;
  let content = null; let dismissable = false;
  if (state.phase === 'gameOver') content = winModal(state, { onNewGame: newGame });
  else if (state.phase === 'discard') {
    const dseat = online ? seat : state.pendingDiscards[0];
    if (dseat != null && state.pendingDiscards.includes(dseat)) {
      content = discardModal(state, { seat: dseat, onConfirm: (cards) => dispatch({ type: 'discard', playerId: dseat, cards }) });
    }
  } else if (state.phase === 'steal' && (mine || state.current === seat)) {
    content = stealModal(state, { onPick: (pid) => dispatch({ type: 'steal', targetPlayerId: pid }) });
  } else if (state.pendingTrade && (mine || state.pendingTrade.to === seat)) {
    content = offerResolveModal(state, { onResolve: (accept) => dispatch({ type: 'resolvePlayerTrade', accept }) });
  } else if (ui.modal === 'trade') {
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
  applyTheme(uiTheme);
  const ctx = {
    ui, dispatch, setMode, openTrade, openPlay, newGame, setTheme,
    muted: isMuted(), toggleSound, toggleLog, toggleCosts,
    theme: uiTheme, online: !!online, localSeat: localSeat(), myTurn: myTurn(),
  };
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

// ================= Networking glue =================
function copyText(text) { try { navigator.clipboard.writeText(text); } catch { /* fallback: manual select */ } }

function startHosting() {
  const host = createHost({
    onPeerOpen: () => renderHostLobby(),
    onPeerClose: (seat) => { if (hostState) hostState.players = hostState.players.filter((p) => p.seat !== seat); if (online) render(); else renderHostLobby(); },
    onMessage: (seat, msg) => hostOnMessage(seat, msg),
  });
  hostState = { host, players: [{ seat: 0, name: (cfg.onlineName || 'Host').trim() }], invite: null, pendingPeer: null, generating: false, room: null, roomCtrl: null, error: null };
  if (signalingEnabled()) {
    const code = generateRoomCode();
    hostState.room = { code };
    hostState.roomCtrl = hostRoom(host, code, { onError: (e) => { hostState.error = String(e.message || e); renderHostLobby(); } });
  }
  renderHostLobby();
}
function hostOnMessage(seat, msg) {
  if (msg.t === 'hello') {
    const existing = hostState.players.find((p) => p.seat === seat);
    if (existing) existing.name = msg.name || existing.name;
    else hostState.players.push({ seat, name: msg.name || `Player ${seat + 1}` });
    if (online) { online.host.sendTo(seat, { t: 'welcome', seat }); online.host.sendTo(seat, { t: 'state', state }); render(); }
    else renderHostLobby();
  } else if (msg.t === 'intent') {
    hostApply(seat, msg.action);
  }
}
async function hostCreateInvite() {
  hostState.generating = true; renderHostLobby();
  const { code, peer } = await hostState.host.createInvite();
  hostState.invite = { code }; hostState.pendingPeer = peer; hostState.generating = false;
  renderHostLobby();
}
async function hostAcceptAnswer(answerText) {
  if (!hostState.pendingPeer || !answerText) return;
  try { await hostState.host.acceptAnswer(hostState.pendingPeer, answerText.trim()); }
  catch { hostState.error = 'That answer code did not work — try again.'; renderHostLobby(); return; }
  hostState.invite = null; hostState.pendingPeer = null; hostState.error = null;
  renderHostLobby();
}
function hostStartGame() {
  if (hostState.roomCtrl) hostState.roomCtrl.stop();
  const seats = hostState.players.slice().sort((a, b) => a.seat - b.seat);
  state = createGame({
    players: seats.map((p, i) => ({ name: p.name, color: C.PLAYER_COLORS[i].id })),
    variant: cfg.variant, boardMode: cfg.boardMode, theme: uiTheme,
    seed: Math.floor(Math.random() * 0x7fffffff),
  });
  online = { role: 'host', seat: 0, host: hostState.host };
  for (const p of seats) if (p.seat !== 0) online.host.sendTo(p.seat, { t: 'welcome', seat: p.seat });
  online.host.broadcast({ t: 'state', state });
  ui = freshUi();
  render();
}

function startJoining() {
  const client = createClient({
    onOpen: () => { joinState.client.send({ t: 'hello', name: (cfg.onlineName || 'Player').trim() }); joinState.connected = true; if (!online) renderJoinFlow(); },
    onClose: () => { if (joinState) joinState.connected = false; if (!online) renderJoinFlow(); },
    onMessage: (msg) => clientOnMessage(msg),
  });
  joinState = { client, answer: null, connected: false, seat: null, generating: false, error: null, room: signalingEnabled() };
  renderJoinFlow();
}
async function joinByCode(rawCode) {
  const code = (rawCode || '').trim();
  if (!code) return;
  joinState.generating = true; joinState.error = null; renderJoinFlow();
  try { await joinRoom(joinState.client, code, (cfg.onlineName || 'Player').trim()); }
  catch (e) { joinState.error = String(e.message || e); }
  joinState.generating = false; renderJoinFlow();
}
function clientOnMessage(msg) {
  if (msg.t === 'welcome') { joinState.seat = msg.seat; if (online) online.seat = msg.seat; }
  else if (msg.t === 'state') {
    const prev = state;
    state = msg.state;
    if (!online) { online = { role: 'client', seat: joinState.seat ?? 0, client: joinState.client }; ui = freshUi(); }
    if (prev && state.lastRoll !== prev.lastRoll && state.lastRoll != null) play('dice');
    if (prev && state.winner != null && prev.winner == null) play('win');
    render();
  }
}
async function joinGenerateAnswer(offerText) {
  if (!offerText) return;
  joinState.generating = true; joinState.error = null; renderJoinFlow();
  try { joinState.answer = await joinState.client.accept(offerText.trim()); }
  catch { joinState.error = 'That invite code did not work — check you copied all of it.'; }
  joinState.generating = false; renderJoinFlow();
}

// ---------- Setup + lobby screens ----------
const cfg = {
  players: [{ name: 'Player 1', color: 'red' }, { name: 'Player 2', color: 'blue' }],
  variant: 'standard', boardMode: 'random', hideHands: false,
  mode: 'local', onlineName: 'Player 1',
};

function seg(options, value, onPick) {
  return h('div', { class: 'seg' }, options.map(([val, label]) => h('button', {
    type: 'button', text: label, 'aria-pressed': String(value === val), on: { click: () => onPick(val) },
  })));
}
function variantCard() {
  return h('div', { class: 'card' }, [
    h('h2', { text: 'Rules variant' }),
    seg([['standard', 'Standard — 10 VP'], ['quick', 'Quick Play — 8 VP'], ['works', 'The Works — 8 VP']], cfg.variant, (v) => { cfg.variant = v; renderSetup(); }),
    h('p', { class: 'hint', text: cfg.variant === 'works'
      ? 'The Works: 8 VP · 3 starting settlements each · +3 bonus resources · a free dev card · discard only above 9 cards.'
      : cfg.variant === 'quick' ? 'Quick Play: 8 VP and a small starting boost for a shorter game.'
        : 'Standard: the classic race to 10 victory points.' }),
  ]);
}
function lookCard(includeHide) {
  return h('div', { class: 'card' }, [
    h('h2', { text: 'Board & look' }),
    h('div', { class: 'field' }, [h('label', { text: 'Board layout' }), seg([['random', 'Random (balanced)'], ['beginner', 'Beginner (fixed)']], cfg.boardMode, (v) => { cfg.boardMode = v; renderSetup(); })]),
    h('div', { class: 'field' }, [h('label', { text: 'Theme' }), seg([['classic', 'Classic'], ['modern', 'Modern']], uiTheme, (v) => setTheme(v))]),
    includeHide ? h('label', { class: 'toggle-row' }, [
      h('span', { text: 'Hide opponents’ hands between turns' }),
      h('input', { type: 'checkbox', checked: cfg.hideHands, on: { change: (e) => { cfg.hideHands = e.target.checked; } } }),
    ]) : null,
  ]);
}
function modeCard() {
  return h('div', { class: 'card' }, [
    h('h2', { text: 'Play mode' }),
    seg([['local', '📱 Local (pass & play)'], ['host', '🌐 Host online'], ['join', '🔗 Join online']], cfg.mode, (v) => { cfg.mode = v; renderSetup(); }),
    cfg.mode !== 'local' ? h('p', { class: 'hint', text: signalingEnabled()
      ? 'Online with short room codes (a signaling service is configured).'
      : 'Online is peer-to-peer over the same Wi-Fi — no server. Exchange a connect code with each player.' }) : null,
  ]);
}
function nameCard() {
  return h('div', { class: 'card' }, [
    h('div', { class: 'field' }, [h('label', { text: 'Your name' }), h('input', { type: 'text', value: cfg.onlineName, on: { input: (e) => { cfg.onlineName = e.target.value; } } })]),
  ]);
}

function renderSetup() {
  applyTheme(uiTheme);
  clear(app);
  const saved = load();
  const hero = h('div', { class: 'setup__hero' }, [
    h('h1', { html: '<span class="anchor">⚓</span> Catan' }),
    h('p', { text: '2–4 players · full base game · local or online' }),
  ]);

  let body;
  if (cfg.mode === 'local') {
    const takenColors = new Set(cfg.players.map((p) => p.color));
    const playerRows = h('div', { class: 'player-rows' }, cfg.players.map((pl, i) => h('div', { class: 'player-row' }, [
      h('input', { type: 'text', value: pl.name, 'aria-label': `Player ${i + 1} name`, on: { input: (e) => { cfg.players[i].name = e.target.value; } } }),
      h('div', { class: 'color-picker' }, C.PLAYER_COLORS.map((c) => h('button', {
        class: 'swatch', title: c.label, style: { background: c.hex }, 'aria-pressed': String(pl.color === c.id),
        disabled: c.id !== pl.color && takenColors.has(c.id),
        on: { click: () => { cfg.players[i].color = c.id; renderSetup(); } },
      }))),
      cfg.players.length > 2 ? h('button', { class: 'row-remove', title: 'Remove', text: '×', on: { click: () => { cfg.players.splice(i, 1); renderSetup(); } } }) : null,
    ])));
    const addBtn = cfg.players.length < 4 ? h('button', {
      class: 'btn btn-sm btn-ghost', text: '+ Add player',
      on: { click: () => { const free = C.PLAYER_COLORS.find((c) => !takenColors.has(c.id)); cfg.players.push({ name: `Player ${cfg.players.length + 1}`, color: free.id }); renderSetup(); } },
    }) : null;
    body = [
      saved ? h('div', { class: 'card' }, [h('div', { class: 'toggle-row' }, [
        h('span', { text: 'You have a game in progress.' }),
        h('button', { class: 'btn btn-primary btn-sm', text: '▶ Resume', on: { click: () => { state = saved; online = null; uiTheme = saved.config.theme || uiTheme; ui = freshUi(); render(); } } }),
      ])]) : null,
      h('div', { class: 'card' }, [h('h2', { text: 'Players' }), playerRows, h('div', { style: { marginTop: '.6rem' } }, [addBtn])]),
      variantCard(), lookCard(true),
      h('div', { class: 'setup__actions' }, [h('button', { class: 'btn btn-primary', text: '⚓ Start Game', on: { click: startGame } })]),
    ];
  } else if (cfg.mode === 'host') {
    body = [
      nameCard(), variantCard(), lookCard(false),
      h('div', { class: 'setup__actions' }, [h('button', { class: 'btn btn-primary', text: '🌐 Create online game', on: { click: startHosting } })]),
    ];
  } else {
    body = [
      nameCard(),
      h('div', { class: 'setup__actions' }, [h('button', { class: 'btn btn-primary', text: '🔗 Join a game', on: { click: startJoining } })]),
    ];
  }

  app.appendChild(h('div', { class: 'setup' }, [hero, modeCard(), ...body]));
}

function renderHostLobby() {
  applyTheme(uiTheme);
  clear(app);
  const s = hostState;
  const players = s.players.slice().sort((a, b) => a.seat - b.seat);
  let connectCard = null;
  if (s.room) {
    // Short room-code mode (signaling service configured).
    connectCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Room code' }),
      h('p', { text: 'Share this code. Players pick “Join online”, type it, and connect automatically.' }),
      h('div', { class: 'room-code', text: formatRoomCode(s.room.code) }),
      h('button', { class: 'btn btn-sm', text: 'Copy code', on: { click: () => copyText(formatRoomCode(s.room.code)) } }),
      s.error ? h('p', { class: 'hint', text: s.error }) : null,
    ]);
  } else if (players.length < 4) {
    // Serverless copy/paste mode.
    connectCard = h('div', { class: 'card' }, [
      h('h2', { text: 'Invite a player' }),
      s.invite ? h('div', {}, [
        h('div', { class: 'field' }, [
          h('label', { text: '1) Send this invite code to the player' }),
          h('textarea', { class: 'code', readonly: true, rows: 3, value: s.invite.code }),
          h('button', { class: 'btn btn-sm', text: 'Copy invite', on: { click: () => copyText(s.invite.code) } }),
        ]),
        h('div', { class: 'field' }, [
          h('label', { text: '2) Paste the answer code they send back' }),
          h('textarea', { class: 'code', id: 'answerBox', rows: 3, placeholder: 'Paste answer code…' }),
          h('button', { class: 'btn btn-primary btn-sm', text: 'Connect player', on: { click: () => hostAcceptAnswer(document.getElementById('answerBox').value) } }),
        ]),
      ]) : h('button', { class: 'btn btn-primary', disabled: s.generating, text: s.generating ? 'Generating…' : 'Generate invite code', on: { click: hostCreateInvite } }),
      s.error ? h('p', { class: 'hint', text: s.error }) : null,
    ]);
  }

  app.appendChild(h('div', { class: 'setup' }, [
    h('div', { class: 'setup__hero' }, [h('h1', { html: '<span class="anchor">⚓</span> Host online' }), h('p', { text: s.room ? 'Share your room code with each player' : 'Same Wi-Fi · share the invite code with each player' })]),
    h('div', { class: 'card' }, [
      h('h2', { text: `Players (${players.length}/4)` }),
      h('div', { class: 'player-rows' }, players.map((p) => h('div', { class: 'player-row' }, [
        h('span', { text: `Seat ${p.seat + 1}: ${p.name}${p.seat === 0 ? ' — you (host)' : ''}` }),
      ]))),
    ]),
    connectCard,
    h('div', { class: 'setup__actions' }, [
      h('button', { class: 'btn btn-ghost', text: '← Back', on: { click: () => { teardownOnline(); renderSetup(); } } }),
      h('button', { class: 'btn btn-primary', disabled: players.length < 2, text: `Start Game (${players.length})`, on: { click: hostStartGame } }),
    ]),
  ]));
}

function renderJoinFlow() {
  applyTheme(uiTheme);
  clear(app);
  const s = joinState;
  let connectCard;
  if (s.connected) {
    connectCard = h('div', { class: 'card' }, [h('h2', { text: '✅ Connected!' }), h('p', { text: 'Waiting for the host to start the game…' })]);
  } else if (s.room) {
    // Short room-code mode.
    connectCard = h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [
        h('label', { text: 'Room code' }),
        h('input', { type: 'text', id: 'codeBox', placeholder: 'ABC-DEF-GHI', autocapitalize: 'characters' }),
        h('button', { class: 'btn btn-primary btn-sm', disabled: s.generating, text: s.generating ? 'Connecting…' : 'Join', on: { click: () => joinByCode(document.getElementById('codeBox').value) } }),
      ]),
      s.error ? h('p', { class: 'hint', text: s.error }) : null,
    ]);
  } else {
    // Serverless copy/paste mode.
    connectCard = h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [
        h('label', { text: '1) Paste the host’s invite code' }),
        h('textarea', { class: 'code', id: 'offerBox', rows: 3, placeholder: 'Paste invite code…' }),
        h('button', { class: 'btn btn-primary btn-sm', disabled: s.generating, text: s.generating ? 'Generating…' : 'Generate my answer', on: { click: () => joinGenerateAnswer(document.getElementById('offerBox').value) } }),
      ]),
      s.answer ? h('div', { class: 'field' }, [
        h('label', { text: '2) Send this answer code back to the host' }),
        h('textarea', { class: 'code', readonly: true, rows: 3, value: s.answer }),
        h('button', { class: 'btn btn-sm', text: 'Copy answer', on: { click: () => copyText(s.answer) } }),
        h('p', { class: 'hint', text: 'Then wait — the game begins when the host starts it.' }),
      ]) : null,
      s.error ? h('p', { class: 'hint', text: s.error }) : null,
    ]);
  }
  app.appendChild(h('div', { class: 'setup' }, [
    h('div', { class: 'setup__hero' }, [h('h1', { html: '<span class="anchor">⚓</span> Join online' }), h('p', { text: s.room ? 'Enter the host’s room code' : 'Exchange connect codes with the host' })]),
    nameCard(),
    connectCard,
    h('div', { class: 'setup__actions' }, [h('button', { class: 'btn btn-ghost', text: '← Back', on: { click: () => { teardownOnline(); renderSetup(); } } })]),
  ]));
}

function startGame() {
  state = createGame({
    players: cfg.players.map((p) => ({ name: p.name.trim() || undefined, color: p.color })),
    variant: cfg.variant, boardMode: cfg.boardMode, theme: uiTheme, hideHands: cfg.hideHands,
    seed: Math.floor(Math.random() * 0x7fffffff),
  });
  online = null; ui = freshUi(); applyTheme(uiTheme); save(state); render();
}

// ---------- Boot ----------
function demoBoot(params) {
  uiTheme = params.get('theme') || 'classic';
  const d = params.get('demo');
  const variant = d === 'quick' ? 'quick' : d === 'works' ? 'works' : 'standard';
  let s = createGame({
    players: [{ name: 'Ann', color: 'red' }, { name: 'Bo', color: 'blue' }, { name: 'Cy', color: 'orange' }, { name: 'Di', color: 'violet' }],
    variant, boardMode: 'random', theme: uiTheme, seed: 20260714,
  });
  while (s.phase === 'setup') {
    const vId = legalSetupSettlementVertices(s)[0];
    s = applyAction(s, { type: 'placeSetupSettlement', vId });
    s = applyAction(s, { type: 'placeSetupRoad', eId: legalSetupRoadEdges(s, vId)[0] });
  }
  s.players[s.current].resources = { brick: 2, lumber: 2, wool: 1, grain: 2, ore: 3 };
  state = s; online = null; ui = freshUi();
  const act = params.get('act');
  if (act) { state.phase = 'main'; state.lastRoll = 8; state.dice = [3, 5]; ui.mode = act; }
  render();
  window.__catan = {
    getState: () => state, getUI: () => ui, dispatch,
    legalRoad: () => legalRoadEdges(state, state.current),
    setState: (patch) => { Object.assign(state, patch); render(); },
  };
}

function boot() {
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) { demoBoot(params); return; }
  renderSetup();
  if (params.has('debug')) {
    // Hooks for automated online integration tests.
    window.__net = {
      startHosting, hostCreateInvite, hostAcceptAnswer, hostStartGame,
      startJoining, joinGenerateAnswer, joinByCode,
      roomCode: () => hostState && hostState.room && hostState.room.code,
      invite: () => hostState && hostState.invite && hostState.invite.code,
      answer: () => joinState && joinState.answer,
      connected: () => !!(joinState && joinState.connected),
      online: () => online && { role: online.role, seat: online.seat },
      state: () => state, dispatch,
      legalSetup: () => legalSetupSettlementVertices(state),
      legalSetupRoad: (v) => legalSetupRoadEdges(state, v),
    };
  }
}
boot();
