/**
 * Host-side buzzer rules. Arrival order is whoever the host processes first.
 * Daily Doubles never open a buzz window; they only use the answer clock.
 */

export function freshBuzz() {
  return {
    phase: 'idle',
    winner: null,
    lockedOut: [],
    deadline: 0,
    totalMs: 0,
    signaledTeam: null,
    earlyUntil: {},
  };
}

export function earlyLockoutMs(timers) {
  const seconds = Number(timers?.earlyLockoutSeconds) || 0;
  return seconds > 0 ? Math.round(seconds * 1000) : 0;
}

/** An early press restarts this team's lockout, matching the show. */
export function noteEarlyBuzz(buzz, teamIndex, timers, now) {
  const duration = earlyLockoutMs(timers);
  if (!Number.isInteger(teamIndex) || duration <= 0) return buzz;
  return {
    ...buzz,
    earlyUntil: { ...buzz.earlyUntil, [teamIndex]: now + duration },
  };
}

export function isEarlyLocked(buzz, teamIndex, now) {
  return (buzz.earlyUntil?.[teamIndex] || 0) > now;
}

export function allowsTeamBuzz(state) {
  const open = state?.openClue;
  if (!open || (open.stage || 'clue') !== 'clue') return false;
  const clue = state.categories[open.categoryIndex]?.clues[open.rowIndex];
  return Boolean(clue && !clue.dailyDouble);
}

export function isDailyDoubleClue(state) {
  const open = state?.openClue;
  if (!open || (open.stage || 'clue') !== 'clue') return false;
  const clue = state.categories[open.categoryIndex]?.clues[open.rowIndex];
  return Boolean(clue?.dailyDouble);
}

function remainingTeams(lockedOut, teamCount) {
  let count = 0;
  for (let index = 0; index < teamCount; index += 1) {
    if (!lockedOut.includes(index)) count += 1;
  }
  return count;
}

export function openBuzzWindow(buzz, timers, now, teamCount) {
  if (remainingTeams(buzz.lockedOut, teamCount) === 0) {
    return { ...buzz, phase: 'closed', winner: null, deadline: 0, totalMs: 0 };
  }
  if (!timers.enabled) {
    return { ...buzz, phase: 'window', winner: null, deadline: 0, totalMs: 0 };
  }
  const totalMs = timers.buzzSeconds * 1000;
  return { ...buzz, phase: 'window', winner: null, deadline: now + totalMs, totalMs };
}

export function receiveBuzz(buzz, teamIndex, now = 0) {
  if (buzz.phase !== 'window') return { buzz, accepted: false, reason: 'closed' };
  if (!Number.isInteger(teamIndex) || buzz.lockedOut.includes(teamIndex)) {
    return { buzz, accepted: false, reason: 'locked-out' };
  }
  if (isEarlyLocked(buzz, teamIndex, now)) {
    return { buzz, accepted: false, reason: 'early' };
  }
  return {
    accepted: true,
    buzz: { ...buzz, phase: 'answering', winner: teamIndex, deadline: 0, totalMs: 0 },
  };
}

export function startAnswerClock(buzz, timers, now) {
  if (!timers.enabled) return { ...buzz, deadline: 0, totalMs: 0 };
  const totalMs = timers.answerSeconds * 1000;
  return { ...buzz, deadline: now + totalMs, totalMs };
}

export function markCorrect(buzz) {
  return { ...buzz, phase: 'closed', deadline: 0, totalMs: 0, signaledTeam: null };
}

export function markIncorrect(buzz, teamIndex, timers, now, teamCount) {
  const lockedOut = buzz.lockedOut.includes(teamIndex)
    ? buzz.lockedOut
    : [...buzz.lockedOut, teamIndex];
  return openBuzzWindow({
    ...buzz,
    lockedOut,
    winner: null,
    signaledTeam: null,
  }, timers, now, teamCount);
}

/**
 * Advance clocks. Returns the next session and an optional event:
 * buzz-expired, time-up, auto-incorrect.
 */
export function tickBuzz(buzz, timers, now, teamCount) {
  if (!timers.enabled || !buzz.deadline || now < buzz.deadline) {
    return { buzz, event: null };
  }
  if (buzz.phase === 'window') {
    return {
      buzz: { ...buzz, phase: 'closed', winner: null, deadline: 0, totalMs: 0 },
      event: { type: 'buzz-expired' },
    };
  }
  if (buzz.phase !== 'answering' || buzz.winner == null) {
    return { buzz: { ...buzz, deadline: 0, totalMs: 0 }, event: null };
  }
  const teamIndex = buzz.winner;
  const lockedOut = buzz.lockedOut.includes(teamIndex)
    ? buzz.lockedOut
    : [...buzz.lockedOut, teamIndex];
  const next = {
    ...buzz,
    lockedOut,
    winner: null,
    signaledTeam: teamIndex,
    deadline: 0,
    totalMs: 0,
  };
  const eventType = timers.autoMarkOnTimeout ? 'auto-incorrect' : 'time-up';
  if (remainingTeams(lockedOut, teamCount) === 0) {
    return { buzz: { ...next, phase: 'closed' }, event: { type: eventType, teamIndex } };
  }
  return {
    buzz: openBuzzWindow(next, timers, now, teamCount),
    event: { type: eventType, teamIndex },
  };
}

export function secondsLeft(buzz, now) {
  if (!buzz.deadline) return null;
  return Math.max(0, Math.ceil((buzz.deadline - now) / 1000));
}

export function fractionLeft(buzz, now) {
  if (!buzz.deadline || !buzz.totalMs) return buzz.phase === 'window' ? 1 : 0;
  return Math.max(0, Math.min(1, (buzz.deadline - now) / buzz.totalMs));
}

export function phoneStatus(buzz, teamIndex, clueOpen, dailyDouble) {
  if (!clueOpen || dailyDouble || teamIndex == null) return 'waiting';
  if (buzz.lockedOut.includes(teamIndex)) return 'locked-out';
  if (buzz.phase === 'window') return 'open';
  if (buzz.winner === teamIndex && (buzz.phase === 'answering' || buzz.phase === 'closed')) return 'you';
  if (buzz.phase === 'answering' || buzz.signaledTeam === teamIndex) return 'other';
  return 'waiting';
}
