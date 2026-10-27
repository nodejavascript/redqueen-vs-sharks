// Red Queen vs. Laser Sharks — game logic, input, scoring, levels, name entry, scoreboard.
//
// The sharks are the whole design: their laser is bolted to a head that spends most of its time
// under the water, points wherever the head points, and sweeps as the head sweeps. Nothing locks
// on. You are only ever hit by standing in a beam you could see coming.
import * as THREE from './vendor/three.module.js';
import { createWorld, createShark, createBeam, setBeam, WATER_Y, DECK_Z0, DECK_Z1 } from './world.js';
import { API, POLL_MS } from './config.js';
import { createMusic } from './music.js';
import {
  LEVELS, MAX_LEVEL, levelFor, wrapAngle, headReach, headOnTarget, MAX_HEAD_TURN,
  SCORE, shotScore, levelCleared, nextLevelNumber, clampQueenZ, initialsOf,
  LETTERS as RULES_LETTERS,
} from './rules.js';

/* ------------------------------------------------------------------ dom */
const $ = (s) => document.querySelector(s);
const el = {
  score: $('#score'), best: $('#best'), lives: $('#lives'), level: $('#level'),
  sharksLeft: $('#sharks-left'), hudCenter: $('#hud-center'),
  vol: $('#vol'), volPct: $('#volpct'),
  bonus: $('#bonus'), cross: $('#cross'), sharksLeft: $('#sharks-left'), pause: $('#pause'),
  title: $('#scr-title'), over: $('#scr-over'), board: $('#scr-board'), levelScr: $('#scr-level'),
  finalScore: $('#finalScore'), overSub: $('#overSub'), overTitle: $('#overTitle'),
  lvTitle: $('#lvTitle'), lvSub: $('#lvSub'), lvBonus: $('#lvBonus'), lvNote: $('#lvNote'),
  slots: [...document.querySelectorAll('.slot')],
  boardBody: $('#boardBody'), boardStatus: $('#boardStatus'),
};

const flash = document.createElement('div');
flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle,rgba(255,40,20,0) 40%,rgba(255,30,10,.6));opacity:0;transition:opacity .18s ease;z-index:5';
document.body.appendChild(flash);

/* ------------------------------------------------------------------ audio */
const AC = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* silence */ }
  },
  tone(f0, f1, dur, type = 'square', vol = 0.07, delay = 0) {
    const ac = this.ctx; if (!ac) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },
  /** Filtered noise burst. `type` lets the same helper make a crack (highpass) or a boom (lowpass). */
  noise(dur = 0.2, vol = 0.06, freq = 600, type = 'highpass', decay = 1) {
    const ac = this.ctx; if (!ac) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const k = Math.pow(1 - i / n, decay);
      d[i] = (Math.random() * 2 - 1) * k;
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  },

  /** Her blaster: a gunshot — sharp crack, hard body, short low boom. */
  shoot() {
    if (!this.ctx) return;
    this.noise(0.035, 0.16, 2600, 'highpass', 3.0);      // the crack
    this.noise(0.16, 0.11, 700, 'lowpass', 1.4);         // the body
    this.tone(300, 70, 0.10, 'square', 0.10);            // punch
    this.tone(110, 42, 0.22, 'sine', 0.13, 0.01);        // boom
  },

  /** Their lasers: an electrical buzz, not a pew — two detuned oscillators chopped by a fast LFO. */
  buzz(dur = 0.42) {
    const ac = this.ctx; if (!ac) return;
    const t0 = ac.currentTime;

    const osc1 = ac.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(168, t0);
    osc1.frequency.linearRampToValueAtTime(96, t0 + dur);

    const osc2 = ac.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(84, t0);
    osc2.frequency.linearRampToValueAtTime(52, t0 + dur);

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 780; bp.Q.value = 1.6;
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highpass'; shelf.frequency.value = 140;

    // square-wave amplitude modulation at 46 Hz is what makes it BUZZ rather than hum
    const chop = ac.createGain();
    chop.gain.value = 0;
    const lfo = ac.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(46, t0);
    lfo.frequency.linearRampToValueAtTime(38, t0 + dur);
    const lfoAmt = ac.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(chop.gain);

    const master = ac.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.linearRampToValueAtTime(0.11, t0 + 0.015);
    master.gain.setValueAtTime(0.11, t0 + dur - 0.07);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc1.connect(bp); osc2.connect(bp);
    bp.connect(shelf).connect(chop).connect(master).connect(ac.destination);

    osc1.start(t0); osc2.start(t0); lfo.start(t0);
    osc1.stop(t0 + dur + 0.05); osc2.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  },

  zap() { this.buzz(0.42); },
  hit() { this.tone(1320, 660, 0.1, 'triangle', 0.09); },
  bonus() { this.tone(880, 880, 0.07, 'square', 0.07); this.tone(1320, 1320, 0.09, 'square', 0.07, 0.07); this.tone(1760, 1760, 0.12, 'square', 0.06, 0.15); },
  zap() { this.tone(220, 60, 0.35, 'sawtooth', 0.08); this.noise(0.3, 0.05, 300); },
  hurt() { this.tone(180, 40, 0.5, 'sawtooth', 0.12); this.noise(0.4, 0.08, 160); },
  level() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.08, i * 0.11)); },
  over() { [523, 440, 349, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.28, 'triangle', 0.08, i * 0.18)); },
};

/* ------------------------------------------------------------------ music */
const VOL_KEY = 'rq-music-vol';
let musicVol = (() => {
  const raw = localStorage.getItem(VOL_KEY);
  if (raw === null) return 0.5;                 // starts at 50%
  const v = Number(raw);                        // Number(null) is 0, so check for null first
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
})();
let music = null;

function initMusic() {
  if (music || !AC.ctx) return;
  music = createMusic(AC.ctx);
  music.setVolume(musicVol);
}

function musicStart(lives = 3) {
  initMusic();
  if (!music) return;
  music.setLives(lives);
  music.start();
}

function musicStop() {
  if (music) music.stop();
}

function paintVolume() {
  const pct = Math.round(musicVol * 100);
  if (el.vol) {
    el.vol.value = String(pct);
    el.vol.style.setProperty('--fill', pct + '%');
  }
  if (el.volPct) el.volPct.textContent = pct + '%';
}

/* ------------------------------------------------------------------ world */
const canvasHost = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
canvasHost.insertBefore(renderer.domElement, canvasHost.firstChild);

const world = createWorld(renderer);
const { scene, camera, queen } = world;
const muzzle = queen.userData.muzzle;

function fit() { world.resize(innerWidth, innerHeight); }
addEventListener('resize', fit);
fit();

/* ------------------------------------------------------------------ levels */
// Level 1 has to be winnable by someone who has never played: few sharks, long gaps between
// surfacings, a slow sweep and a generous charge-up. Level 10 is a wall of beams.
// LEVELS lives in rules.js so the difficulty curve can be tested in Node.
const levelCfg = () => levelFor(S.level);

/* ------------------------------------------------------------------ state */
const S = {
  phase: 'title',            // title | play | levelup | over | name | board
  level: 1,
  score: 0,
  best: Number(localStorage.getItem('rq-best') || 0),
  lives: 3,
  kills: 0,
  queenZ: 2,
  queenTargetZ: 2,
  lastShot: 0,
  time: 0,
  shake: 0,
  invuln: 0,
  ready: false,
  introT: 0,
  hudOn: false,
  paused: false,
};

const keys = Object.create(null);
const mouse = { x: innerWidth / 2, y: innerHeight / 2, ndc: new THREE.Vector2(0, 0) };

const { EYE_BASE, EYE_BONUS, BODY } = SCORE;
const BEAM_LEN = 60;          // how far a shark's laser reaches before it dies out
const rnd = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ sharks */
const SHARK_MAX = 8;
const sharks = [];

function sharkSpot() {
  for (let i = 0; i < 40; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const cx = side * rnd(7, 19);
    const cz = rnd(-20, -62);
    const r = rnd(2.0, 5.0);
    if (Math.abs(cx) - r > 3.2) return { cx, cz, r };
  }
  return { cx: 16, cz: -50, r: 4 };
}

function spawnShark(s) {
  const { cx, cz, r } = sharkSpot();
  s.cx = cx; s.cz = cz; s.r = r;
  s.phase = Math.random() * Math.PI * 2;
  s.w = (Math.random() < 0.5 ? -1 : 1) * rnd(0.16, 0.30);
  s.scale = rnd(0.85, 1.5);
  s.state = 'down';
  s.up01 = 0;
  s.timer = rnd(0.8, 5.0);
  s.chargeT = 1;
  s.bursts = 0;
  s.firing = 0;
  s.aimT = 1;
  s.aimOffset = 0;
  s.aimErr = Math.PI;
  s.headOnHim = false;
  s.onTarget = 0;
  s.deathPitch = 0;
  s.dead = false;
  s.deadT = 0;
  s.mesh.group.scale.setScalar(s.scale);
  s.mesh.group.visible = true;
  s.mesh.shadow.visible = true;
  s.mesh.skin.opacity = 0.66;
  s.mesh.shadow.material.opacity = 0.5;
  s.mesh.group.rotation.set(0, 0, 0);
  pose(s, 0, 0);
}

/** Sit the shark in the water. Submerged, the body drops below the surface and the opaque water
 *  hides it on its own — only the fin and the shadow give it away. */

function pose(s, t, dt = 0) {
  const a = s.phase;
  const x = s.cx + Math.cos(a) * s.r;
  const z = s.cz + Math.sin(a) * s.r;
  const dx = -Math.sin(a) * Math.sign(s.w);
  const dz = Math.cos(a) * Math.sign(s.w);
  const L = levelCfg();
  const baseYaw = Math.atan2(dx, dz);

  // While the head is up it can SEE her, so it turns towards her — at a finite speed, and only
  // as far as a head goes. That is the whole dodge: break the turn, or get behind it.
  let yaw = baseYaw;
  if (s.state === 'up' && s.up01 > 0.35) {
    queen.getWorldPosition(qTmp);
    const toQ = Math.atan2(qTmp.x - x, qTmp.z - z);
    const want = wrapAngle(toQ - baseYaw);                        // the true bearing to her
    const reach = headReach(want);              // a head turns so far, and no further
    s.aimOffset += THREE.MathUtils.clamp(reach - s.aimOffset, -L.slew * dt, L.slew * dt);
    s.aimErr = Math.abs(want - s.aimOffset);                      // never small if she is out of arc
    s.headOnHim = headOnTarget(want);
    yaw = baseYaw + s.aimOffset;
  } else {
    s.aimOffset *= Math.max(0, 1 - dt * 2.2);
    s.aimErr = Math.PI;
    s.headOnHim = false;
  }

  const sweep = s.state === 'up' && !s.headOnHim
    ? Math.sin(s.phase * 3.1 + t * L.rate * 2.4) * L.sweep : 0;

  const g = s.mesh.group;
  g.position.set(x, WATER_Y + 0.16 + s.up01 * 0.24 - (1 - s.up01) * 0.62, z);
  g.rotation.y = yaw + sweep;
  g.rotation.x = -0.06 * s.up01;
  g.rotation.z = Math.sin(t * 2.1 + a) * 0.07 * (1 - s.up01 * 0.6);

  s.mesh.shadow.position.set(x, WATER_Y + 0.03, z);
  s.mesh.shadow.rotation.z = -baseYaw;
}

for (let i = 0; i < SHARK_MAX; i++) {
  const mesh = createShark({ glow: world.glow, disc: world.disc });
  scene.add(mesh.group);
  scene.add(mesh.shadow);
  const s = { mesh };
  spawnShark(s);
  sharks.push(s);
}
const active = () => sharks.slice(0, levelCfg().sharks);

/* ------------------------------------------------------------------ beams */
const beamPool = [];
// a laser reads on a sunset because of the white-hot core, not the red
const BEAM_LAYERS = {
  aim: [[0xff4a1e, 0.06, 0.9], [0xff2200, 0.17, 0.10]],
  fire: [[0xfff2e6, 0.10, 1.0], [0xff2a08, 0.26, 0.95], [0xff0000, 0.75, 0.12]],
};

function getBeam(i, kind) {
  const key = i * 2 + (kind === 'aim' ? 1 : 0);   // one aim line AND one fire beam per shark
  if (!beamPool[key]) {
    const g = new THREE.Group();
    const layers = BEAM_LAYERS[kind].map(([color, radius, base]) => {
      const mesh = createBeam({ color, radius, opacity: base });
      g.add(mesh);
      return { mesh, base };
    });
    scene.add(g);
    beamPool[key] = { group: g, layers, core: layers[0].mesh };
  }
  return beamPool[key];
}

function setBeamGroup(b, a, c, k = 1) {
  for (const L of b.layers) {
    setBeam(L.mesh, a, c);
    L.mesh.material.opacity = L.base * k;
  }
}
const hideBeams = () => { for (const b of beamPool) if (b) b.group.visible = false; };

/* ------------------------------------------------------------------ fx */
const sparks = [];
for (let i = 0; i < 70; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: world.glow, color: 0xffd0a0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  }));
  sp.visible = false;
  scene.add(sp);
  sparks.push({ sp, life: 0, max: 1, v: new THREE.Vector3() });
}

function burst(pos, n = 8, color = 0xffcc88, spread = 9) {
  for (let i = 0; i < n; i++) {
    const p = sparks.find((s) => s.life <= 0);
    if (!p) return;
    p.sp.visible = true;
    p.sp.material.color.setHex(color);
    p.sp.position.copy(pos);
    p.sp.scale.setScalar(0.6);
    p.v.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(spread * rnd(0.4, 1.2));
    p.life = p.max = rnd(0.3, 0.65);
  }
}

const blasts = [];
function explode(pos) {
  burst(pos, 28, 0xffcf7a, 26);
  burst(pos, 14, 0xffffff, 17);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: world.glow, color: 0xffd9a0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.position.copy(pos);
  sp.scale.setScalar(2.4);
  scene.add(sp);
  blasts.push({ sp, life: 0.36, max: 0.36 });
  AC.tone(120, 38, 0.45, 'sine', 0.15);
  AC.noise(0.35, 0.12, 260, 'lowpass', 1.2);
}

const tracer = createBeam({ color: 0xffe0a0, radius: 0.05, opacity: 0.9 });
scene.add(tracer);
let tracerLife = 0;

function popup(text, x, y, cls = '') {
  const d = document.createElement('div');
  d.textContent = text;
  d.style.cssText = `position:fixed;left:${x}px;top:${y}px;transform:translate(-50%,-50%);
    font:700 20px "Courier New",monospace;color:${cls === 'bonus' ? '#fff3b0' : '#ffd08a'};
    text-shadow:0 0 14px rgba(255,120,40,.9);pointer-events:none;z-index:6;
    transition:transform .7s cubic-bezier(.2,.7,.3,1),opacity .7s ease`;
  document.body.appendChild(d);
  requestAnimationFrame(() => {
    d.style.transform = 'translate(-50%,-140%) scale(1.15)';
    d.style.opacity = '0';
  });
  setTimeout(() => d.remove(), 760);
}

/* ------------------------------------------------------------------ input */
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  el.cross.style.left = e.clientX + 'px';
  el.cross.style.top = e.clientY + 'px';
});

addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || e.target.closest('.screen') || e.target.closest('input')) return;
  AC.init();
  if (S.phase === 'intro' && S.introT > 0.5) S.skipIntro = true;
  if (S.phase === 'play') shoot();
});

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (S.phase === 'intro' && S.introT > 0.5) S.skipIntro = true;
  if (e.code === 'Space' && S.phase === 'play') { e.preventDefault(); AC.init(); shoot(); }
  if (e.code === 'Space' && S.phase === 'levelup') { e.preventDefault(); nextLevel(); }
  if (e.code === 'KeyP' && S.phase === 'play') { e.preventDefault(); togglePause(); }
  if (S.phase === 'name') nameKey(e);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

/* ------------------------------------------------------------------ aiming */
const raycaster = new THREE.Raycaster();
const sph = new THREE.Sphere();
const hitPoint = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const worldPos = (o, out) => o.getWorldPosition(out);
const qTmp = new THREE.Vector3();

/** Only a head that is out of the water can be shot: that is the whole risk/reward loop. */
function pickShark(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  let best = null, bestT = Infinity, onEye = false;
  for (const s of active()) {
    if (s.dead || s.up01 < 0.55) continue;
    worldPos(s.mesh.head, tmpA);
    sph.set(tmpA, 0.55 * s.scale);
    if (ray.intersectSphere(sph, hitPoint)) {
      const d = hitPoint.distanceTo(ray.origin);
      if (d < bestT) { bestT = d; best = { shark: s, point: hitPoint.clone(), eye: true }; onEye = true; }
    }
    worldPos(s.mesh.group, tmpA);
    sph.set(tmpA, 1.6 * s.scale);
    if (ray.intersectSphere(sph, hitPoint)) {
      const d = hitPoint.distanceTo(ray.origin);
      if (d < bestT) { bestT = d; best = { shark: s, point: hitPoint.clone(), eye: false }; onEye = false; }
    }
  }
  return { best, onEye };
}

/* ------------------------------------------------------------------ shooting */
function togglePause() {
  S.paused = !S.paused;
  el.pause.classList.toggle('on', S.paused);
  if (music) music.setVolume(S.paused ? 0 : Number(el.vol.value) / 100);
}

function shoot() {
  if (S.paused) return;
  const now = performance.now();
  if (now - S.lastShot < 130) return;
  S.lastShot = now;
  AC.shoot();

  worldPos(muzzle, tmpA);
  const { best } = pickShark(mouse.ndc);
  raycaster.setFromCamera(mouse.ndc, camera);
  const to = best ? best.point : raycaster.ray.at(220, new THREE.Vector3());
  setBeam(tracer, tmpA, to);
  tracer.material.opacity = 0.95;
  tracerLife = 0.09;
  burst(tmpA, 3, 0xffe6b0, 5);

  if (!best) return;
  const sh = best.shark;

  if (best.eye) {
    const charged = sh.state === 'up' && sh.chargeT <= 0.35;
    const pts = shotScore('eye', charged);
    killShark(sh);
    addScore(pts);
    popup('+' + pts, mouse.x, mouse.y, charged ? 'bonus' : '');
    if (charged) showBonus();
    burst(best.point, 14, charged ? 0xffe9a0 : 0xff8a5a, 14);
    AC[charged ? 'bonus' : 'hit']();
    addKill();
  } else {
    addScore(shotScore('body'));
    popup('+' + shotScore('body'), mouse.x, mouse.y);
    sh.mesh.skin.color.setHex(0x2a1416);
    burst(best.point, 5, 0x88d0c0, 7);
    AC.tone(320, 180, 0.08, 'square', 0.05);
    setTimeout(() => sh.mesh.skin.color.setHex(0x0f343a), 120);
  }
}

function addScore(n) {
  S.score += n;
  if (S.score > S.best) {
    S.best = S.score;
    localStorage.setItem('rq-best', String(S.best));
    el.best.textContent = S.best;
  }
  el.score.textContent = S.score;
  el.score.style.transform = 'scale(1.14)';
  setTimeout(() => { el.score.style.transform = 'scale(1)'; }, 110);
}

let bonusTimer = 0;
function showBonus() { el.bonus.classList.add('on'); bonusTimer = 1.0; }

function killShark(s) {
  s.dead = true;
  s.deadT = 0;
  s.state = 'down';
  s.bursts = 0;
  s.onTarget = 0;
  s.deathPitch = s.mesh.group.rotation.x;
  s.mesh.group.updateMatrixWorld(true);
  const p = s.mesh.head.getWorldPosition(new THREE.Vector3());
  p.y = WATER_Y + 0.35;
  explode(p);
}

function addKill() {
  S.kills++;
  paintLevel();
  if (levelCleared(S.kills, S.level)) levelClear();
}

/* ------------------------------------------------------------------ damage */
function damage() {
  if (S.phase !== 'play' || S.invuln > 0) return;
  S.lives = Math.max(0, S.lives - 1);
  S.invuln = 1.1;
  AC.hurt();
  S.shake = 0.55;
  flash.style.opacity = '1';
  setTimeout(() => { flash.style.opacity = '0'; }, 180);
  renderLives();
  if (music) music.setLives(S.lives);      // fewer queens, faster and nastier
  if (S.lives === 0) gameOver();
}

const QUEEN_SVG = '<svg viewBox="0 0 32 28" aria-hidden="true">'
  + '<path d="M3 21h26l-2.4-14-6.6 5.6L16 3l-4 9.6L5.4 7 3 21Z"/>'
  + '<rect x="3" y="22.5" width="26" height="3.2" rx="1.2"/></svg>';

const SHARK_SVG = '<svg viewBox="0 0 66 30" aria-hidden="true">'
  + '<path class="sh-tail" d="M49 15 65 2 58 15 65 28Z"/>'
  + '<path class="sh-body" d="M1 15.2C8 9.2 20 6 32 7.6 42 9 47.5 12 50 15c-2.5 3-8 6-18 7.4C20 24 8 21.2 1 15.2Z"/>'
  + '<path class="sh-fin" d="M26 8.2 33 0.2 41.5 9.8Z"/>'
  + '<path class="sh-fin" d="M22 19.6 28.5 27 13.5 20.8Z"/></svg>';

function buildQueenPips() {
  el.lives.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('div');
    d.className = 'queen-pip';
    d.innerHTML = QUEEN_SVG;
    el.lives.appendChild(d);
  }
}

function renderLives() {
  [...el.lives.children].forEach((c, i) => c.classList.toggle('lost', i >= S.lives));
}

const livePips = () => [...el.sharksLeft.children].filter((c) => !c.classList.contains('gone'));

/** The row shows exactly the sharks still to kill. A kill pops one out of the row. */
function syncPips(animate = true) {
  const want = Math.max(0, levelCfg().target - S.kills);
  el.sharksLeft.classList.toggle('dense', levelCfg().target > 8);
  let have = livePips().length;
  while (have < want) {
    const d = document.createElement('div');
    d.className = 'shark-pip';
    d.innerHTML = SHARK_SVG;
    el.sharksLeft.appendChild(d);
    have++;
  }
  while (have > want) {
    const last = livePips().pop();
    if (!last) break;
    if (animate) {
      last.classList.add('gone');
      setTimeout(() => last.remove(), 440);
    } else {
      last.remove();
    }
    have--;
  }
  // clear out any corpses left behind by a fast sequence of kills
  for (const c of [...el.sharksLeft.children]) {
    if (c.classList.contains('gone') && !c.dataset.dead) {
      c.dataset.dead = '1';
      setTimeout(() => c.remove(), 500);
    }
  }
}

function paintLevel() {
  el.level.textContent = S.level;
  syncPips();
}

/* ------------------------------------------------------------------ the laser on the head */
const headPos = new THREE.Vector3();
const headDir = new THREE.Vector3();
const queenPos = new THREE.Vector3();

function headInfo(s) {
  worldPos(s.mesh.emitter, headPos);
  headDir.set(0, 0, 1).applyQuaternion(s.mesh.group.getWorldQuaternion(tmpQ));
  headDir.normalize();
}

/** The beam leaves the head in whatever direction the head happens to face — no lock-on.
 *  She is tested as a standing body (thigh to crown), not a single point, because a beam at
 *  water level that passes through her legs is still a hit. */
function beamHitsQueen(pos, dir, radius) {
  queen.getWorldPosition(queenPos);
  let bestPerp = Infinity, bestAlong = 0;
  for (let k = 0; k <= 4; k++) {
    const y = 0.2 + k * 0.4;                 // 0.2 .. 1.8 world units above the deck
    const rx = queenPos.x - pos.x, ry = y - pos.y, rz = queenPos.z - pos.z;
    const along = rx * dir.x + ry * dir.y + rz * dir.z;
    if (along < 0.4) continue;
    const perp = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - along * along));
    if (perp < bestPerp) { bestPerp = perp; bestAlong = along; }
  }
  return { hit: bestPerp < radius, along: bestAlong, perp: bestPerp };
}

function fireShark(s, idx) {
  headInfo(s);
  const L = levelCfg();
  const res = beamHitsQueen(headPos, headDir, L.beam);
  const hit = res.hit;
  const b = getBeam(idx, 'fire');
  const end = headPos.clone().addScaledVector(headDir, hit ? Math.min(res.along, BEAM_LEN) : BEAM_LEN);
  setBeamGroup(b, headPos, end, 1);
  b.group.visible = true;
  s.firing = 0.18;
  AC.zap();
  burst(headPos, 5, 0xff8866, 8);
  burst(end, 10, 0xffc9a0, 10);
  if (hit) damage();
}

/* ------------------------------------------------------------------ shark brain */
function stepSharks(dt) {
  const L = levelCfg();
  const list = active();
  let up = list.filter((s) => !s.dead && s.state === 'up').length;

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const b = getBeam(i, 'fire');
    const ab = getBeam(i, 'aim');

    if (s.dead) {
      s.deadT += dt;
      const t = s.deadT;
      const g = s.mesh.group;
      // level off, then pitch nose-down about its own head so the tail is the last thing to go
      g.rotation.z += (0 - g.rotation.z) * Math.min(1, dt * 7);
      const k = Math.min(1, t / 0.45);
      const ease = k * k * (3 - 2 * k);
      g.rotation.x = s.deathPitch + (Math.PI * 0.52 - s.deathPitch) * ease;
      if (t > 0.45) g.position.y -= dt * (0.45 + (t - 0.45) * 2.2);
      const fade = t < 0.10 ? 1 : Math.max(0, 1 - (t - 0.10) / 2.3);
      s.mesh.skin.opacity = 0.66 * fade;
      s.mesh.shadow.material.opacity = 0.5 * Math.max(0, 1 - t / 1.1);
      const eyeFade = Math.max(0, 1 - t * 5);
      for (const e of s.mesh.eyes) { e.eye.material.opacity = eyeFade; e.halo.material.opacity = eyeFade * 0.9; }
      s.mesh.emitter.material.opacity = eyeFade;
      s.mesh.emitterGlow.material.opacity = eyeFade * 0.9;
      ab.group.visible = false;
      b.group.visible = false;
      if (t > 2.6) {
        s.mesh.skin.opacity = 0.66;
        s.mesh.shadow.material.opacity = 0.5;
        spawnShark(s);
      }
      continue;
    }

    if (s.state === 'down') {
      s.up01 = Math.max(0, s.up01 - dt * 1.8);
      s.timer -= dt;
      if (s.timer <= 0 && up < L.maxUp) {
        s.state = 'up';
        s.timer = L.up * rnd(0.9, 1.15);
        s.bursts = L.bursts;
        s.chargeT = L.charge;
        up++;
      }
    } else {
      s.up01 = Math.min(1, s.up01 + dt * 3.2);
      s.timer -= dt;

      // it sees her, swings the head onto her, holds the shot for a moment, and fires once.
      // It fires at whatever the head is pointing at when the moment comes — never at where she
      // is by then — so a hard change of direction beats it.
      if (s.bursts > 0 && s.up01 > 0.82) {
        s.aimT -= dt;
        if (s.aimErr < 0.07) s.onTarget += dt; else s.onTarget = 0;
        const settled = s.onTarget > L.settle;
        if (settled || s.aimT <= 0) {
          fireShark(s, i);
          s.bursts--;
          s.onTarget = 0;
          s.aimT = L.aim;
        }
      }
      if (s.timer <= 0) {
        s.state = 'down';
        s.timer = L.sink * rnd(0.75, 1.3);
        s.bursts = 0;
        s.onTarget = 0;
      }
    }

    if (s.firing > 0) {
      s.firing -= dt;
      const k = Math.max(0, s.firing / 0.18);
      for (const L of b.layers) L.mesh.material.opacity = L.base * k;
      if (s.firing <= 0) b.group.visible = false;
    }

    const speedMul = L.speed * (s.state === 'up' ? 0.45 : 1);
    s.phase += dt * s.w * speedMul;
    if (!s.freeze) pose(s, S.time, dt);

    // aiming line: always visible while the head is up, brighter as the shot charges
    if (s.state === 'up' && s.up01 > 0.5) {
      headInfo(s);
      const end = headPos.clone().addScaledVector(headDir, BEAM_LEN);
      ab.group.visible = true;
      const ready = THREE.MathUtils.clamp(s.onTarget / L.settle, 0, 1);
      const pulse = 0.55 + 0.45 * Math.sin(S.time * (10 + ready * 30));
      setBeamGroup(ab, headPos, end, 0.35 + ready * 0.65 * pulse);
      s.mesh.emitter.scale.setScalar(1 + ready * 0.8 * pulse);
      s.mesh.emitterGlow.scale.setScalar(1.2 + ready * 2.6 * pulse);
      for (const e of s.mesh.eyes) e.halo.scale.setScalar(1.0 + ready * 2.0);
    } else {
      ab.group.visible = false;
      s.mesh.emitter.scale.setScalar(1);
      s.mesh.emitterGlow.scale.setScalar(1.2);
      for (const e of s.mesh.eyes) e.halo.scale.setScalar(1.0);
    }

    const eyeOn = THREE.MathUtils.clamp((s.up01 - 0.3) / 0.7, 0, 1);
    for (const e of s.mesh.eyes) {
      e.eye.material.opacity = eyeOn;
      e.halo.material.opacity = eyeOn * 0.9;
    }
    s.mesh.emitter.material.opacity = eyeOn;
    s.mesh.emitterGlow.material.opacity = eyeOn * 0.9;
  }
}

/* ------------------------------------------------------------------ intro */
const tmpCam = new THREE.Vector3();
const INTRO = { smileFrom: 0.22, smileTo: 0.62, raise: 0.55, waveTo: 1.30, lowerTo: 1.52, turnTo: 2.00 };

function resetArms() {
  const mouth = queen.userData.mouth;
  if (mouth) { mouth.visible = false; mouth.scale.set(1, 0.001, 1); }
  if (queen.userData.faceEyes) for (const e of queen.userData.faceEyes) e.scale.y = 1;
  const arms = queen.userData.arms;
  if (arms) {
    for (const k of ['left', 'right']) {
      const a = arms[k];
      a.rotation.x = a.userData.rest.x;
      a.rotation.z = a.userData.rest.z;
      a.visible = true;
    }
  }
  if (queen.userData.waveArm) queen.userData.waveArm.visible = false;
}

/** She is turned to face you, the sharks hold still, she waves, then she turns to the water. */
function stepIntro(dt) {
  S.introT += dt;
  const t = S.introT;
  // she looks at you, and then she smiles
  const mouth = queen.userData.mouth;
  const faceEyes = queen.userData.faceEyes;
  if (mouth) {
    const k = THREE.MathUtils.clamp((t - INTRO.smileFrom) / (INTRO.smileTo - INTRO.smileFrom), 0, 1);
    const eased = k * k * (3 - 2 * k);
    mouth.visible = k > 0.001;
    mouth.scale.set(1 - 0.18 * (1 - eased), Math.max(0.001, eased * 1.15), 1);
  }
  if (faceEyes) {
    const k = THREE.MathUtils.clamp((t - INTRO.smileFrom) / (INTRO.smileTo - INTRO.smileFrom), 0, 1);
    for (const e of faceEyes) e.scale.y = 1 - 0.42 * k;    // a happy squint
  }

  const arms = queen.userData.arms;
  const wave = queen.userData.waveArm;

  if (arms && wave) {
    const holdArm = arms.right;
    if (t < INTRO.raise) {
      // the holding arm slips away as the waving one comes up
      holdArm.visible = false;
      wave.visible = true;
      const k = t / INTRO.raise;
      wave.rotation.z = -0.45 - 0.35 * k;
      wave.rotation.x = -0.15 - 0.15 * k;
    } else if (t < INTRO.waveTo) {
      wave.rotation.x = -0.30;
      wave.rotation.z = -0.80 + Math.sin((t - INTRO.raise) * 15.0) * 0.42;
    } else if (t < INTRO.lowerTo) {
      const k = (t - INTRO.waveTo) / Math.max(0.01, INTRO.lowerTo - INTRO.waveTo);
      wave.rotation.z = (-0.80) * (1 - k) - 0.45 * k;
      wave.rotation.x = -0.30 * (1 - k);
      if (k > 0.7) { wave.visible = false; holdArm.visible = true; }
    } else {
      wave.visible = false;
      holdArm.visible = true;
    }
  }

  // a small sway so she reads as alive, and the turn back to the water
  if (t < INTRO.lowerTo) {
    queen.rotation.y = Math.PI + Math.sin(t * 5.5) * 0.03;
    queen.rotation.z = Math.sin(t * 6.2) * 0.018;
  } else {
    const k = Math.min(1, (t - INTRO.lowerTo) / Math.max(0.01, INTRO.turnTo - INTRO.lowerTo));
    const ease = k * k * (3 - 2 * k);
    queen.rotation.y = Math.PI * (1 - ease);
    queen.rotation.z = 0;
  }

  // close-up while she waves, so you can actually see her
  if (t < INTRO.turnTo - 0.15) {
    camera.position.lerp(tmpCam.set(0, 1.85, S.queenZ + 3.5), 1 - Math.exp(-dt * 4.5));
    camera.lookAt(0, 1.24, S.queenZ);
  }

  if (t >= INTRO.turnTo || S.skipIntro) {
    S.skipIntro = false;
    queen.rotation.set(0, 0, 0);
    resetArms();
    S.phase = 'play';
    S.attackTimer = 1.4;
    musicStart(S.lives);
  }
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();

function stepSparks(dt) {
  for (const p of sparks) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.sp.visible = false; p.sp.material.opacity = 0; continue; }
    p.v.y -= dt * 6;
    p.sp.position.addScaledVector(p.v, dt);
    p.sp.material.opacity = Math.min(1, (p.life / p.max) * 1.6);
    p.sp.scale.setScalar(0.5 + (1 - p.life / p.max) * 0.9);
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    const bl = blasts[i];
    bl.life -= dt;
    if (bl.life <= 0) {
      scene.remove(bl.sp);
      bl.sp.material.dispose();
      blasts.splice(i, 1);
      continue;
    }
    const k = 1 - bl.life / bl.max;
    bl.sp.scale.setScalar(2.4 + k * 13);
    bl.sp.material.opacity = (1 - k) * 0.95;
  }
  if (tracerLife > 0) {
    tracerLife -= dt;
    tracer.material.opacity = Math.max(0, tracerLife / 0.09) * 0.95;
    if (tracerLife <= 0) tracer.visible = false;
  }
}

function stepQueen(dt) {
  const sliderFocused = document.activeElement === el.vol;
  const up = keys.KeyW || (!sliderFocused && keys.ArrowUp);
  const down = keys.KeyS || (!sliderFocused && keys.ArrowDown);
  const speed = 12;
  if (up) S.queenTargetZ -= speed * dt;
  if (down) S.queenTargetZ += speed * dt;
  S.queenTargetZ = clampQueenZ(S.queenTargetZ, DECK_Z0, DECK_Z1);
  S.queenZ += (S.queenTargetZ - S.queenZ) * (1 - Math.exp(-dt * 12));
  queen.position.set(0, 0, S.queenZ);
  const yaw = THREE.MathUtils.clamp(-mouse.ndc.x * 0.55, -0.7, 0.7);
  queen.rotation.y += (yaw - queen.rotation.y) * (1 - Math.exp(-dt * 8));

  if (S.invuln > 0) {
    S.invuln -= dt;
    queen.visible = Math.sin(S.time * 26) > -0.35;   // blink while recovering
    if (S.invuln <= 0) queen.visible = true;
  } else {
    queen.visible = true;
  }
  queen.userData.halo.scale.setScalar(1.25 + Math.sin(S.time * 7) * 0.22);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (S.phase === 'play' && S.paused) {          // paused: hold the exact frame that was on screen
    if (S.debugCam) {
      camera.position.copy(S.debugCam.pos);
      camera.lookAt(S.debugCam.look);
    }
    renderer.render(scene, camera);
    return;
  }
  S.time += dt;
  const playing = S.phase === 'play';

  if (playing) {
    stepQueen(dt);
    stepSharks(dt);
    const { onEye } = pickShark(mouse.ndc);
    el.cross.classList.toggle('hot', onEye);
    if (bonusTimer > 0) { bonusTimer -= dt; if (bonusTimer <= 0) el.bonus.classList.remove('on'); }
  } else if (S.phase !== 'intro') {
    for (let i = 0; i < sharks.length; i++) {     // idle drift behind the menus
      const s = sharks[i];
      if (s.dead) continue;
      s.phase += dt * s.w * 0.7;
      s.up01 = Math.max(0, s.up01 - dt);
      pose(s, S.time, dt);
    }
  }

  stepSparks(dt);
  world.updateEnv(dt, S.time, playing ? S.queenZ : 0);
  if (S.phase === 'intro') stepIntro(dt);      // after updateEnv, so the close-up wins
  if (S.shake > 0) {
    S.shake -= dt;
    const a = S.shake * 0.5;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
  }
  el.sharksLeft.classList.toggle('on', playing);
  const hudOn = S.phase !== 'board';
  if (hudOn !== S.hudOn) {
    S.hudOn = hudOn;
    el.hudCenter.style.opacity = hudOn ? '1' : '0';
  }

  if (S.debugCam) {
    camera.position.copy(S.debugCam.pos);
    camera.lookAt(S.debugCam.look);
  }

  renderer.render(scene, camera);

  if (!S.ready) {
    S.ready = true;
    document.title = 'RQS READY tris=' + renderer.info.render.triangles + ' sharks=' + sharks.length;
  }
}
animate();

/* ------------------------------------------------------------------ screens */
function show(node) {
  for (const s of [el.title, el.over, el.board, el.levelScr]) s.classList.remove('on');
  if (node) node.classList.add('on');
}

function startGame(skipIntro = false) {
  AC.init();
  S.phase = skipIntro ? 'play' : 'intro';
  S.introT = 0;
  if (skipIntro) musicStart(3);
  S.level = 1;
  S.score = 0; S.lives = 3; S.kills = 0;
  S.queenZ = S.queenTargetZ = 2;
  S.invuln = 0; S.shake = 0;
  S.paused = false; el.pause.classList.remove('on');
  el.score.textContent = '0';
  el.best.textContent = S.best;
  renderLives(); paintLevel();
  for (const s of sharks) { s.dead = false; spawnShark(s); }
  hideBeams();
  show(null);

  // she starts the game facing the camera, hand ready to wave
  queen.position.set(0, 0, S.queenZ);
  queen.rotation.set(0, Math.PI, 0);
  resetArms();
}

function levelClear() {
  S.phase = 'levelup';
  const bonus = 500 * S.level;
  addScore(bonus);
  const restored = S.lives < 3;
  S.lives = Math.min(3, S.lives + 1);
  renderLives();
  hideBeams();
  AC.level();
  const won = S.level >= MAX_LEVEL;
  el.lvTitle.innerHTML = won ? 'YOU <span>WIN</span>' : 'LEVEL ' + S.level + ' <span>CLEAR</span>';
  const nxt = LEVELS[Math.min(S.level, MAX_LEVEL - 1)];
  el.lvSub.textContent = won
    ? 'All ten levels. The pier is yours.'
    : 'Next: ' + nxt.sharks + ' sharks · ' + nxt.target + ' eyes · heads staying up ' + nxt.up.toFixed(1) + 's';
  el.lvBonus.textContent = '+' + bonus;
  el.lvNote.textContent = restored ? '+1 queen restored' : 'queens already full';
  $('#btn-next').textContent = won ? 'Finish' : 'Continue';
  show(el.levelScr);
}

function nextLevel() {
  if (S.phase !== 'levelup') return;
  if (S.level >= MAX_LEVEL) { gameOver(true); return; }
  S.level = nextLevelNumber(S.level);
  S.kills = 0;
  for (const s of sharks) { s.dead = false; spawnShark(s); }
  S.phase = 'play';
  hideBeams();
  show(null);
  paintLevel();
}

function gameOver(won = false) {
  S.phase = 'over';
  musicStop();
  AC.over();
  hideBeams();
  el.finalScore.textContent = S.score;
  el.overTitle.innerHTML = won ? 'YOU <span>WIN</span>' : 'GAME OVER';
  el.overSub.textContent = won
    ? 'Ten levels cleared. Every shark, in the eye.'
    : 'The sharks win this one — level ' + S.level + ' of ' + MAX_LEVEL;
  if (S.score <= 0) {
    S.phase = 'board';
    show(el.board);
    startPolling();
    return;
  }
  resetName();
  show(el.over);
  S.phase = 'name';
}

/* ---------------- name entry ---------------- */
const LETTERS = RULES_LETTERS.join('');
let nameSlots = [0, 0, 0], nameIdx = 0;

function resetName() { nameSlots = [0, 0, 0]; nameIdx = 0; paintName(); }

function paintName() {
  el.slots.forEach((s, i) => {
    s.classList.toggle('active', i === nameIdx);
    s.querySelector('.glyph').textContent = LETTERS[nameSlots[i]];
  });
}

function nameKey(e) {
  if (e.key === 'Backspace') {
    if (nameIdx > 0) nameIdx--; else nameSlots[0] = 0;
    paintName(); e.preventDefault(); return;
  }
  if (e.key === 'ArrowLeft') { nameIdx = Math.max(0, nameIdx - 1); paintName(); e.preventDefault(); return; }
  if (e.key === 'ArrowRight') { nameIdx = Math.min(2, nameIdx + 1); paintName(); e.preventDefault(); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const d = e.key === 'ArrowUp' ? 1 : -1;
    nameSlots[nameIdx] = (nameSlots[nameIdx] + d + 26) % 26;
    paintName(); e.preventDefault(); return;
  }
  if (e.key === 'Enter') { submitName(); e.preventDefault(); return; }
  const ch = e.key.toUpperCase();
  if (ch.length === 1 && LETTERS.includes(ch)) {
    nameSlots[nameIdx] = LETTERS.indexOf(ch);
    if (nameIdx < 2) nameIdx++;
    paintName();
    e.preventDefault();
  }
}

el.slots.forEach((slot, i) => {
  slot.querySelector('.up').addEventListener('click', (e) => {
    e.stopPropagation(); nameIdx = i; nameSlots[i] = (nameSlots[i] + 1) % 26; paintName();
  });
  slot.querySelector('.down').addEventListener('click', (e) => {
    e.stopPropagation(); nameIdx = i; nameSlots[i] = (nameSlots[i] + 25) % 26; paintName();
  });
  slot.querySelector('.glyph').addEventListener('click', () => { nameIdx = i; paintName(); });
});

/* ------------------------------------------------------------------ scoreboard */
const board = { list: [], me: null, timer: 0, busy: false };

async function fetchBoard() {
  if (board.busy) return;
  board.busy = true;
  try {
    const r = await fetch(API + '/scores', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    board.list = Array.isArray(data.scores) ? data.scores : [];
    board.online = true;
  } catch (err) {
    board.online = false;
    board.error = err.message;
  } finally {
    board.busy = false;
    drawBoard();
  }
}

function drawBoard() {
  if (!board.online) {
    el.boardStatus.textContent = 'offline — ' + (board.error || 'cannot reach the score server');
    if (!board.list.length) {
      el.boardBody.innerHTML = '<div class="empty">No connection to the score server.</div>';
      return;
    }
  } else {
    el.boardStatus.textContent = 'live · updates every ' + (POLL_MS / 1000) + 's · ' + board.list.length + ' on the board';
  }
  if (!board.list.length) {
    el.boardBody.innerHTML = '<div class="empty">Nobody yet. Be the first queen.</div>';
    return;
  }
  const rows = board.list.map((s, i) => {
    const me = board.me && s.name === board.me.name && s.score === board.me.score ? ' class="me"' : '';
    return '<tr' + me + '><td class="rank">' + (i + 1) + '</td><td class="name">' + escapeHtml(s.name)
      + '</td><td class="score">' + s.score + '</td></tr>';
  }).join('');
  el.boardBody.innerHTML = '<table><thead><tr><th></th><th>Name</th><th style="text-align:right">Score</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function submitName() {
  const name = initialsOf(nameSlots);
  S.phase = 'board';
  show(el.board);
  el.boardStatus.textContent = 'saving…';
  try {
    const r = await fetch(API + '/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, score: S.score, wave: S.level }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    board.me = { name, score: S.score };
  } catch (err) {
    board.me = null;
    el.boardStatus.textContent = 'could not save — ' + err.message;
  }
  await fetchBoard();
  startPolling();
}

function startPolling() {
  clearInterval(board.timer);
  board.timer = setInterval(() => {
    if (document.hidden) return;
    if (el.board.classList.contains('on')) fetchBoard();
  }, POLL_MS);
  fetchBoard();
}

/* ------------------------------------------------------------------ buttons */
$('#btn-play').addEventListener('click', () => startGame());
$('#btn-board').addEventListener('click', () => { show(el.board); startPolling(); });
$('#btn-again').addEventListener('click', () => startGame());
$('#btn-close').addEventListener('click', () => show(S.phase === 'name' ? el.over : el.title));
$('#btn-submit').addEventListener('click', submitName);
$('#btn-skip').addEventListener('click', () => { S.phase = 'board'; show(el.board); startPolling(); });
$('#btn-next').addEventListener('click', nextLevel);

if (el.vol) {
  const onVol = () => {
    musicVol = Math.max(0, Math.min(1, Number(el.vol.value) / 100));
    localStorage.setItem(VOL_KEY, String(musicVol));
    initMusic();
    if (music) music.setVolume(musicVol);
    paintVolume();
  };
  el.vol.addEventListener('input', onVol);
  el.vol.addEventListener('change', onVol);
  // the arrow keys belong to the queen while a level is running
  el.vol.addEventListener('keydown', (e) => {
    if (e.key.startsWith('Arrow') || e.code === 'Space') e.stopPropagation();
  });
  el.vol.addEventListener('pointerdown', (e) => e.stopPropagation());
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && el.board.classList.contains('on')) fetchBoard();
});

/* ------------------------------------------------------------------ boot */
buildQueenPips(); renderLives(); paintLevel(); paintVolume();
el.best.textContent = S.best;
el.cross.style.left = mouse.x + 'px';
el.cross.style.top = mouse.y + 'px';
fetchBoard();
console.log('[red-queen-shark] ready');

/* ------------------------------------------------------------------ dev hooks */
const Q = new URLSearchParams(location.search);

if (Q.has('play')) startGame(true);

if (Q.has('audio')) {
  // build every sound once and report anything that throws
  const errs = [];
  try {
    AC.init();
    for (const fn of ['shoot', 'buzz', 'zap', 'hit', 'bonus', 'hurt', 'level', 'over']) {
      try { AC[fn](); } catch (e) { errs.push(fn + ':' + e.message); }
    }
    explode(new THREE.Vector3(0, 0, -6));
  } catch (e) {
    errs.push('init:' + e.message);
  }
  let musicErr = 'none';
  try {
    initMusic();
    musicStart(3);
    music.setLives(2);
    music.setLives(1);
    music.setVolume(0.5);
  } catch (e) {
    musicErr = e.message;
  }
  setTimeout(() => {
    document.title = 'AUDIO ctx=' + (AC.ctx ? AC.ctx.state : 'none')
      + ' rate=' + (AC.ctx ? AC.ctx.sampleRate : 0)
      + ' music=' + (music ? 'built vol=' + music.volume : 'none')
      + ' musicErr=' + musicErr
      + ' errors=' + (errs.length ? errs.join('|') : 'none');
  }, 600);
}

if (Q.has('sharkview')) {
  // park one shark in the open, surfaced and still, and put the camera on it
  startGame(true);
  const which = Number(Q.get('sharkview')) || 0;
  const ang = Number(Q.get('ang') || 38) * Math.PI / 180;
  const dist = Number(Q.get('dist') || 7.5);
  const tall = Number(Q.get('tall') || 2.6);
  const sh = sharks[which];
  sh.dead = false;
  sh.state = 'up';
  sh.up01 = 1;
  sh.timer = 999;
  sh.bursts = 0;
  sh.freeze = true;
  sh.w = 0;
  const SX = Number(Q.get('sx') || 26), SZ = -30;
  sh.cx = SX; sh.cz = SZ; sh.r = 0;
  sh.phase = Number(Q.get('yaw') || 90) * Math.PI / 180;
  sh.scale = Number(Q.get('scale') || 1.35);
  sh.mesh.group.scale.setScalar(sh.scale);
  pose(sh, 0, 0);
  if (Q.has('dry')) sh.mesh.group.position.y = WATER_Y + 0.9;   // fully out of the water, to inspect it
  sh.mesh.group.updateMatrixWorld(true);
  S.debugCam = {
    pos: new THREE.Vector3(SX + Math.sin(ang) * dist, tall, SZ + Math.cos(ang) * dist),
    look: new THREE.Vector3(SX, 0.3, SZ),
  };
  setTimeout(() => {
    document.title = 'SHARKVIEW ' + which + ' up01=' + sh.up01.toFixed(1)
      + ' scale=' + sh.scale.toFixed(2) + ' yaw=' + (sh.phase * 180 / Math.PI).toFixed(0);
  }, 300);
}

if (Q.has('click')) {
  // the real path: click Play, then watch what happens to the wave and to the music
  const log = [];
  setTimeout(() => {
    document.getElementById('btn-play').click();
    log.push('afterClick:phase=' + S.phase + ':music=' + (music && music.running ? 'ON' : 'off'));
    S.introT = Number(Q.get('clickat') || 1.0);
    stepIntro(1 / 60);
    log.push('atWave:phase=' + S.phase + ':music=' + (music && music.running ? 'ON' : 'off'));
    S.introT = 2.1;
    stepIntro(1 / 60);
    log.push('afterTurn:phase=' + S.phase + ':music=' + (music && music.running ? 'ON' : 'off'));
    if (music) music.setLives(1);
    log.push('oneQueenTempo=' + (music ? music.tempo : 0));
    document.title = 'CLICK ' + log.join(' ');
  }, 300);
}

if (Q.has('tempo')) {
  // prove the music tightens as the queens fall
  const out = [];
  try {
    AC.init();
    initMusic();
    for (const n of [3, 2, 1]) { music.setLives(n); out.push(n + ':' + music.tempo.toFixed(2) + 's'); }
    music.setVolume(0.5);
  } catch (e) { out.push('ERR ' + e.message); }
  setTimeout(() => {
    document.title = 'TEMPO ' + out.join(' ') + ' vol=' + (music ? music.volume : '?')
      + ' slider=' + el.vol.value + ' label=' + el.volPct.textContent;
  }, 500);
}

if (Q.has('introat')) {
  // jump the intro clock to a given second: headless runs too few frames to reach it by time
  startGame();
  const at = Number(Q.get('introat'));
  setTimeout(() => {
    S.introT = at;
    for (let i = 0; i < 4; i++) stepIntro(1 / 60);
    document.title = 'INTROAT t=' + at + ' phase=' + S.phase
      + ' wave=' + (queen.userData.waveArm ? queen.userData.waveArm.visible : '?')
      + ' arm=' + (queen.userData.arms ? queen.userData.arms.right.visible : '?')
      + ' rotY=' + queen.rotation.y.toFixed(2)
      + ' hudOn=' + S.hudOn + ' hudOp=' + (el.hudCenter.style.opacity || '(unset)');
  }, 400);
}

if (Q.has('intro')) {
  startGame();          // force the wave, for watching it
  setTimeout(() => {
    document.title = 'INTRO phase=' + S.phase + ' t=' + S.introT.toFixed(2)
      + ' wave=' + (queen.userData.waveArm ? queen.userData.waveArm.visible : '?')
      + ' arm=' + (queen.userData.arms ? queen.userData.arms.right.visible : '?')
      + ' hudOn=' + S.hudOn
      + ' hudOp=' + el.hudCenter.style.opacity
      + ' rotY=' + queen.rotation.y.toFixed(2);
  }, 3200);
}

if (Q.has('level')) {
  startGame(true);
  S.level = Math.min(MAX_LEVEL, Math.max(1, Number(Q.get('level')) || 1));
  S.kills = 0;
  paintLevel();
}

if (Q.has('sim')) {
  startGame(true);
  const out = [];
  const step = (n, fn) => { for (let i = 0; i < n; i++) { S.time += 1 / 60; fn(1 / 60); } };

  // a) a head pointed at her must cost a life
  {
    const s = sharks[0];
    s.state = 'up'; s.up01 = 1; s.bursts = 1; s.aimT = 0; s.aimErr = 0; s.onTarget = 0;
    s.dead = false; s.freeze = true;
    s.mesh.group.position.set(0, WATER_Y + 0.16, S.queenZ + 21);
    s.mesh.group.rotation.set(0, Math.PI, 0);       // nose pointing back at her
    s.mesh.group.updateMatrixWorld(true);
    step(3, stepSharks);
    out.push('onAxis:' + S.lives);
  }
  // b) the same shark facing away must not
  {
    S.invuln = 0;
    const s = sharks[1];
    s.state = 'up'; s.up01 = 1; s.bursts = 1; s.aimT = 0; s.aimErr = 999; s.onTarget = 0;
    s.dead = false; s.freeze = true;
    s.mesh.group.position.set(0, WATER_Y + 0.16, S.queenZ + 21);
    s.mesh.group.rotation.set(0, 0, 0);
    s.mesh.group.updateMatrixWorld(true);
    step(3, stepSharks);
    out.push('offAxis:' + S.lives);
  }
  // c) a fully submerged shark must be untargetable
  {
    const s = sharks[2];
    s.state = 'down'; s.up01 = 0;
    const cam = camera.position.clone();
    const p = s.mesh.head.getWorldPosition(new THREE.Vector3()).project(camera);
    mouse.ndc.set(p.x, p.y);
    const { best } = pickShark(mouse.ndc);
    out.push('sunkenTarget:' + (best ? 'YES' : 'no'));
    camera.position.copy(cam);
  }
  // c2) a surfaced shark turns its head onto her — standing still gets you shot
  {
    const calm = () => {
      for (const sh2 of sharks) {
        sh2.dead = false; sh2.freeze = false; sh2.w = 0; sh2.r = 0; sh2.phase = 0;
        sh2.state = 'down'; sh2.up01 = 0; sh2.bursts = 0; sh2.onTarget = 0;
        sh2.firing = 0; sh2.aimOffset = 0; sh2.aimT = 99; sh2.timer = 99;
      }
      S.lives = 3; S.invuln = 0; S.queenTargetZ = S.queenZ;
    };
    calm();
    const s = sharks[0];
    s.cx = -10; s.cz = S.queenZ - 20;
    s.state = 'up'; s.up01 = 1; s.timer = 99; s.bursts = 1; s.aimT = 99;
    for (let i = 0; i < 200; i++) { S.time += 1 / 60; stepSharks(1 / 60); }
    out.push('aimed:' + S.lives + ':err' + s.aimErr.toFixed(2) + ':shots' + (1 - s.bursts));

    // c3) she is behind the head: it cannot turn that far, so the shot goes wide
    calm();
    const b2 = sharks[0];
    b2.cx = -10; b2.cz = S.queenZ + 20;
    b2.state = 'up'; b2.up01 = 1; b2.timer = 99; b2.bursts = 1; b2.aimT = 1.0;
    for (let i = 0; i < 200; i++) { S.time += 1 / 60; stepSharks(1 / 60); }
    out.push('behind:' + S.lives + ':err' + b2.aimErr.toFixed(2) + ':shots' + (1 - b2.bursts));

    // c4) level 1 with her walking: the head cannot hold the lock, so the shot goes wide
    calm();
    const m3 = sharks[0];
    m3.cx = -10; m3.cz = S.queenZ - 20;
    m3.state = 'up'; m3.up01 = 1; m3.timer = 99; m3.bursts = 1; m3.aimT = 2.0;
    keys.KeyW = true;
    for (let i = 0; i < 210; i++) { S.time += 1 / 60; stepQueen(1 / 60); stepSharks(1 / 60); }
    keys.KeyW = false;
    out.push('walking:' + S.lives + ':err' + m3.aimErr.toFixed(2) + ':shots' + (1 - m3.bursts));
    calm();
  }

  // d) level progression
  {
    S.phase = 'play'; S.kills = 0; S.lives = 1;
    for (let k = 0; k < LEVELS[0].target; k++) addKill();
    out.push('afterL1:' + S.phase + ':lvl' + S.level);
    nextLevel();
    out.push('l2:' + S.phase + ':lvl' + S.level + ':k' + S.kills);
    S.kills = LEVELS[1].target - 1;
    addKill();
    out.push('l2clear:' + S.phase);
  }
  document.title = 'RQS SIM ' + out.join(' ');
}

if (Q.has('test3')) {
  startGame(true);
  S.score = 4200; el.score.textContent = '4200'; S.kills = 3;
  setTimeout(() => gameOver(), 400);
}

if (Q.has('test2')) {
  startGame(true);
  setTimeout(() => damage(), 300);
  setTimeout(() => { S.invuln = 0; damage(); }, 700);
  setTimeout(() => { S.invuln = 0; damage(); }, 1100);
  // a diagnostic run must never write to the live board: the real write needs writetest=1
  setTimeout(() => { nameSlots = [6, 0, 18]; nameIdx = 3; paintName(); if (Q.has('writetest')) submitName(); }, 1700);
  setTimeout(() => {
    document.title = 'RQS TEST2 phase=' + S.phase + ' lives=' + S.lives
      + ' over=' + el.over.classList.contains('on') + ' board=' + el.board.classList.contains('on')
      + ' rows=' + board.list.length + ' me=' + (board.me ? board.me.name + ':' + board.me.score : 'none');
  }, 3600);
}

if (Q.has('test')) {
  startGame(true);
  let n = 0;
  const probe = new THREE.Vector3();
  const iv = setInterval(() => {
    const upNow = active().filter((s) => !s.dead && s.state === 'up');
    if (!upNow.length) {
      const s = active().find((x) => !x.dead);
      if (s) { s.state = 'up'; s.up01 = 1; s.timer = 5; s.bursts = 0; }
    }
    const alive = active().filter((s) => !s.dead && s.up01 > 0.6);
    if (alive.length) {
      const s = alive[n % alive.length];
      s.mesh.group.updateMatrixWorld(true);
      s.mesh.head.getWorldPosition(probe).project(camera);
      mouse.ndc.set(probe.x, probe.y);
      mouse.x = (probe.x + 1) / 2 * innerWidth;
      mouse.y = (1 - probe.y) / 2 * innerHeight;
      shoot();
    }
    n++;
    if (n >= 44) {
      clearInterval(iv);
      document.title = 'RQS TEST score=' + S.score + ' lives=' + S.lives + ' kills=' + S.kills
        + ' phase=' + S.phase + ' level=' + S.level
        + ' board=' + (board.online ? 'online' : 'offline') + ' rows=' + board.list.length;
    }
  }, 120);
}

if (Q.has('lives')) {
  startGame(true);
  S.lives = Number(Q.get('lives'));
  renderLives();
}

if (Q.has('killn')) {
  startGame(true);
  const n = Number(Q.get('killn') || 1);
  setTimeout(() => {
    for (let k = 0; k < n; k++) {
      const s2 = active().find((x) => !x.dead);
      if (s2) killShark(s2);
      addKill();
    }
    document.title = 'KILL kills=' + S.kills + ' target=' + levelCfg().target
      + ' pips=' + [...el.sharksLeft.children].filter((c) => !c.classList.contains('gone')).length
      + ' phase=' + S.phase + ' lives=' + S.lives;
  }, 400);
}

if (Q.has('death')) {
  startGame(true);
  const victim = sharks[0];
  const steps = Math.round(Number(Q.get('death') || 0.9) * 60);
  setTimeout(() => {
    victim.freeze = true;
    victim.state = 'up'; victim.up01 = 1; victim.bursts = 0;
    victim.mesh.group.position.set(-7, WATER_Y + 0.35, S.queenZ - 17);
    victim.mesh.group.rotation.set(0, Math.PI * 0.82, 0);
    victim.mesh.group.updateMatrixWorld(true);
    killShark(victim);
    for (let i = 0; i < steps; i++) { S.time += 1 / 60; stepSharks(1 / 60); }
    document.title = 'DEATH t=' + victim.deadT.toFixed(2)
      + ' rotX=' + victim.mesh.group.rotation.x.toFixed(2)
      + ' y=' + victim.mesh.group.position.y.toFixed(2)
      + ' op=' + victim.mesh.skin.opacity.toFixed(2);
  }, 300);
}

if (Q.has('lvl')) {
  startGame(true);
  S.score = 2310; el.score.textContent = '2310'; S.lives = 2; renderLives();
  setTimeout(() => levelClear(), 300);
}

// a handle for automated checks: read the live state without changing the game
if (Q.has('debug')) globalThis.RQ = { S, sharks, el, queen, keys, music };

if (Q.has('pose')) {
  const mode = Q.get('pose');
  startGame(true);
  for (const s of sharks) {
    if (!s.dead) { s.state = mode; s.up01 = mode === 'up' ? 1 : 0; s.timer = 60; s.bursts = 0; }
  }
  if (Q.has('fire')) {
    setTimeout(() => {
      const s0 = active()[0];
      s0.state = 'up'; s0.up01 = 1;
      s0.mesh.group.position.set(15, WATER_Y + 0.4, S.queenZ - 24);
      s0.mesh.group.rotation.set(0, -Math.PI / 2, 0);
      s0.mesh.group.updateMatrixWorld(true);
      s0.freeze = true;                 // hold the pose so a screenshot can see the beam
      fireShark(s0, 0);
      s0.firing = 999;                 // pin the burst on for the screenshot
    }, 200);
  }
  setTimeout(() => { document.title = 'POSE ' + mode + ' up01=' + sharks.map((x) => x.up01.toFixed(1)).join(','); }, 2000);
}

if (Q.has('cam')) {
  startGame(true);
  setTimeout(() => {
    document.title = 'CAM cam=' + camera.position.toArray().map((v) => v.toFixed(2))
      + ' queen=' + queen.position.toArray().map((v) => v.toFixed(2))
      + ' up=' + sharks.map((s) => s.up01.toFixed(1)).join(',');
  }, 2500);
}
