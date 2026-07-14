// Peer-to-peer transport over WebRTC data channels with **manual** signalling — no
// server and no third-party service. Players copy/paste an "invite" code and an
// "answer" code to establish a direct connection. Topology is a star: the host holds
// one connection per joiner and relays game state.
//
// ICE uses no STUN by default (see ICE_SERVERS), so it works on the same local network
// (same Wi-Fi). Adding a STUN entry enables cross-internet play but would rely on an
// external service — left empty so nothing requires review to ship.

export const ICE_SERVERS = []; // e.g. [{ urls: 'stun:stun.l.google.com:19302' }] — needs review

const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const dec = (str) => JSON.parse(decodeURIComponent(escape(atob(str))));

function waitForIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, 4000); // safety: proceed with whatever candidates we have
  });
}

/**
 * Host side. Creates one peer connection per invite; seats are assigned in the order
 * data channels open (host is seat 0, joiners 1..3).
 */
export function createHost({ onPeerOpen, onPeerClose, onMessage } = {}) {
  const peers = [];
  let nextSeat = 1;

  async function createInvite() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dc = pc.createDataChannel('game');
    const peer = { pc, dc, seat: null, open: false };
    dc.onopen = () => {
      peer.open = true;
      if (peer.seat == null) peer.seat = nextSeat++;
      onPeerOpen && onPeerOpen(peer.seat);
    };
    dc.onclose = () => { peer.open = false; onPeerClose && onPeerClose(peer.seat); };
    dc.onmessage = (e) => onMessage && onMessage(peer.seat, JSON.parse(e.data));
    peers.push(peer);
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
    return { code: enc(pc.localDescription), peer };
  }

  async function acceptAnswer(peer, answerCode) {
    await peer.pc.setRemoteDescription(dec(answerCode));
  }

  function broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const p of peers) if (p.open) { try { p.dc.send(s); } catch { /* dropped */ } }
  }
  function sendTo(seat, msg) {
    const p = peers.find((x) => x.seat === seat);
    if (p && p.open) { try { p.dc.send(JSON.stringify(msg)); } catch { /* dropped */ } }
  }
  const openSeats = () => peers.filter((p) => p.open).map((p) => p.seat);

  return { createInvite, acceptAnswer, broadcast, sendTo, openSeats, peers };
}

/** Joiner side. One connection to the host. */
export function createClient({ onOpen, onClose, onMessage } = {}) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  let dc = null;
  pc.ondatachannel = (e) => {
    dc = e.channel;
    dc.onopen = () => onOpen && onOpen();
    dc.onclose = () => onClose && onClose();
    dc.onmessage = (ev) => onMessage && onMessage(JSON.parse(ev.data));
  };

  async function accept(offerCode) {
    await pc.setRemoteDescription(dec(offerCode));
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
    return enc(pc.localDescription);
  }
  function send(msg) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(msg)); }
  const isOpen = () => !!dc && dc.readyState === 'open';

  return { accept, send, isOpen };
}
