// Unit tests: the rules of the game, in Node, with no browser anywhere near them.
//
// These are the tests that can be reasoned about. The end-to-end suite proves the product works and
// the static suite proves the page obeys the house standard; this one proves the arithmetic that the
// sales pitch stands on — that a shark physically cannot point its laser at the queen without
// turning its head to find her first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, MAX_LEVEL, levelFor, wrapAngle, headReach, headOnTarget, MAX_HEAD_TURN,
  SCORE, shotScore, levelCleared, nextLevelNumber, clampQueenZ, LETTERS, initialsOf, validName, validScore,
} from '../site/rules.js';

/* ------------------------------------------------------------------ the ten levels */

test('there are ten levels, and level one is the gentlest', () => {
  assert.equal(MAX_LEVEL, 10);
  const one = levelFor(1);
  const ten = levelFor(10);
  assert.ok(one.sink > ten.sink, 'level one keeps them under longer');
  assert.ok(one.slew < ten.slew, 'level one turns its head slower');
  assert.ok(one.target <= ten.target, 'level one asks for no more kills than level ten');
});

test('difficulty never goes backwards as the level rises', () => {
  // Every one of these is a knob that makes the game harder when it goes up.
  const harder = ['target', 'rate', 'bursts', 'speed', 'maxUp', 'slew'];
  for (let i = 1; i < LEVELS.length; i++) {
    for (const key of harder) {
      assert.ok(
        LEVELS[i][key] >= LEVELS[i - 1][key],
        `level ${i + 1} has a lower ${key} (${LEVELS[i][key]}) than level ${i} (${LEVELS[i - 1][key]})`
      );
    }
  }
  // And these make it harder by going down.
  for (let i = 1; i < LEVELS.length; i++) {
    for (const key of ['sink', 'up', 'charge', 'gap', 'aim', 'settle']) {
      assert.ok(
        LEVELS[i][key] <= LEVELS[i - 1][key],
        `level ${i + 1} has a higher ${key} (${LEVELS[i][key]}) than level ${i} (${LEVELS[i - 1][key]})`
      );
    }
  }
});

test('level one is winnable: at least one shark comes up inside the shot window', () => {
  const one = levelFor(1);
  assert.ok(one.up >= 2.5, 'the surface window has to be long enough to aim in');
  assert.ok(one.charge <= one.up, 'it must not take longer to get ready than it stays up');
  assert.ok(one.target > 0 && one.sharks > 0, 'a level with no sharks or no target cannot be cleared');
});

test('levelFor clamps nonsense instead of returning undefined', () => {
  assert.equal(levelFor(0), LEVELS[0]);
  assert.equal(levelFor(-5), LEVELS[0]);
  assert.equal(levelFor(99), LEVELS[MAX_LEVEL - 1]);
  assert.equal(levelFor(2.9), LEVELS[1], 'a fractional level floors rather than falling off the table');
  assert.equal(levelFor(NaN), LEVELS[0]);
});

/* ------------------------------------------------------------------ the one fair rule */

test('wrapAngle folds every angle into one turn of the circle', () => {
  assert.ok(Math.abs(wrapAngle(0)) < 1e-12);
  assert.ok(Math.abs(wrapAngle(2 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(wrapAngle(-2 * Math.PI)) < 1e-12);
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9);
  for (const a of [-100, -7, -1, 0, 1, 7, 100]) {
    const w = wrapAngle(a);
    assert.ok(w > -Math.PI - 1e-9 && w <= Math.PI + 1e-9, `wrapAngle(${a}) = ${w} left the circle`);
  }
});

test('a head cannot reach past its own arc — this is the whole game', () => {
  assert.equal(headReach(0), 0);
  assert.equal(headReach(0.5), 0.5, 'inside the arc it reaches exactly where it wants');
  assert.equal(headReach(MAX_HEAD_TURN), MAX_HEAD_TURN, 'the edge of the arc is reachable');
  assert.equal(headReach(2.0), MAX_HEAD_TURN, 'beyond the arc it is capped');
  assert.equal(headReach(-2.0), -MAX_HEAD_TURN, 'and capped the same way to the left');

  // The claim on the front page, as arithmetic: stand behind it and it cannot point at you.
  const behind = Math.PI;
  assert.equal(headReach(behind), MAX_HEAD_TURN, 'a shark behind her cannot turn far enough');
  assert.ok(Math.abs(behind - headReach(behind)) > 1, 'and the error is large, not small');
});

test('headOnTarget is true only inside the arc, and never on the boundary', () => {
  assert.equal(headOnTarget(0), true);
  assert.equal(headOnTarget(MAX_HEAD_TURN - 0.02), true);
  assert.equal(headOnTarget(MAX_HEAD_TURN), false, 'on the boundary is already off target');
  assert.equal(headOnTarget(Math.PI), false);
  assert.equal(headOnTarget(-Math.PI), false);
  // The arc is symmetric — walking to either side works equally.
  assert.equal(headOnTarget(1.2), headOnTarget(-1.2));
});

/* ------------------------------------------------------------------ scoring */

test('an eye shot is 100, and 300 while the laser is lit', () => {
  assert.equal(shotScore('eye', false), 100);
  assert.equal(shotScore('eye', true), 300);
  assert.equal(shotScore('body'), 25);
  assert.equal(shotScore('body', true), 25, 'a body hit does not become a bonus because a beam is lit');
  assert.equal(shotScore('nothing'), 0);
});

test('the score table and the scoring function agree', () => {
  assert.equal(shotScore('eye', false), SCORE.EYE_BASE);
  assert.equal(shotScore('eye', true), SCORE.EYE_BONUS);
  assert.equal(shotScore('body'), SCORE.BODY);
  assert.ok(SCORE.EYE_BONUS > SCORE.EYE_BASE, 'the risky shot must be worth more');
});

/* ------------------------------------------------------------------ progress */

test('a level clears on its own target, not before', () => {
  assert.equal(levelCleared(0, 1), false);
  assert.equal(levelCleared(levelFor(1).target - 1, 1), false);
  assert.equal(levelCleared(levelFor(1).target, 1), true);
  assert.equal(levelCleared(levelFor(1).target + 5, 1), true);
});

test('the level number stops at the last level', () => {
  assert.equal(nextLevelNumber(1), 2);
  assert.equal(nextLevelNumber(9), 10);
  assert.equal(nextLevelNumber(10), 10);
});

test('the queen stays on the walkable part of the dock', () => {
  const [z0, z1] = [14, -190];
  assert.equal(clampQueenZ(1000, z0, z1), z0 - 3, 'she cannot walk off the near end');
  assert.equal(clampQueenZ(-1000, z0, z1), z1 + 12, 'or off the far end');
  assert.equal(clampQueenZ(0, z0, z1), 0, 'and is untouched in the middle');
});

/* ------------------------------------------------------------------ the board's rules */

test('initials are exactly three letters, from the slots', () => {
  assert.equal(initialsOf([0, 0, 0]), 'AAA');
  assert.equal(initialsOf([25, 25, 25]), 'ZZZ');
  assert.equal(LETTERS.length, 26);
  assert.equal(initialsOf([6, 0, 18]), 'GAS');
  // A slot that has been cycled past either end wraps rather than throwing:
  // 26 is A again, 52 is A again, and -1 is Z (the one step back from A).
  assert.equal(initialsOf([26, 52, -1]), 'AAZ');
});

test('the board refuses anything that is not three capital letters', () => {
  assert.equal(validName('ABC'), true);
  assert.equal(validName('ZZZ'), true);
  for (const bad of ['AB', 'ABCD', '', 'ab', 'A1C', ' A ', null, undefined, 42, 'AAA ']) {
    assert.equal(validName(bad), false, `${JSON.stringify(bad)} must be refused`);
  }
});

test('the board refuses scores that are not whole numbers in range', () => {
  assert.equal(validScore(0), true);
  assert.equal(validScore(700), true);
  for (const bad of [-1, 1.5, NaN, Infinity, 1e9, '100', null, undefined]) {
    assert.equal(validScore(bad), false, `${String(bad)} must be refused`);
  }
});
