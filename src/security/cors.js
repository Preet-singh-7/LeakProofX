const cors = require('cors');
const { env } = require('../config/env');
const logger = require('../logs/logger');

/**
 * Explicit allowlist only — this API always serves authenticated,
 * credentialed requests (dashboard, scanner app), so it must never fall
 * back to "*". Requests with no Origin header (server-to-server calls,
 * curl, the mobile scanner's native HTTP client) are allowed through since
 * "Origin" is a browser-enforced header, not a security boundary for
 * non-browser clients — those are authenticated by JWT instead.
 */
function corsPolicy() {
  return cors({
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.security({ origin }, 'rejected disallowed CORS origin');
      return callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    },
    credentials: true,
  });
}

module.exports = { corsPolicy };
