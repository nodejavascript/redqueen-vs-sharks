// The rules of the game, with nothing in them that needs a browser, a canvas or a clock.
//
// This file exists so the rules can be TESTED. The design claim on the front page — that no shark
// can ever shoot you without pointing its head at you first — is a claim about arithmetic, so the
// arithmetic lives here and `test/units.test.js` proves it in Node, with no WebGL in sight.

/* ------------------------------------------------------------------ levels */

/**
 * Ten levels, fixed. Nothing is randomised and nothing is invented at runtime, so a difficulty
 * curve that is unwinnable is a table editing mistake, not bad luck.
 *
 *   sharks   shards in the water at once
 *   target   sharks to sink before the level is cleared
 *   sink/up  seconds under, seconds surfaced — the window you can shoot into
 *   charge   seconds of head turn before it can fire
 *   sweep    how far the idle head sweeps, in radians
 *   rate     sweeps per second
 *   bursts   shots it gets while surfaced before it has to dive
 *   gap      seconds between bursts
 *   speed    swim speed
 *   maxUp    how many may surface at the same time
 *   beam     beam length as a multiple of the water-to-eye distance
 *   aim      seconds it keeps the beam lit while pointing
 *   slew     radians per second the head turns — the whole fairness of the game
 *   settle   seconds the head holds still before firing
 */
export const LEVELS = [
  { sharks: 3, target: 4,  sink: 7.0, up: 3.6,  charge: 1.10, sweep: 0.22, rate: 0.35, bursts: 1, gap: 1.7, speed: 0.80, maxUp: 1, beam: 1.35, aim: 1.55, slew: 0.55, settle: 0.45 },
  { sharks: 3, target: 5,  sink: 6.2, up: 3.4,  charge: 1.00, sweep: 0.26, rate: 0.45, bursts: 1, gap: 1.6, speed: 0.90, maxUp: 1, beam: 1.30, aim: 1.45, slew: 0.70, settle: 0.40 },
  { sharks: 4, target: 6,  sink: 5.6, up: 3.2,  charge: 0.95, sweep: 0.30, rate: 0.55, bursts: 1, gap: 1.5, speed: 1.00, maxUp: 1, beam: 1.28, aim: 1.35, slew: 0.85, settle: 0.36 },
  { sharks: 4, target: 7,  sink: 5.0, up: 3.0,  charge: 0.88, sweep: 0.34, rate: 0.65, bursts: 2, gap: 1.2, speed: 1.06, maxUp: 2, beam: 1.25, aim: 1.22, slew: 1.10, settle: 0.32 },
  { sharks: 5, target: 8,  sink: 4.6, up: 2.9,  charge: 0.80, sweep: 0.38, rate: 0.75, bursts: 2, gap: 1.1, speed: 1.12, maxUp: 2, beam: 1.22, aim: 1.10, slew: 1.35, settle: 0.29 },
  { sharks: 5, target: 9,  sink: 4.2, up: 2.7,  charge: 0.72, sweep: 0.42, rate: 0.85, bursts: 2, gap: 1.0, speed: 1.18, maxUp: 2, beam: 1.20, aim: 0.98, slew: 1.60, settle: 0.26 },
  { sharks: 6, target: 10, sink: 3.9, up: 2.5,  charge: 0.64, sweep: 0.46, rate: 0.95, bursts: 3, gap: 0.9, speed: 1.24, maxUp: 2, beam: 1.18, aim: 0.88, slew: 1.85, settle: 0.23 },
  { sharks: 6, target: 11, sink: 3.6, up: 2.35, charge: 0.56, sweep: 0.50, rate: 1.05, bursts: 3, gap: 0.8, speed: 1.32, maxUp: 3, beam: 1.16, aim: 0.78, slew: 2.05, settle: 0.21 },
  { sharks: 7, target: 12, sink: 3.3, up: 2.2,  charge: 0.48, sweep: 0.54, rate: 1.15, bursts: 3, gap: 0.7, speed: 1.40, maxUp: 3, beam: 1.14, aim: 0.68, slew: 2.30, settle: 0.19 },
  { sharks: 8, target: 14, sink: 3.0, up: 2.0,  charge: 0.40, sweep: 0.58, rate: 1.25, bursts: 4, gap: 0.6, speed: 1.50, maxUp: 3, beam: 1.12, aim: 0.58, slew: 2.55, settle: 0.18 },
];

export const MAX_LEVEL = LEVELS.length;

/** The config for a 1-based level number, clamped into the table. */
export function levelFor(level) {
  const n = Number.isFinite(level) ? Math.floor(level) : 1;
  return LEVELS[Math.min(Math.max(n, 1), MAX_LEVEL) - 1];
}

/* ------------------------------------------------------------------ angles */

/** Fold an angle in radians into (-π, π] — the shortest way round the circle. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** How far a head may turn — the one number the whole game balances on. */
export const MAX_HEAD_TURN = 0.95;

/**
 * The bearing a head actually reaches when it wants `want` but can only turn so far.
 * Beyond that arc it simply cannot point at her, which is why getting behind a shark works.
 */
export function headReach(want, maxTurn = MAX_HEAD_TURN) {
  return Math.min(Math.max(want, -maxTurn), maxTurn);
}

/** True when the head is inside its arc, i.e. the shot has a chance of landing on her. */
export function headOnTarget(want, maxTurn = MAX_HEAD_TURN) {
  return Math.abs(wrapAngle(want)) < maxTurn - 0.01;
}

/* ------------------------------------------------------------------ scoring */

export const SCORE = { EYE_BASE: 100, EYE_BONUS: 300, BODY: 25 };

/**
 * What a hit is worth.
 *
 * An eye shot is 100. The same shot while its laser is lit is 300, because that is the shot taken
 * at the moment the owner knows they are exposed — the risk and the reward are the same act.
 */
export function shotScore(kind, laserLit = false) {
  if (kind === 'eye') return laserLit ? SCORE.EYE_BONUS : SCORE.EYE_BASE;
  if (kind === 'body') return SCORE.BODY;
  return 0;
}

/* ------------------------------------------------------------------ progress */

/** Has this level been cleared? Kills are counted per level, not per game. */
export const levelCleared = (kills, level) => kills >= levelFor(level).target;

/** The next level number, never past the last one. */
export const nextLevelNumber = (level) => Math.min(Math.max(1, level) + 1, MAX_LEVEL);

/** Clamp the queen to the walkable part of the dock. */
export function clampQueenZ(z, deckZ0, deckZ1) {
  return Math.min(Math.max(z, deckZ1 + 12), deckZ0 - 3);
}

/* ------------------------------------------------------------------ the board */

/** Three letters, A-Z only — the arcade convention, and it keeps the board clean. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Turn three letter indexes into the initials the board stores. */
export const initialsOf = (slots) => slots.map((i) => LETTERS[((i % 26) + 26) % 26]).join('');

/** A board name is valid when it is exactly three capital letters. */
export const validName = (name) => typeof name === 'string' && /^[A-Z]{3}$/.test(name);

/** A score is valid when it is a whole number in range. Zero is allowed: you can die on level one. */
export const validScore = (score) => Number.isInteger(score) && score >= 0 && score <= 1_000_000;
