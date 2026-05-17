#!/usr/bin/env node
/**
 * dev-server.js — local dev server with /api/* proxy to Railway
 * Run: npm run dev (or node scripts/dev-server.js [port])
 * Open: http://localhost:3000/player.html
 */
'use strict';
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT    = parseInt(process.argv[2]) || 3000;
const BACKEND = 'pocketbooks-sports-backend-production.up.railway.app';
const ROOT    = path.resolve(__dirname, '..');

const MIME = {
  '.html':'.css','.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ico':'image/x-icon'
};
// Fix mime map
const MIME2 = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache', 'Expires': '0'
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);

  // /api/* → proxy to Railway
  if (parsed.pathname.startsWith('/api/')) {
    const opts = {
      hostname: BACKEND, port: 443, path: req.url,
      method: req.method,
      headers: { ...req.headers, host: BACKEND }
    };
    const proxy = https.request(opts, br => {
      res.writeHead(br.statusCode, { ...br.headers, 'access-control-allow-origin': '*' });
      br.pipe(res);
    });
    proxy.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    req.pipe(proxy);
    return;
  }

  // Static files
  let p = parsed.pathname === '/' ? '/player.html' : parsed.pathname;
  const filePath = path.join(ROOT, p);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + p); return; }
    const headers = { 'Content-Type': MIME2[ext] || 'text/plain', ...NO_CACHE };
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n  🏈 PocketBooks Sports — Dev Server');
  console.log('  ─────────────────────────────────────');
  console.log(`  player:   http://localhost:${PORT}/player.html`);
  console.log(`  host:     http://localhost:${PORT}/index.html`);
  console.log(`  dev:      http://localhost:${PORT}/dev.html`);
  console.log(`  grading:  http://localhost:${PORT}/grading-test.html`);
  console.log(`  admin:    http://localhost:${PORT}/admin.html?preview=1`);
  console.log(`  API:      /api/* → ${BACKEND}`);
  console.log(`  SHA:      see build.json`);
  console.log('');
});
