/** Tiny in-memory sliding-window limiter. Fine for a single instance; use a shared store if you scale out. */
export class RateLimiter {
  constructor() {
    this.hitsByKey = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
    this.maxWindowMs = 0;
  }

  /** Records a hit and returns true if it is still within the limit. */
  hit(key, max, windowMs) {
    this.maxWindowMs = Math.max(this.maxWindowMs, windowMs);
    const now = Date.now();
    const list = (this.hitsByKey.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now);
    this.hitsByKey.set(key, list);
    return list.length <= max;
  }

  /** Number of hits recorded in the window, without recording a new one. */
  count(key, windowMs) {
    const now = Date.now();
    return (this.hitsByKey.get(key) || []).filter((t) => now - t < windowMs).length;
  }

  reset(key) {
    this.hitsByKey.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [key, list] of this.hitsByKey) {
      const fresh = list.filter((t) => now - t < this.maxWindowMs);
      if (fresh.length) this.hitsByKey.set(key, fresh);
      else this.hitsByKey.delete(key);
    }
  }
}

export const rateLimiter = new RateLimiter();
