// 生年月日の入れ直しの回数: after a few wrong birth dates the patient's QR is locked for a while. Kept in the
// server's memory (best effort, like rate-limit.ts: each serverless instance counts its own).

export const MAX_TRIES = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function createTries(max = MAX_TRIES, lockMs = LOCK_MS) {
  const seen = new Map<string, { fails: number; since: number }>();
  const live = (key: string, now: number) => {
    const s = seen.get(key);
    if (s && now - s.since >= lockMs) {
      seen.delete(key);
      return undefined;
    }
    return s;
  };
  return {
    /** Tries left (0: locked until the time has passed). */
    left: (key: string, now = Date.now()) => max - (live(key, now)?.fails ?? 0),
    /** A wrong birth date; returns the tries left. */
    fail(key: string, now = Date.now()) {
      const s = live(key, now) ?? { fails: 0, since: now };
      s.fails++;
      seen.set(key, s);
      if (seen.size > 5000) seen.clear();
      return max - s.fails;
    },
    clear: (key: string) => void seen.delete(key),
  };
}
