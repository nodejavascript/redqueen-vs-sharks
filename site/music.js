// An original suspense cue for Red Queen vs. Laser Sharks, written in the same idiom as a shark
// theme: a low two-note ostinato under a tremolo pad, tightening as the queens fall.
//
// This is NOT the Jaws theme. That is John Williams' copyrighted composition; this is a new motif
// built on a minor third (A1 -> C2) rather than a semitone, with its own voicing and arrangement.
//
// Tempo by queens remaining:
//   3 queens  slow, distant menace          every 0.60 s, pad barely there
//   2 queens  noticeably faster             every 0.42 s, pad up, tremolo faster
//   1 queen   fast, dissonant, heartbeat    every 0.26 s, tritone cluster, bass drum, pitch creep

const ROOT = 55.0;                    // A1
const ALT = 65.406;                   // C2 — a minor third above, not a semitone
const TEMPO = { 3: 0.60, 2: 0.42, 1: 0.26 };
const PAD_TR = { 3: 5.5, 2: 9.0, 1: 15.0 };

export function createMusic(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // ---- persistent pad (tremolo strings-ish), built once and modulated
  const padGain = ctx.createGain();
  padGain.gain.value = 0;

  const padMod = ctx.createGain();       // tremolo lives here
  padMod.gain.value = 1;
  padGain.connect(padMod).connect(master);

  const padLP = ctx.createBiquadFilter();
  padLP.type = 'lowpass';
  padLP.frequency.value = 620;
  padLP.Q.value = 1.2;
  padLP.connect(padGain);

  const padOscs = [ROOT * 0.5, ROOT * 0.5 * 1.004, ALT * 0.5].map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(padLP);
    o.start();
    return o;
  });

  const trem = ctx.createOscillator();
  trem.type = 'sine';
  trem.frequency.value = PAD_TR[3];
  const tremAmt = ctx.createGain();
  tremAmt.gain.value = 0.35;
  trem.connect(tremAmt).connect(padMod.gain);
  trem.start();

  // ---- dissonant top cluster, only for the last queen
  const dreadGain = ctx.createGain();
  dreadGain.gain.value = 0;
  dreadGain.connect(master);
  const dreadLP = ctx.createBiquadFilter();
  dreadLP.type = 'bandpass';
  dreadLP.frequency.value = 1150;
  dreadLP.Q.value = 2.8;
  dreadLP.connect(dreadGain);
  const dreadOscs = [ROOT * 2, ROOT * 2.828].map((f) => {   // tritone
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(dreadLP);
    o.start();
    return o;
  });

  let vol = 0.5;
  let fade = 1;
  let lives = 3;
  let running = false;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let creep = 0;

  const applyGain = () => {
    const target = vol * fade * 0.9;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
  };

  const interval = () => TEMPO[Math.min(3, Math.max(1, lives))] || 0.6;

  function voice(t, freq, amp, dur, type = 'sawtooth', cut = 340) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(freq * 2.006, t);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cut, t);
    lp.Q.value = 5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(lp); o2.connect(lp);
    lp.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  }

  function thump(t) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(74, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(lives === 1 ? 0.5 : 0.26, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.28);
  }

  function playStep(t, i) {
    // the ostinato creeps upward a little on the last queen — the classic "it is getting closer"
    const creepHz = lives === 1 ? creep : 0;
    const base = (i % 2 === 0 ? ROOT : ALT) + creepHz;
    const dur = Math.min(interval() * 1.7, 0.95);
    const amp = lives === 1 ? 0.46 : lives === 2 ? 0.40 : 0.34;
    voice(t, base, amp, dur, 'sawtooth', lives === 1 ? 420 : 320);

    if (lives <= 2 && i % 4 === 0) thump(t);
    if (lives === 1 && i % 4 === 2) thump(t + interval() * 0.5);   // double-time heartbeat
  }

  function tick() {
    if (!running) return;
    const horizon = ctx.currentTime + 0.18;
    while (nextTime < horizon) {
      playStep(nextTime, step);
      step++;
      if (lives === 1) creep = Math.min(6.5, creep + 0.055);       // slow pitch rise, capped
      nextTime += interval();
    }
  }

  function setLives(n) {
    lives = Math.max(1, Math.min(3, n));
    const t = ctx.currentTime;
    trem.frequency.setTargetAtTime(PAD_TR[lives], t, 0.3);
    tremAmt.gain.setTargetAtTime(lives === 1 ? 0.55 : lives === 2 ? 0.45 : 0.35, t, 0.3);
    padGain.gain.setTargetAtTime(lives === 1 ? 0.16 : lives === 2 ? 0.12 : 0.07, t, 0.35);
    dreadGain.gain.setTargetAtTime(lives === 1 ? 0.075 : 0, t, 0.4);
    if (lives !== 1) creep = 0;
  }

  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
    applyGain();
  }

  function start() {
    if (running) return;
    running = true;
    step = 0;
    creep = 0;
    nextTime = ctx.currentTime + 0.06;
    setLives(lives);
    fade = 1;
    applyGain();
    clearInterval(timer);
    timer = setInterval(tick, 40);
    tick();
  }

  function stop(immediate = false) {
    if (!running) return;
    running = false;
    clearInterval(timer);
    timer = null;
    if (immediate) {
      fade = 0;
      applyGain();
    } else {
      fade = 0;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.18);
    }
    padGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    dreadGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }

  function dispose() {
    stop(true);
    for (const o of [...padOscs, ...dreadOscs, trem]) {
      try { o.stop(); } catch { /* already stopped */ }
    }
  }

  return {
    start, stop, setLives, setVolume, dispose,
    get volume() { return vol; },
    get tempo() { return interval(); },
    get queens() { return lives; },
    get running() { return running; },
  };
}
