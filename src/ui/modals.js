// Modal content builders. Each returns a `.modal` element; main.js wraps it in an
// overlay. Modals manage their own internal selection in the DOM and only call back
// (which dispatches + re-renders) at the terminal action.

import { h } from './dom.js';
import { C, portRate } from '../engine/index.js';
import { playableDevTypes } from './hud.js';

const RES = C.RESOURCES;
const RES_ICON = { brick: '🧱', lumber: '🌲', wool: '🐑', grain: '🌾', ore: '⛰️' };
const DEV_LABEL = {
  knight: '🛡️ Knight', roadBuilding: '🛣️ Road Building',
  yearOfPlenty: '🎁 Year of Plenty', monopoly: '💰 Monopoly',
};
const total = (p) => RES.reduce((a, r) => a + p.resources[r], 0);

function actions(kids) { return h('div', { class: 'modal__actions' }, kids); }

export function discardModal(state, { seat, onConfirm }) {
  const p = state.players[seat != null ? seat : state.pendingDiscards[0]];
  const need = Math.floor(total(p) / 2);
  const sel = Object.fromEntries(RES.map((r) => [r, 0]));
  const info = h('p', {});
  const confirm = h('button', { class: 'btn btn-primary', text: 'Discard' });
  const sum = () => RES.reduce((a, r) => a + sel[r], 0);
  const update = () => { info.textContent = `Selected ${sum()} / ${need}`; confirm.disabled = sum() !== need; };

  const picker = h('div', { class: 'res-picker' }, RES.map((r) => {
    const have = p.resources[r];
    const ct = h('span', { class: 'ct', text: `${sel[r]}/${have}` });
    const redraw = () => { ct.textContent = `${sel[r]}/${have}`; update(); };
    return h('div', { class: 'res-btn' }, [
      h('span', { class: 'ic', text: RES_ICON[r] }),
      h('div', { class: 'stepper' }, [
        h('button', { text: '−', on: { click: () => { if (sel[r] > 0) { sel[r]--; redraw(); } } } }),
        ct,
        h('button', { text: '+', on: { click: () => { if (sel[r] < have && sum() < need) { sel[r]++; redraw(); } } } }),
      ]),
    ]);
  }));
  confirm.addEventListener('click', () => onConfirm({ ...sel }));
  update();
  return h('div', { class: 'modal' }, [
    h('h2', { text: `${p.name}: discard ${need} cards` }),
    h('p', { text: 'A 7 was rolled — players over 7 cards discard half.' }),
    picker, info, actions([confirm]),
  ]);
}

export function stealModal(state, { onPick }) {
  return h('div', { class: 'modal' }, [
    h('h2', { text: 'Steal a card' }),
    h('p', { text: 'Choose a player next to the robber to rob (a random card is taken).' }),
    h('div', { class: 'res-picker' }, state.stealCandidates.map((pid) => {
      const p = state.players[pid];
      return h('button', { class: 'res-btn', on: { click: () => onPick(pid) } }, [
        h('span', { class: 'ic', text: '🎯' }),
        h('span', { text: p.name }),
        h('span', { class: 'ct', text: `${total(p)} cards` }),
      ]);
    })),
  ]);
}

export function resourcePickerModal({ title, desc, count, onConfirm }) {
  const sel = [];
  const info = h('p', {});
  const confirm = h('button', { class: 'btn btn-primary', text: 'Confirm', disabled: true });
  const chosen = h('div', { class: 'bank' });
  const update = () => {
    chosen.replaceChildren(...sel.map((r) => h('span', { class: 'chip' }, [h('span', { class: 'ic', text: RES_ICON[r] }), r])));
    info.textContent = `Chosen ${sel.length} / ${count}`;
    confirm.disabled = sel.length !== count;
  };
  const picker = h('div', { class: 'res-picker' }, RES.map((r) => h('button', {
    class: 'res-btn', on: { click: () => { if (sel.length < count) { sel.push(r); update(); } } },
  }, [h('span', { class: 'ic', text: RES_ICON[r] }), h('span', { class: 'ct', text: r })])));
  const reset = h('button', { class: 'btn btn-ghost btn-sm', text: 'Reset', on: { click: () => { sel.length = 0; update(); } } });
  confirm.addEventListener('click', () => onConfirm([...sel]));
  update();
  return h('div', { class: 'modal' }, [
    h('h2', { text: title }), h('p', { text: desc }), picker, chosen, info, actions([reset, confirm]),
  ]);
}

export function tradeModal(state, { onBankTrade, onOfferTrade, onClose }) {
  const me = state.players[state.current];
  // --- Bank trade ---
  let give = null; let get = null;
  const bankTradeBtn = h('button', { class: 'btn btn-primary', text: 'Trade with bank', disabled: true });
  const refreshBank = () => { bankTradeBtn.disabled = !(give && get && give !== get); };
  const giveRow = h('div', { class: 'res-picker' }, RES.map((r) => {
    const rate = portRate(state, me.id, r);
    const btn = h('button', {
      class: 'res-btn', on: { click: () => { give = r; for (const b of giveRow.children) b.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-pressed', 'true'); refreshBank(); } },
    }, [h('span', { class: 'ic', text: RES_ICON[r] }), h('span', { class: 'ct', text: `give ${rate}` })]);
    btn.disabled = me.resources[r] < rate;
    return btn;
  }));
  const getRow = h('div', { class: 'res-picker' }, RES.map((r) => {
    const btn = h('button', {
      class: 'res-btn', on: { click: () => { get = r; for (const b of getRow.children) b.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-pressed', 'true'); refreshBank(); } },
    }, [h('span', { class: 'ic', text: RES_ICON[r] }), h('span', { class: 'ct', text: 'get 1' })]);
    return btn;
  }));
  bankTradeBtn.addEventListener('click', () => { if (give && get) onBankTrade(give, get); });

  // --- Player trade ---
  const opponents = state.players.filter((p) => p.id !== me.id);
  let target = opponents[0]?.id ?? null;
  const giveSel = Object.fromEntries(RES.map((r) => [r, 0]));
  const getSel = Object.fromEntries(RES.map((r) => [r, 0]));
  const offerBtn = h('button', { class: 'btn btn-primary', text: 'Propose', disabled: true });
  const sumOf = (m) => RES.reduce((a, r) => a + m[r], 0);
  const refreshOffer = () => {
    const overlap = RES.some((r) => giveSel[r] > 0 && getSel[r] > 0);
    offerBtn.disabled = !(target != null && sumOf(giveSel) > 0 && sumOf(getSel) > 0 && !overlap);
  };
  const stepperRow = (label, map, capFn) => h('div', {}, [
    h('div', { class: 'hint', text: label }),
    h('div', { class: 'res-picker' }, RES.map((r) => {
      const ct = h('span', { class: 'ct', text: '0' });
      const redraw = () => { ct.textContent = String(map[r]); refreshOffer(); };
      return h('div', { class: 'res-btn' }, [
        h('span', { class: 'ic', text: RES_ICON[r] }),
        h('div', { class: 'stepper' }, [
          h('button', { text: '−', on: { click: () => { if (map[r] > 0) { map[r]--; redraw(); } } } }),
          ct,
          h('button', { text: '+', on: { click: () => { if (map[r] < capFn(r)) { map[r]++; redraw(); } } } }),
        ]),
      ]);
    })),
  ]);
  const opponentSeg = h('div', { class: 'seg' }, opponents.map((p) => {
    const b = h('button', { type: 'button', text: p.name, 'aria-pressed': String(p.id === target), on: { click: () => { target = p.id; for (const x of opponentSeg.children) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); refreshOffer(); } } });
    return b;
  }));
  offerBtn.addEventListener('click', () => onOfferTrade({
    to: target,
    give: Object.fromEntries(Object.entries(giveSel).filter(([, n]) => n > 0)),
    get: Object.fromEntries(Object.entries(getSel).filter(([, n]) => n > 0)),
  }));

  return h('div', { class: 'modal' }, [
    h('h2', { text: 'Trade' }),
    h('p', { text: 'Maritime rates improve with harbours (4:1 → 3:1 → 2:1).' }),
    h('div', {}, [h('div', { class: 'hint', text: 'You give' }), giveRow, h('div', { class: 'hint', text: 'You receive' }), getRow, actions([bankTradeBtn])]),
    h('hr', { style: { border: 'none', borderTop: '1px solid var(--panel-border)', margin: '.8rem 0' } }),
    opponents.length ? h('div', {}, [
      h('div', { class: 'hint', text: 'Player trade — pick a partner' }), opponentSeg,
      stepperRow('You give', giveSel, (r) => me.resources[r]),
      stepperRow('You receive', getSel, () => 9),
      actions([offerBtn]),
    ]) : null,
    actions([h('button', { class: 'btn btn-ghost', text: 'Close', on: { click: onClose } })]),
  ]);
}

export function offerResolveModal(state, { onResolve }) {
  const t = state.pendingTrade;
  const fmt = (m) => Object.entries(m).map(([r, n]) => `${n} ${RES_ICON[r]}`).join(' + ') || 'nothing';
  return h('div', { class: 'modal' }, [
    h('h2', { text: `Trade offer for ${state.players[t.to].name}` }),
    h('p', { html: `<strong>${state.players[t.from].name}</strong> gives <strong>${fmt(t.give)}</strong> and wants <strong>${fmt(t.get)}</strong>.` }),
    actions([
      h('button', { class: 'btn', text: 'Decline', on: { click: () => onResolve(false) } }),
      h('button', { class: 'btn btn-primary', text: 'Accept', on: { click: () => onResolve(true) } }),
    ]),
  ]);
}

export function playDevModal(state, { onPlay, onClose }) {
  const types = playableDevTypes(state);
  return h('div', { class: 'modal' }, [
    h('h2', { text: 'Play a development card' }),
    h('p', { text: 'You may play one development card per turn (not one bought this turn).' }),
    h('div', { class: 'res-picker' }, types.map((t) => h('button', {
      class: 'res-btn', on: { click: () => onPlay(t) },
    }, [h('span', { class: 'ic', text: DEV_LABEL[t].split(' ')[0] }), h('span', { class: 'ct', text: DEV_LABEL[t].split(' ').slice(1).join(' ') })]))),
    actions([h('button', { class: 'btn btn-ghost', text: 'Close', on: { click: onClose } })]),
  ]);
}

export function winModal(state, { onNewGame }) {
  const standings = state.players
    .map((p) => ({ name: p.name, pts: scoreFor(state, p.id) }))
    .sort((a, b) => b.pts - a.pts);
  const colors = ['#d64550', '#2d7dd2', '#f4a020', '#8c4fbf', '#35b06a', '#ffcf3f'];
  const confetti = h('div', { class: 'confetti-layer' }, Array.from({ length: 44 }, () => h('span', {
    class: 'confetti-piece',
    style: {
      left: `${Math.random() * 100}%`,
      background: colors[Math.floor(Math.random() * colors.length)],
      animationDuration: `${2.2 + Math.random() * 1.8}s`,
      animationDelay: `${Math.random() * 0.7}s`,
      transform: `rotate(${Math.random() * 360}deg)`,
    },
  })));
  return h('div', { class: 'modal win' }, [
    confetti,
    h('div', { class: 'confetti', text: '🏆' }),
    h('h2', { text: `${state.players[state.winner].name} wins!` }),
    h('ul', { class: 'standings' }, standings.map((s, i) => h('li', {}, [h('span', { text: `${i === 0 ? '🥇 ' : ''}${s.name}` }), h('span', { text: `${s.pts} ★` })]))),
    actions([h('button', { class: 'btn btn-primary', text: 'New Game', on: { click: onNewGame } })]),
  ]);
}

// Local score (buildings + awards + all VP cards revealed at game end).
function scoreFor(state, pid) {
  let pts = 0;
  for (const v of state.board.vertices) if (v.building && v.building.player === pid) pts += v.building.type === 'city' ? 2 : 1;
  if (state.awards.longestRoad === pid) pts += 2;
  if (state.awards.largestArmy === pid) pts += 2;
  pts += state.players[pid].dev.filter((c) => c.type === 'victoryPoint').length;
  return pts;
}
