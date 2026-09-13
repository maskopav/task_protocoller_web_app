// src/middleware/rateLimiter.js — minimal in-memory fixed-window rate
// limiter for the public, unauthenticated booking endpoints. No new
// dependency for a pilot at this traffic scale; swap for a shared store
// (e.g. Redis) if this service is ever run as more than one process, since
// counts here are per-process only.
//
// Keyed by req.ip. If this app runs behind a reverse proxy without
// `trust proxy` configured on the host Express app, req.ip is the proxy's
// own address for every visitor — everyone then shares one bucket. That
// still throttles a scripted abuse burst, just not per-visitor; only set
// `trust proxy` upstream if you've confirmed exactly one proxy hop in front
// of this service (trusting forwarded-for headers behind more hops than
// actually exist lets a client spoof its way past the limit).
const buckets = new Map();
let sweepTimer = null;

function ensureSweep(windowMs) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, bucket] of buckets) {
      if (bucket.windowStart < cutoff) buckets.delete(key);
    }
  }, 10 * 60 * 1000); // sweep stale IPs every 10min so the Map can't grow unbounded
  sweepTimer.unref();
}

export function rateLimit({ windowMs, max }) {
  ensureSweep(windowMs);

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(key, { windowStart: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests — please try again shortly" });
    }
    next();
  };
}
