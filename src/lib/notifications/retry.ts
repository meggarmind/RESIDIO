/**
 * Retry policy for the notification queue (#546): how many attempts a queued
 * notification gets, how long to wait between them, and when a Send Policy
 * `defer` should be tried again. Pure helpers so each rule is testable.
 */

/** Attempts a queued notification gets unless the caller passes its own `max_attempts`. */
export const DEFAULT_MAX_ATTEMPTS = 5;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Wait after the 1st, 2nd, 3rd and 4th failed attempt. */
const RETRY_DELAYS_MS = [15 * MINUTE_MS, HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS] as const;

/**
 * Backoff after the Nth failed attempt (1-based). Attempts beyond the table
 * reuse the longest delay.
 */
export function retryDelayMs(attemptNumber: number): number {
  const index = Math.min(Math.max(Math.trunc(attemptNumber), 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index];
}

/** The next 00:00:00 UTC strictly after `now`, when the daily send count resets. */
export function nextUtcMidnight(now: Date): Date {
  const next = new Date(now.getTime());
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/** Burst window in minutes, with the same validation and default (10) as the Send Policy. */
export function resolveBurstWindowMinutes(configured: unknown): number {
  return typeof configured === 'number' && Number.isInteger(configured) && configured > 0
    ? configured
    : 10;
}
