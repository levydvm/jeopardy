/**
 * Run with: node tests/buzzer.test.mjs
 */
import assert from 'node:assert/strict';
import { normalizeTimers } from '../js/timers.js';
import {
  allowsTeamBuzz,
  freshBuzz,
  isEarlyLocked,
  markIncorrect,
  noteEarlyBuzz,
  openBuzzWindow,
  receiveBuzz,
  startAnswerClock,
  tickBuzz,
} from '../js/buzzer.js';

const timers = normalizeTimers(null);
assert.equal(timers.buzzSeconds, 5);
assert.equal(timers.answerSeconds, 5);
assert.equal(timers.dailyDoubleSeconds, 15);
assert.equal(timers.earlyLockoutSeconds, 0.25);
assert.equal(timers.autoMarkOnTimeout, false);
assert.equal(normalizeTimers({}).earlyLockoutSeconds, 0.25);
assert.equal(normalizeTimers({ earlyLockoutSeconds: 0 }).earlyLockoutSeconds, 0);
assert.equal(normalizeTimers({ earlyLockoutSeconds: 9 }).earlyLockoutSeconds, 0.25);
assert.equal(normalizeTimers({ buzzSeconds: 0 }).buzzSeconds, 5);

const off = normalizeTimers({ earlyLockoutSeconds: 0 });
let buzz = noteEarlyBuzz(freshBuzz(), 0, off, 1000);
assert.equal(isEarlyLocked(buzz, 0, 1000), false);

buzz = noteEarlyBuzz(freshBuzz(), 0, timers, 1000);
assert.equal(isEarlyLocked(buzz, 0, 1200), true);
assert.equal(isEarlyLocked(buzz, 0, 1250), false);
buzz = noteEarlyBuzz(buzz, 0, timers, 1100);
assert.equal(isEarlyLocked(buzz, 0, 1300), true, 'another early press restarts the lockout');

buzz = openBuzzWindow(buzz, timers, 1100, 2);
const blocked = receiveBuzz(buzz, 0, 1200);
assert.equal(blocked.accepted, false);
assert.equal(blocked.reason, 'early');
assert.equal(blocked.buzz.phase, 'window');
assert.equal(blocked.buzz.winner, null);
const other = receiveBuzz(buzz, 1, 1200);
assert.equal(other.accepted, true);
assert.equal(other.buzz.winner, 1);

const after = receiveBuzz(buzz, 0, 1400);
assert.equal(after.accepted, true);
assert.equal(after.buzz.winner, 0);

let answering = startAnswerClock(after.buzz, timers, 1400);
const waiting = tickBuzz(answering, timers, 5000, 2);
assert.equal(waiting.event, null);
const expired = tickBuzz(answering, timers, 1400 + 5000, 2);
assert.equal(expired.event.type, 'time-up');
assert.equal(expired.event.teamIndex, 0);
assert.equal(expired.buzz.phase, 'window');
assert.ok(expired.buzz.lockedOut.includes(0));
assert.equal(receiveBuzz(expired.buzz, 0, 7000).reason, 'locked-out');
assert.equal(receiveBuzz(expired.buzz, 1, 7000).accepted, true);

const auto = tickBuzz(answering, normalizeTimers({ autoMarkOnTimeout: true }), 1400 + 5000, 2);
assert.equal(auto.event.type, 'auto-incorrect');

const windowOnly = openBuzzWindow(freshBuzz(), timers, 0, 2);
const nobody = tickBuzz(windowOnly, timers, 5000, 2);
assert.equal(nobody.event.type, 'buzz-expired');
assert.equal(nobody.buzz.phase, 'closed');

const reopened = markIncorrect(after.buzz, 0, timers, 2000, 2);
assert.equal(reopened.phase, 'window');
assert.ok(reopened.lockedOut.includes(0));

const daily = {
  openClue: { categoryIndex: 0, rowIndex: 0, stage: 'clue' },
  categories: [{ clues: [{ dailyDouble: true }] }],
};
assert.equal(allowsTeamBuzz(daily), false);
const normal = {
  openClue: { categoryIndex: 0, rowIndex: 0, stage: 'clue' },
  categories: [{ clues: [{ dailyDouble: false }] }],
};
assert.equal(allowsTeamBuzz(normal), true);

console.log('buzzer tests passed');
