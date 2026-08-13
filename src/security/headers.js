const helmet = require('helmet');

/**
 * Helmet's defaults (CSP, HSTS, X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy, etc.) are appropriate for a JSON API with no server-
 * rendered HTML — no custom directives are needed here. Kept as its own
 * function (rather than `app.use(helmet())` inline) so app.js reads as
 * "security controls are applied", not "here's some helmet config",  and so
 * this is the one place to touch if a future phase needs a dashboard-served
 * HTML asset with different CSP requirements.
 */
function securityHeaders() {
  return helmet();
}

module.exports = { securityHeaders };
