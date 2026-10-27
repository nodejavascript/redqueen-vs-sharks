// The live check: asks the deployed site the questions only the deployed site can answer.
//
// It is deliberately tiny and does not import the game — a live check that shares code with the thing
// it checks can be wrong in the same way twice.
const HOST = 'redqueen-vs-sharks-with-laser-beams-attached-to-their-heads.nodejavascript.com';
const BASE = `https://${HOST}`;

const failures = [];
const note = (ok, what, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(what);
};

const get = async (path, init) => {
  const response = await fetch(BASE + path, { redirect: 'follow', ...init });
  return { response, text: await response.text() };
};

const r1 = await get('/');
note(r1.response.status === 200, 'the page answers 200', String(r1.response.status));
note(/<title>redqueen-vs-sharks-with-laser-beams-attached-to-their-heads\.nodejavascript\.com<\/title>/.test(r1.text), 'the title is the hostname');
note(/Every shark that kills you had to look at you first/.test(r1.text), 'the belief is on the page');
note(/nodejavascript\.com<\/a>/.test(r1.text), 'the footer names the family');
note(/no-store/.test(r1.response.headers.get('cache-control') || ''), 'the shell is no-store', r1.response.headers.get('cache-control') || 'none');

for (const path of ['/game.js', '/rules.js', '/world.js', '/music.js', '/config.js', '/vendor/three.module.js', '/favicon.ico', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml', '/og.png']) {
  const { response } = await get(path);
  note(response.status === 200, `${path} answers 200`, String(response.status));
}

const manifest = JSON.parse((await get('/manifest.webmanifest')).text);
note(manifest.start_url === '/', 'the manifest names this site');

// The board is the one thing that has to work for a stranger on the other side of the planet.
const board = await (await fetch(`${BASE}/api/scores`)).json();
note(Array.isArray(board.scores), 'the shared board answers with rows');
note(board.live === true, 'and says it is live');

// Part 1b: a .html address is never a URL a visitor sees.
const htmlUrl = await fetch(`${BASE}/index.html`, { redirect: 'manual' });
note(htmlUrl.status >= 300 && htmlUrl.status < 400, '/index.html redirects to the clean address', String(htmlUrl.status));

console.log(failures.length ? `\nLIVE CHECK FAILED — ${failures.length} fault(s): ${failures.join(', ')}` : '\nLIVE CHECK OK — the deployed site is the site that was tested');
process.exit(failures.length ? 1 : 0);
