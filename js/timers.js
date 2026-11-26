/** Host-adjustable clocks. Missing fields on old saves use these defaults. */
export const DEFAULT_TIMERS = {
  enabled: true,
  buzzSeconds: 5,
  answerSeconds: 5,
  dailyDoubleSeconds: 15,
  autoMarkOnTimeout: false,
  earlyLockoutSeconds: 0.25,
};

function clampSeconds(value, fallback) {
  if (!Number.isInteger(value) || value < 1 || value > 120) return fallback;
  return value;
}

function clampLockout(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 5) return fallback;
  return Math.round(number * 1000) / 1000;
}

export function normalizeTimers(input) {
  const timers = { ...DEFAULT_TIMERS };
  if (!input || typeof input !== 'object') return timers;
  if (typeof input.enabled === 'boolean') timers.enabled = input.enabled;
  if (typeof input.autoMarkOnTimeout === 'boolean') timers.autoMarkOnTimeout = input.autoMarkOnTimeout;
  timers.buzzSeconds = clampSeconds(input.buzzSeconds, timers.buzzSeconds);
  timers.answerSeconds = clampSeconds(input.answerSeconds, timers.answerSeconds);
  timers.dailyDoubleSeconds = clampSeconds(input.dailyDoubleSeconds, timers.dailyDoubleSeconds);
  timers.earlyLockoutSeconds = clampLockout(input.earlyLockoutSeconds, timers.earlyLockoutSeconds);
  return timers;
}
