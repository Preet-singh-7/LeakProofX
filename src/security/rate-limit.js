const rateLimit = require('express-rate-limit');
const logger = require('../logs/logger');

/**
 * All limiters share this handler so a 429 is both returned to the caller
 * and recorded at the "security" log level — rate-limit trips are exactly
 * the kind of signal an operator (or, from Phase 2 onward, the anomaly
 * engine reading the audit log) wants visibility into, not just a silent
 * 429 the client swallows.
 */
function limitHandler(req, res /* , next, options */) {
  logger.security({ ip: req.ip, path: req.originalUrl, method: req.method }, 'rate limit exceeded');
  res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' });
}

/**
 * Every limiter here uses express-rate-limit's default in-memory store,
 * which is correct for a single-process MVP deployment but does NOT share
 * state across multiple instances behind a load balancer — an attacker
 * could get `limit` attempts per instance rather than per deployment.
 *
 * To move to distributed limiting for a multi-instance deployment, swap the
 * (currently omitted) `store` option below for a Redis-backed store, e.g.:
 *
 *   const RedisStore = require('rate-limit-redis');
 *   const client = require('./redisClient'); // ioredis/node-redis instance
 *   store: new RedisStore({ sendCommand: (...args) => client.call(...args) })
 *
 * No other change is needed — express-rate-limit's store interface is the
 * same regardless of backend, which is why this file centralizes every
 * limiter rather than configuring rate-limit.  inline per-route.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// /auth/login and /auth/register: brute-force / credential-stuffing surface.
// Tight enough to blunt automated guessing, loose enough not to lock out a
// real user mistyping a password a couple of times.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
  skipSuccessfulRequests: true, // only failed/attempted logins count against the limit
});

// /papers/:id/decrypt, /papers/:id/print: the actual leak surface. An
// INVIGILATOR account making dozens of decrypt attempts in a window is
// already anomalous even before the anomaly engine scores it — rate
// limiting here is a hard backstop, not a replacement for R_FAILED_DECRYPT.
const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// Admin routes (/users/*, ADMIN-gated /auth/register): lower volume than
// general traffic is expected, so a tighter cap catches abuse of a
// compromised admin token faster without affecting normal admin workflows.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

module.exports = { globalLimiter, authLimiter, sensitiveActionLimiter, adminLimiter };
