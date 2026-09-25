// In-memory sliding-window limiter. Enough for one Railway instance; with
// several replicas each keeps its own count, which only makes the limit a
// little more generous.

export function createLimiter({ windowMs, max }) {
  const hits = new Map();
  let lastSweep = Date.now();

  return {
    // Returns true when the action is allowed, and counts it.
    hit(key, now = Date.now()) {
      if (now - lastSweep > windowMs) {
        for (const [k, times] of hits) {
          const fresh = times.filter((t) => now - t < windowMs);
          if (fresh.length) hits.set(k, fresh);
          else hits.delete(k);
        }
        lastSweep = now;
      }
      const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (times.length >= max) {
        hits.set(key, times);
        return false;
      }
      times.push(now);
      hits.set(key, times);
      return true;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
