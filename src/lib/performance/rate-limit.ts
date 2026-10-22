const RATE_LIMIT = 30; // requests per user per window
const RATE_WINDOW_MS = 60_000;

// shortcut: per-instance memory, so the limit is per container; move to a shared store if the app scales out.
const hits = new Map<string, { count: number; windowStart: number }>();

export function rateLimited(userId: string, now: number): boolean {
  const entry = hits.get(userId);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    if (hits.size > 1000) {
      for (const [key, value] of hits) if (now - value.windowStart >= RATE_WINDOW_MS) hits.delete(key);
    }
    hits.set(userId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export function resetRateLimitForTests() {
  hits.clear();
}
