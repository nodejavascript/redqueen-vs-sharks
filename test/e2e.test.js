// End-to-end tests: a real Chrome, the real page, the real WebGL, the real scoreboard — against the
// real server, started on a test port with its own data file so the live board is never touched.
//
// The unit suite proves the rules are arithmetic. This suite proves the *product*: that the start
// modal is on screen, that Play runs the wave and then hands over to the sharks, that P freezes the
// frame and mutes the music, that a shot scores, and that a score really is stored and read back by
// a second browser context — which is the whole promise of a shared board.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let browser;
let dataDir;

async function waitForServer(tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const response = await fetch(`${BASE}/api/scores`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the server never came up on ${BASE}`);
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'redqueen-e2e-'));
  server = spawn(process.execPath, [join(ROOT, 'server', 'server.js')], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), SCORES_FILE: join(dataDir, 'scores.json') },
  });
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
});

after(async () => {
  await browser?.close();
  server?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

/** A fresh browser context, so nothing like localStorage leaks between tests. */
async function openPage(query = '') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // `debug=1` exposes the live state to these tests; without it the game is as private as it is
  // for a player, which is the right default and the wrong thing to test against.
  const suffix = query ? `${query}&debug=1` : '?debug=1';
  await page.goto(`${BASE}/${suffix}`, { waitUntil: 'load' });
  return { page, context, errors };
}

/** Wait until the game says it has built its world (the title probe is set at the end of the first frame). */
async function waitReady(page) {
  await page.waitForFunction(() => /RQS READY|BOOT ERROR|RQS TEST|POSE|CLICK|SIM/.test(document.title), null, { timeout: 20000 });
  const title = await page.title();
  assert.ok(!/BOOT ERROR/.test(title), `the page failed to boot: ${title}`);
  return title;
}

/* ------------------------------------------------------------------ the shell */

test('the page arrives as this site, with the shell and no errors', async () => {
  const { page, context, errors } = await openPage();
  await waitReady(page);

  assert.equal(await page.title() === 'redqueen-vs-sharks-with-laser-beams-attached-to-their-heads.nodejavascript.com' || /RQS READY/.test(await page.title()), true);
  assert.equal(await page.locator('header.top .brand').isVisible(), true, 'the bar is on screen');
  assert.equal(await page.locator('footer.site-footer').isVisible(), true, 'the footer is on screen');
  assert.equal(await page.locator('footer.site-footer a[href="https://nodejavascript.com/"]').count(), 1);

  // Part 7: a deploy must be visible at once, so the shell is never cached.
  const response = await fetch(`${BASE}/`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);

  assert.deepEqual(errors, [], `the page logged errors: ${errors.join(' | ')}`);
  await context.close();
});

test('the readout card, the start modal and the score are all on screen at boot', async () => {
  const { page, context } = await openPage();
  await waitReady(page);

  assert.equal(await page.locator('#scr-title').isVisible(), true, 'the start modal is open');
  assert.equal(await page.locator('#btn-play').isVisible(), true);
  assert.equal(await page.locator('#btn-board').isVisible(), true);

  assert.equal(await page.locator('#score').isVisible(), true, 'the score is visible behind the modal');
  assert.equal(await page.locator('#sharks-left').isVisible(), true, 'the sharks-left pips are built');
  assert.equal(await page.locator('#lives').isVisible(), true, 'the queens are drawn');
  assert.equal(await page.locator('#lives .queen-pip').count(), 3, 'three lives, three crowns');
  assert.ok(await page.locator('#sharks-left .shark-pip').count() >= 3, 'level one has sharks to kill');
  await context.close();
});

/* ------------------------------------------------------------------ the start sequence */

test('Play runs the wave, then turns her round and lets the game begin', async () => {
  const { page, context } = await openPage();
  await waitReady(page);
  await page.locator('#btn-play').click();

  // The intro: she faces the camera, then turns. The phase is readable through the debug handle.
  await page.waitForFunction(() => window.RQ?.S?.phase === 'play' || window.RQ?.S?.phase === 'intro', null, { timeout: 10000 });
  await page.waitForFunction(() => window.RQ?.S?.phase === 'play', null, { timeout: 15000 });

  assert.equal(await page.locator('#scr-title').isVisible(), false, 'the modal is gone once she has turned');
  await context.close();
}, { timeout: 30000 });

test('the sharks start under the water and surface on their own', async () => {
  const { page, context } = await openPage('?play=1');
  await waitReady(page);
  await page.waitForFunction(() => window.RQ?.S?.phase === 'play', null, { timeout: 10000 });

  // Watch until one of them comes up. Measured over the real clock, not a fake one.
  await page.waitForFunction(
    () => (window.RQ?.sharks || []).some((s) => !s.dead && s.up01 > 0.9),
    null,
    { timeout: 25000 }
  );
  const surfaced = await page.evaluate(() => window.RQ.sharks.filter((s) => !s.dead && s.up01 > 0.9).length);
  assert.ok(surfaced >= 1, 'at least one head is out of the water');
  await context.close();
}, { timeout: 40000 });

/* ------------------------------------------------------------------ pause */

test('P freezes the frame and mutes the music; P again carries on', async () => {
  const { page, context } = await openPage('?play=1');
  await waitReady(page);
  await page.waitForFunction(() => window.RQ?.S?.phase === 'play', null, { timeout: 10000 });

  const t0 = await page.evaluate(() => window.RQ.S.time);
  await page.keyboard.press('p');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#pause').isVisible(), true, 'the paused badge is shown');
  const frozen = await page.evaluate(() => window.RQ.S.time);
  await page.waitForTimeout(900);
  const stillFrozen = await page.evaluate(() => window.RQ.S.time);
  assert.equal(stillFrozen, frozen, 'the clock does not advance while paused');
  assert.equal(await page.evaluate(() => window.RQ.music?.volume ?? 0), 0, 'the music is muted');

  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#pause').isVisible(), false, 'the badge goes when play resumes');
  const resumed = await page.evaluate(() => window.RQ.S.time);
  assert.ok(resumed > stillFrozen, 'and the clock is moving again');
  assert.ok(t0 <= resumed, 'time never runs backwards');
  assert.equal(await page.evaluate(() => window.RQ.music?.volume ?? 0), 0.5, 'the music returns at the slider volume');
  await context.close();
}, { timeout: 30000 });

test('a click while paused does not fire', async () => {
  const { page, context } = await openPage('?play=1');
  await waitReady(page);
  await page.waitForFunction(() => window.RQ?.S?.phase === 'play', null, { timeout: 10000 });

  await page.keyboard.press('p');
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => window.RQ.S.lastShot);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.RQ.S.lastShot), before, 'the shot was refused');
  await context.close();
}, { timeout: 30000 });

/* ------------------------------------------------------------------ scoring and the shared board */

test('a shark shot in the eye scores, and a kill counts toward the level', async () => {
  const { page, context } = await openPage('?test=1');
  await waitReady(page);
  await page.waitForFunction(() => /RQS TEST/.test(document.title), null, { timeout: 40000 });
  const title = await page.title();
  const score = Number((title.match(/score=(\d+)/) || [])[1]);
  const kills = Number((title.match(/kills=(\d+)/) || [])[1]);
  assert.ok(score > 0, `an eye shot must score (title says ${title})`);
  assert.ok(kills > 0, `and a shark must die (title says ${title})`);
  await context.close();
}, { timeout: 60000 });

test('the board stores a score and a second, separate browser reads it back', async () => {
  const write = await fetch(`${BASE}/api/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'QED', score: 4242 }),
  });
  assert.equal(write.status, 201);
  const written = await write.json();
  assert.ok(written.scores.some((s) => s.name === 'QED' && s.score === 4242), 'the POST answer already carries the row');

  // A brand-new context is a brand-new browser as far as the page is concerned.
  const { page, context } = await openPage();
  await waitReady(page);
  await page.locator('#btn-board').click();
  await page.waitForFunction(() => document.getElementById('scr-board')?.classList.contains('on'), null, { timeout: 10000 });
  await page.waitForFunction(
    () => /QED/.test(document.getElementById('boardBody')?.textContent || ''),
    null,
    { timeout: 15000 }
  );
  assert.match(await page.locator('#boardBody').innerText(), /QED/);
  assert.match(await page.locator('#boardStatus').innerText(), /live/i, 'the board says it is live');
  await context.close();
}, { timeout: 40000 });

test('the board refuses a bad name and a bad score', async () => {
  const refused = [
    { name: 'AB', score: 10 },        // too short
    { name: 'ABCD', score: 10 },      // too long
    { name: 'A1C', score: 10 },       // a digit is not an initial
    { name: '', score: 10 },          // empty
    { name: 'ABC', score: -1 },       // negative
    { name: 'ABC', score: 1.5 },      // fractional — refused, never rounded
    { name: 'ABC', score: 1e9 },      // out of range
  ];
  for (const body of refused) {
    const response = await fetch(`${BASE}/api/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400, `${JSON.stringify(body)} must be refused`);
  }
});

test('a lower-case name is normalised to the board\'s capitals, not refused', async () => {
  const response = await fetch(`${BASE}/api/scores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'abc', score: 7 }),
  });
  assert.equal(response.status, 201, 'typing lower case is not an error');
  const body = await response.json();
  assert.ok(body.scores.some((s) => s.name === 'ABC' && s.score === 7), 'and it is stored as capitals');
});

test('the board survives a restart, which is the only promise that matters', async () => {
  const before = await (await fetch(`${BASE}/api/scores`)).json();
  assert.ok(before.scores.some((s) => s.name === 'QED'), 'the row is there before the restart');

  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
  server = spawn(process.execPath, [join(ROOT, 'server', 'server.js')], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), SCORES_FILE: join(dataDir, 'scores.json') },
  });
  await waitForServer();

  const after = await (await fetch(`${BASE}/api/scores`)).json();
  assert.ok(after.scores.some((s) => s.name === 'QED' && s.score === 4242), 'the score is still there after a restart');
});
