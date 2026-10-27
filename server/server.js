// The whole server: the game's files, and one small API for the scoreboard.
//
// WHY this is one process and not two: a scoreboard is only shared if everybody writes to the same
// place, so the page and the board live on the same origin. No CORS, no second hostname to keep
// alive, and a deploy is one directory plus one restart.
//
// Storage is a JSON file, written atomically (write a temp file, then rename) with the previous copy
// kept as `.bak`. A half-written board is the one failure that would lose everyone's scores, and a
// rename is atomic on every filesystem this will ever run on.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validName, validScore } from '../site/rules.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const DATA = process.env.SCORES_FILE || join(ROOT, 'data', 'scores.json');
const PORT = Number(process.env.PORT || 4510);
const HOST = process.env.HOST || '127.0.0.1';

/* ------------------------------------------------------------------ the board */

const MAX_ROWS = 100;             // what the board keeps
const KEEP = 10;                  // what the page shows
let scores = [];

function loadBoard() {
  for (const file of [DATA, DATA + '.bak']) {
    try {
      const rows = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(rows)) {
        scores = rows.filter((r) => r && validName(r.name) && validScore(r.score)).slice(0, MAX_ROWS);
        if (file.endsWith('.bak')) console.warn(`[redqueen] scores.json was missing or damaged — recovered ${scores.length} rows from the backup`);
        return;
      }
    } catch {
      /* try the backup, then start empty */
    }
  }
  scores = [];
}

function saveBoard() {
  try {
    mkdirSync(dirname(DATA), { recursive: true });   // a fresh install has no data directory yet
    if (existsSync(DATA)) copyFileSync(DATA, DATA + '.bak');
    writeFileSync(DATA + '.tmp', JSON.stringify(scores, null, 2));
    renameSync(DATA + '.tmp', DATA);
  } catch (error) {
    console.error('[redqueen] could not write the board:', error.message);
  }
}

const rank = (a, b) => b.score - a.score || a.at - b.at;

function publicBoard() {
  return [...scores].sort(rank).slice(0, KEEP);
}

/* ------------------------------------------------------------------ static files */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'content-type': type,
    // A deploy must be visible at once — standard part 7. The board must never be cached either,
    // or a player sees somebody else's score and thinks their own did not save.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  res.end(body);
}

function serveFile(res, path) {
  const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
  const size = statSync(path).size;
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(path).pipe(res);
}

/* ------------------------------------------------------------------ the server */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://placeholder');
  const path = decodeURIComponent(url.pathname);

  if (path === '/api/scores' && req.method === 'GET') {
    return send(res, 200, JSON.stringify({ scores: publicBoard(), live: true }), 'application/json; charset=utf-8');
  }

  if (path === '/api/scores' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 2048) return send(res, 413, JSON.stringify({ error: 'too large' }), 'application/json; charset=utf-8');
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, JSON.stringify({ error: 'not json' }), 'application/json; charset=utf-8');
    }
    const name = String(body?.name ?? '').toUpperCase();
    // Not `Math.floor`: a fractional score is a client bug, and silently rounding it hides the bug
    // for ever while putting a number on the board nobody entered.
    const score = Number(body?.score);
    if (!validName(name)) return send(res, 400, JSON.stringify({ error: 'name must be three letters' }), 'application/json; charset=utf-8');
    if (!Number.isInteger(score) || !validScore(score)) return send(res, 400, JSON.stringify({ error: 'score must be a whole number in range' }), 'application/json; charset=utf-8');

    scores.push({ name, score, at: Date.now() });
    scores = scores.sort(rank).slice(0, MAX_ROWS);
    saveBoard();
    return send(res, 201, JSON.stringify({ scores: publicBoard(), live: true }), 'application/json; charset=utf-8');
  }

  if (path.startsWith('/api/')) return send(res, 404, JSON.stringify({ error: 'no such endpoint' }), 'application/json; charset=utf-8');

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');

  // No `.html` in a URL — standard part 1b. `/index.html` goes home, any other `.html` address goes
  // to the same path without the extension, permanently, so a link somebody already has still
  // works and simply arrives at the clean address. The origin enforces it as well as the edge
  // because a redirect that lives only in one place is a redirect that can be lost.
  if (/\.html?$/i.test(path)) {
    const clean = path.replace(/index\.html$/i, '').replace(/\.html?$/i, '');
    return send(res, 301, '', 'text/plain; charset=utf-8', { location: clean || '/' });
  }

  // And a clean path is served from the `.html` file it names.
  let file = path === '/' ? join(SITE, 'index.html') : join(SITE, normalize(path));
  if (!file.startsWith(SITE)) return send(res, 403, 'forbidden');
  if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');

  if (!existsSync(file)) {
    // A missing file is a 404 page, never a 502 — standard part 8a.
    return send(res, 404, '<!doctype html><title>404</title><h1>Not found</h1><p><a href="/">Red Queen vs. Laser Sharks</a></p>', 'text/html; charset=utf-8');
  }

  return serveFile(res, file);
});

loadBoard();
server.listen(PORT, HOST, () => {
  console.log(`[redqueen] http://${HOST}:${PORT}  ·  ${scores.length} scores on file  ·  data ${DATA}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    saveBoard();
    server.close(() => process.exit(0));
  });
}
