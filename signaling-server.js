#!/usr/bin/env node
// Minimal self-hostable signalling relay for Catan's short room codes.
// Zero dependencies. It just stores transient WebRTC offer/answer blobs by path
// (Firebase-RTDB-style `GET/PUT ${base}/${path}.json`) so players connect with a short
// 9-letter code instead of copy/pasting the long connect code.
//
//   Run:   node signaling-server.js [port]      (default port 8787)
//   Then open the game with  ?sig=http://<THIS-MACHINE-LAN-IP>:8787
//   or paste that URL into the "Signaling URL" field on the setup screen.
//
// NOTE ON HTTPS: browsers block an HTTPS page (e.g. GitHub Pages) from calling an HTTP
// server (mixed content). So either (a) serve the GAME over http on your LAN too
// (`python3 -m http.server`) and use http for both, or (b) put this behind HTTPS.
// This is YOUR server — not a third-party service.

import http from 'node:http';
import os from 'node:os';

const PORT = Number(process.argv[2] || 8787);
const store = {};

const get = (parts) => { let c = store; for (const p of parts) { if (c == null) return null; c = c[p]; } return c === undefined ? null : c; };
const set = (parts, v) => {
  let c = store;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof c[parts[i]] !== 'object' || c[parts[i]] == null) c[parts[i]] = {}; c = c[parts[i]]; }
  c[parts[parts.length - 1]] = v;
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const path = new URL(req.url, 'http://x').pathname.replace(/^\//, '').replace(/\.json$/, '');
  const parts = path ? path.split('/') : [];
  if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(get(parts))); return; }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    const value = body ? JSON.parse(body) : null;
    if (req.method === 'PUT' || req.method === 'PATCH') set(parts, value);
    else if (req.method === 'DELETE') set(parts, null);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value));
  });
});

// Wipe stored rooms every 15 minutes so the relay stays tiny.
setInterval(() => { for (const k of Object.keys(store)) delete store[k]; }, 15 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Catan signalling relay on port ${PORT}`);
  for (const ip of ips) console.log(`  players use:  ?sig=http://${ip}:${PORT}`);
});
