// Synthesized sound effects via the Web Audio API — no asset files, works offline.
// The AudioContext is created lazily on the first play (a user gesture), so browser
// autoplay policies are satisfied. A mute preference persists in localStorage.

const KEY = 'catan-muted-v1';
let ctx = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

function audio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// A single enveloped oscillator, optionally gliding in frequency.
function blip(ac, { freq, to = freq, dur = 0.15, type = 'sine', gain = 0.2, at = 0 }) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A short burst of filtered noise (for tumbles, thuds, swishes).
function noise(ac, { dur = 0.18, gain = 0.2, type = 'bandpass', freq = 1200, at = 0 }) {
  const t0 = ac.currentTime + at;
  const frames = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = type; filt.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const EFFECTS = {
  dice(ac) { noise(ac, { dur: 0.22, gain: 0.18, type: 'bandpass', freq: 1400 }); blip(ac, { freq: 220, to: 140, dur: 0.12, type: 'triangle', gain: 0.12, at: 0.16 }); },
  build(ac) { blip(ac, { freq: 150, to: 90, dur: 0.14, type: 'triangle', gain: 0.28 }); noise(ac, { dur: 0.06, gain: 0.12, type: 'lowpass', freq: 500 }); },
  dev(ac) { noise(ac, { dur: 0.16, gain: 0.14, type: 'highpass', freq: 2200 }); blip(ac, { freq: 520, to: 760, dur: 0.1, type: 'sine', gain: 0.12 }); },
  robber(ac) { blip(ac, { freq: 170, to: 70, dur: 0.38, type: 'sawtooth', gain: 0.18 }); },
  steal(ac) { blip(ac, { freq: 520, to: 180, dur: 0.16, type: 'square', gain: 0.14 }); },
  trade(ac) { blip(ac, { freq: 523, dur: 0.1, type: 'sine', gain: 0.18 }); blip(ac, { freq: 784, dur: 0.12, type: 'sine', gain: 0.18, at: 0.09 }); },
  win(ac) { [523, 659, 784, 1047].forEach((f, i) => blip(ac, { freq: f, dur: 0.16, type: 'triangle', gain: 0.2, at: i * 0.13 })); },
};

export function play(name) {
  if (muted) return;
  const ac = audio();
  if (!ac || !EFFECTS[name]) return;
  try { EFFECTS[name](ac); } catch { /* audio unavailable — ignore */ }
}
