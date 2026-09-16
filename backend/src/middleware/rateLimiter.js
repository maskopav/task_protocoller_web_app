// backend/src/middleware/rateLimiter.js
import rateLimit from "express-rate-limit";

// Factories (rather than just pre-built instances) so tests can spin up a
// fresh, isolated limiter with its own in-memory counter and a low limit,
// instead of sharing the app-wide singleton's state across test cases.

// The credential-guessing target: participant and admin login. Tighter limit,
// since this is exactly what a brute-force script would hammer.
export function createLoginLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    // Overridable so the E2E suite (many independent specs each logging in
    // for real, in one long-lived server process) doesn't trip its own
    // brute-force guard. Unset in production -> unchanged default of 10.
    limit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
    ...overrides,
  });
}

// The rest of /auth/* (signup, forgot/reset-password, setup-profile) — still
// worth limiting (email-bombing via forgot-password, signup spam), but not a
// direct credential-guessing surface, so a looser cap.
export function createAuthLimiter(overrides = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
    ...overrides,
  });
}

export const loginLimiter = createLoginLimiter();
export const authLimiter = createAuthLimiter();
