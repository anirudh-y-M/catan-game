// Optional signaling for SHORT room codes (XXX-XXX-XXX). This relays the WebRTC
// offer/answer through a small REST key-value store (Firebase Realtime Database's REST
// API, or any compatible `${base}/${path}.json` GET/PUT endpoint).
//
// IMPORTANT: this uses a THIRD-PARTY SERVICE. Per Mercari policy it may require the
// internal "External Service Review" before use. It is therefore DISABLED unless a base
// URL is configured (SIGNALING_URL below, a `?sig=` URL param, or localStorage
// `catan-sig`). With nothing configured the app falls back to serverless copy/paste P2P.

export const SIGNALING_URL = ''; // e.g. 'https://your-project-default-rtdb.firebaseio.com'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
const rid = () => Math.random().toString(36).slice(2, 10);

export function generateRoomCode() {
  let s = '';
  for (let i = 0; i < 9; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
export function normalizeRoomCode(c) { return (c || '').toUpperCase().replace(/[^A-Z]/g, ''); }
export function formatRoomCode(c) {
  const n = normalizeRoomCode(c);
  return (n.match(/.{1,3}/g) || [n]).join('-');
}

export function signalingBase() {
  let base = SIGNALING_URL;
  try {
    const p = new URLSearchParams(location.search);
    base = p.get('sig') || SIGNALING_URL || localStorage.getItem('catan-sig') || '';
  } catch { /* ignore */ }
  return (base || '').replace(/\/+$/, '');
}
export function signalingEnabled() { return !!signalingBase(); }

async function sigGet(path) {
  const r = await fetch(`${signalingBase()}/${path}.json`);
  if (!r.ok) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function sigPut(path, data) {
  await fetch(`${signalingBase()}/${path}.json`, { method: 'PUT', body: JSON.stringify(data) });
}

/**
 * Host side: publish the room, then for each joiner create a fresh offer, publish it,
 * and adopt their answer — reusing the manual-mode host connection object.
 */
export function hostRoom(hostObj, rawCode, { onError } = {}) {
  const code = normalizeRoomCode(rawCode);
  const handled = new Set();
  let running = true;
  (async () => {
    try {
      await sigPut(`rooms/${code}/host`, { ts: Date.now() });
      while (running) {
        const joiners = (await sigGet(`rooms/${code}/joiners`)) || {};
        for (const jid of Object.keys(joiners)) {
          if (handled.has(jid)) continue;
          handled.add(jid);
          const { code: offer, peer } = await hostObj.createInvite();
          await sigPut(`rooms/${code}/offers/${jid}`, offer);
          (async () => {
            for (let i = 0; i < 180 && running; i++) {
              const answer = await sigGet(`rooms/${code}/answers/${jid}`);
              if (answer) { try { await hostObj.acceptAnswer(peer, answer); } catch { /* retry next */ } return; }
              await sleep(1000);
            }
          })();
        }
        await sleep(1200);
      }
    } catch (e) { onError && onError(e); }
  })();
  return { code, stop: () => { running = false; } };
}

/** Joiner side: register under the code, wait for the host's offer, publish the answer. */
export async function joinRoom(clientObj, rawCode, name) {
  const code = normalizeRoomCode(rawCode);
  if (!(await sigGet(`rooms/${code}/host`))) throw new Error('Room not found — check the code.');
  const jid = rid();
  await sigPut(`rooms/${code}/joiners/${jid}`, { name });
  let offer = null;
  for (let i = 0; i < 180; i++) { offer = await sigGet(`rooms/${code}/offers/${jid}`); if (offer) break; await sleep(1000); }
  if (!offer) throw new Error('The host did not respond.');
  await sigPut(`rooms/${code}/answers/${jid}`, await clientObj.accept(offer));
  return jid;
}
