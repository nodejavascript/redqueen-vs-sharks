// Static tests: the page and the files, read off disk. No browser, no server, no network.
//
// These are the house standard's rules, made executable: the title IS the host, the bar carries the
// brand home, the footer names the family and this site's own source, no URL a visitor sees ends in
// `.html`, the page loads nothing from another origin, and every id the script reaches for exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, '..', 'site');
const read = (name) => readFileSync(join(SITE, name), 'utf8');

const HOST = 'redqueen-vs-sharks-with-laser-beams-attached-to-their-heads.nodejavascript.com';
const html = read('index.html');
const game = read('game.js');

/* ------------------------------------------------------------------ part 1: the title IS the host */

test('the document title is the full hostname and nothing else', () => {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  assert.equal(title, HOST, 'part 1 of the site standard: the title IS the domain, not a description of it');
});

test('the hostname is a legal DNS label', () => {
  const label = HOST.split('.')[0];
  assert.ok(label.length <= 63, `the label is ${label.length} characters; DNS allows 63`);
  assert.match(label, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'lower case, digits and inner hyphens only');
  assert.ok(HOST.length <= 253, 'the whole name fits in 253 characters');
});

test('the canonical, og:url and sitemap all name this site', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="https://${HOST}/"`));
  assert.match(html, new RegExp(`<meta property="og:url" content="https://${HOST}/"`));
  assert.match(read('sitemap.xml'), new RegExp(`<loc>https://${HOST}/</loc>`));
  assert.match(read('robots.txt'), new RegExp(`Sitemap: https://${HOST}/sitemap.xml`));
});

test('og:site_name is the host and the social card exists', () => {
  assert.match(html, new RegExp(`<meta property="og:site_name" content="${HOST}"`));
  assert.ok(existsSync(join(SITE, 'og.png')), 'og.png is named in the head, so it has to exist');
  assert.ok(statSync(join(SITE, 'og.png')).size > 5000, 'og.png is a real image, not a placeholder');
});

test('the structured data is valid JSON and an accepted type', () => {
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, 'there is a JSON-LD block');
  const data = JSON.parse(block[1]);
  assert.equal(data['@context'], 'https://schema.org');
  // 14a: a subtype is not enough — the validator accepts the broad type.
  assert.ok(['VideoGame', 'WebApplication', 'Game'].includes(data['@type']), `@type is ${data['@type']}`);
  assert.equal(data.url, `https://${HOST}/`);
});

/* ------------------------------------------------------------------ part 0: the belief comes first */

test('the first heading is a belief, not a capability', () => {
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
  const text = h1.replace(/<[^>]*>/g, '').trim();
  assert.ok(text.length > 20, 'the h1 says something');
  assert.match(text, /^(Every|Nobody|Nothing|No )/i, `the h1 opens with the belief, and it reads: "${text}"`);
  // A WHY that forbids nothing is a tagline. This one forbids an aimbot.
  const lede = (html.match(/<p class="whylede">([\s\S]*?)<\/p>/) || [])[1] || '';
  assert.match(lede, /no shark here can point a laser at\s+you without turning its head/i, 'the belief states what it forbids');
});

test('the capability line is below the belief, never above it', () => {
  const h1At = html.indexOf('<h1');
  const subAt = html.indexOf('class="sub"');
  assert.ok(h1At > 0 && subAt > h1At, 'the sub line — what it is — comes after the heading — what it believes');
});

/* ------------------------------------------------------------------ parts 3 and 4: bar and footer */

test('the bar carries the brand home to nodejavascript.com', () => {
  const header = (html.match(/<header class="top">[\s\S]*?<\/header>/) || [])[0];
  assert.ok(header, 'there is a header bar');
  assert.match(header, /<a class="brand" href="https:\/\/nodejavascript\.com\/">/, 'the brand links home');
  assert.ok(header.indexOf('<nav>') > header.indexOf('class="brand"'), 'the nav sits after the brand, never before it');
});

test('there is one h1 on the page, and it is the belief', () => {
  const count = (html.match(/<h1[\s>]/g) || []).length;
  assert.equal(count, 1, `exactly one h1 per document; this page has ${count}`);
});

test('the page footer links a privacy policy that exists', () => {
  assert.match(html, /<a href="\/privacy">Privacy<\/a>/, 'the footer links the policy');
  assert.ok(existsSync(join(SITE, 'privacy.html')), '/privacy is served from privacy.html');
  const policy = read('privacy.html');
  assert.match(policy, /<h1/, 'the policy has its own heading');
  assert.match(policy, /three letters and a score/i, 'and it states the honest summary');
});

test('every GitHub link carries a star on its left', () => {
  // The star itself is a long <path>, so the bound has to be generous — it is a guard against
  // matching the wrong thing, not a length limit on a link.
  const links = [...html.matchAll(/<a [^>]*href="https:\/\/github\.com[^"]*"[^>]*>([\s\S]{0,800}?)<\/a>/g)];
  assert.ok(links.length > 0, 'there is a GitHub link in the footer');
  for (const link of links) {
    assert.match(link[1], /class="gh-star"/, 'the GitHub link has no star on its left');
  }
});

test('the footer names the family and this site\'s own source', () => {
  const footer = (html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/) || [])[0];
  assert.ok(footer, 'there is a footer');
  assert.match(footer, /<a href="https:\/\/nodejavascript\.com\/">nodejavascript\.com<\/a>/, 'the footer names the family');
  assert.match(footer, /github\.com\/nodejavascript\/redqueen-vs-sharks/, 'and links the source by its full address');
  assert.match(footer, new RegExp(`© 2026 ${HOST.replace(/\./g, '\\.')}`), 'the copyright line names the host');
  assert.ok(!/back to top/i.test(footer), 'there is no "back to top" in a footer');
});

/* ------------------------------------------------------------------ part 1b: no .html in a URL */

test('no URL a visitor sees ends in .html', () => {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const bad = hrefs.filter((h) => /\.html?(\?|#|$)/.test(h));
  assert.deepEqual(bad, [], `these links put .html in the address bar: ${bad.join(', ')}`);
});

test('the server serves a clean path from the file it names', () => {
  const server = readFileSync(join(here, '..', 'server', 'server.js'), 'utf8');
  assert.match(server, /existsSync\(file \+ '\.html'\)/, 'a clean path is served from its .html file');
  assert.match(server, /'cache-control': 'no-store'/, 'and nothing is cacheable');
});

/* ------------------------------------------------------------------ nothing from another origin */

test('the page loads nothing from another origin', () => {
  const loads = [...html.matchAll(/<(script|link)\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/rel="(canonical|alternate|preconnect|dns-prefetch|manifest|icon|apple-touch-icon)"/.test(tag));
  const remote = loads
    .map((tag) => (tag.match(/(?:src|href)="(https?:\/\/[^"]+)"/) || [])[1])
    .filter(Boolean);
  assert.deepEqual(remote, [], `the page loads something remote: ${remote.join(', ')}`);
  assert.ok(!/googletagmanager|google-analytics|fonts\.googleapis/.test(html), 'no third-party tag sits in the page');
});

test('Three.js is served from this site, not from a CDN', () => {
  assert.match(game, /from '\.\/vendor\/three\.module\.js'/, 'the import is local');
  assert.ok(!/unpkg\.com|cdn\.jsdelivr|esm\.sh/.test(read('world.js') + read('music.js') + game), 'no CDN anywhere in the game');
  assert.ok(existsSync(join(SITE, 'vendor', 'three.module.js')), 'and the vendored file is really there');
  assert.ok(statSync(join(SITE, 'vendor', 'three.module.js')).size > 500000, 'it is the real build, not a stub');
});

test('the only network call the game makes is its own scoreboard', () => {
  const sources = game + read('world.js') + read('music.js') + read('config.js');
  const fetches = [...sources.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(fetches.length > 0, 'the scoreboard is fetched somewhere');
  for (const call of fetches) {
    assert.match(call, /^API\s*\+/, `a fetch goes somewhere that is not the board API: ${call}`);
  }
  assert.match(read('config.js'), /export const API = '\/api';/, 'the board is the same origin as the page');
});

/* ------------------------------------------------------------------ the page and the script agree */

test('every element id the script looks up exists in the page', () => {
  const wanted = new Set();
  for (const m of game.matchAll(/\$\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) wanted.add(m[1]);
  const missing = [...wanted].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `index.html is missing: ${missing.join(', ')}`);
});

test('the three things a player must always see are in the page', () => {
  for (const [id, what] of [
    ['score', 'the score'],
    ['lives', 'the queens left'],
    ['sharks-left', 'the sharks left'],
    ['hud-center', 'the readout card itself'],
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${what} must be in the page`);
  }
});

test('the start modal and the high-scores screen are both present and reachable', () => {
  assert.match(html, /class="screen on" id="scr-title"/, 'the title modal is the one screen that ships open');
  assert.ok(html.includes('id="btn-play"'), 'there is a Play button');
  assert.ok(html.includes('id="btn-board"'), 'there is a High Scores button');
  assert.ok(html.includes('id="scr-board"'), 'and a board screen to open');
  assert.ok(html.includes('id="btn-close"') && html.includes('id="btn-again"'), 'the board can be left and restarted');
});

test('pause is wired to P and announced on screen', () => {
  assert.match(game, /e\.code === 'KeyP'/, 'P is bound');
  assert.match(game, /function togglePause\(\)/, 'the toggle exists');
  assert.ok(html.includes('id="pause"'), 'the paused badge exists');
  assert.match(html, /Pause: <b>P<\/b>/, 'and the controls line tells the player');
});

/* ------------------------------------------------------------------ assets and the icon set */

test('every icon the head declares exists on disk', () => {
  for (const name of ['favicon-180.png', 'favicon-32.png', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png']) {
    assert.ok(existsSync(join(SITE, name)), `${name} is declared in the head or the manifest, so it must exist`);
    assert.ok(statSync(join(SITE, name)).size > 200, `${name} is a real image`);
  }
  // 15b: the large PNG is declared first.
  const iconLinks = [...html.matchAll(/<link rel="icon"[^>]*sizes="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(iconLinks[0], '180x180', 'the large PNG is declared before the small ones');
});

test('the manifest is small, valid and names this game', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Red Queen vs. Laser Sharks');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) assert.ok(existsSync(join(SITE, icon.src.replace(/^\//, ''))), `${icon.src} exists`);
});

/* ------------------------------------------------------------------ no secrets, no stray files */

test('no credential is in the site the world can download', () => {
  const files = ['index.html', 'game.js', 'world.js', 'music.js', 'rules.js', 'config.js', 'manifest.webmanifest'];
  const patterns = [/sk-[A-Za-z0-9]{16,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/, /api[_-]?key/i, /password\s*[:=]/i];
  for (const file of files) {
    const source = read(file);
    for (const pattern of patterns) {
      assert.ok(!pattern.test(source), `${file} appears to carry a credential (${pattern})`);
    }
  }
});

test('the public site directory holds no build junk', () => {
  for (const name of ['node_modules', 'package.json', 'package-lock.json', '.env']) {
    assert.ok(!existsSync(join(SITE, name)), `site/${name} must not be published`);
  }
});
