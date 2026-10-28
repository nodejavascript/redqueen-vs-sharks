# Red Queen vs. Laser Sharks

**Every shark that kills you had to look at you first.**

A three.js arcade game on a sunset pier: three lives, ten levels, and sharks with lasers bolted to their heads. Play it at
**[redqueen-vs-sharks-with-laser-beams-attached-to-their-heads.nodejavascript.com](https://redqueen-vs-sharks-with-laser-beams-attached-to-their-heads.nodejavascript.com/)**.

## The rule that makes it fair

A shark cannot fire behind itself. Its head has to turn to you first, and the turn is capped at `MAX_HEAD_TURN = 0.95` radians in [`site/rules.js`](site/rules.js) — so a shark on your flank has to swing round, and the swing is the window you get. That is arithmetic in the source, not a description of intent, and the unit tests hold it there.

Scoring follows the same file: an eye shot scores **100**, an eye shot while the laser is lit scores **300**, and a hit anywhere else scores **25**.

## How to play

| Input | Does |
|---|---|
| `W` or `↑` / `S` or `↓` | move the queen along the deck |
| mouse | aim — the reticle turns hot when it is on an eye |
| `click` or `Space` | fire |
| `P` | pause |

Ten levels, each with its own shark count, fire rate, burst size and target kills — the whole table is `LEVELS` in [`site/rules.js`](site/rules.js), from 3 sharks and 4 kills at level 1 to 8 sharks and 14 kills at level 10. Three lives, no continues. The scoreboard takes three initials.

## How it is built

- **`site/`** — the game: `game.js` (scene, loop, input), `world.js` (the pier and the sea), `rules.js` (levels, scoring, the head-turn cap — pure functions, no DOM), `music.js` (Web Audio), `config.js`.
- **`server/server.js`** — a Node 22 server that serves `site/` and the scoreboard: `GET /api/scores` and `POST /api/scores`. It uppercases the initials and requires exactly three letters (`/^[A-Z]{3}$/`), and it refuses a fractional score rather than rounding it, so nobody lands on the board with a number the game cannot produce.
- **`tools/`** — `deploy.sh` (rsync to the host and restart the systemd unit) and `live-check.mjs` (checks the deployed host answers).
- No framework, no bundler, no build step: three.js is vendored under `site/vendor`.

## Running it

Requires Node 22.

```bash
npm run serve
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run test:all
```

## Tests

**52 in total**, all with `node --test`:

- **15 unit** ([`test/units.test.js`](test/units.test.js)) — the ten-level curve never goes backwards; a head cannot turn past `MAX_HEAD_TURN`, so a shark behind the queen cannot point at her; scoring is 100/300/25 as above; `validName` refuses anything but three capital letters and `validScore` refuses a fractional or out-of-range score.
- **26 static** ([`test/static.test.js`](test/static.test.js)) — the shipped files hold their own invariants: the HTML, `config.js`, `game.js`, `music.js`, `rules.js`, `server.js`, the sitemap, the manifest and the package files.
- **11 end-to-end** ([`test/e2e.test.js`](test/e2e.test.js)) — a real browser against the running server (Playwright), playing the game and hitting the scoreboard API.

## Deploying

```bash
npm run deploy
```

That rsyncs `site/` and `server/` to the host, restarts the `redqueen-vs-sharks` systemd unit and asserts it is active. The host serves it through Caddy in front of the Node process.

## Licence

No licence file is present in this repository. The source is public so it can be read; it is not offered for reuse.
