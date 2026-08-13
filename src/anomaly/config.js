// Thresholds and rule weights live in one place, separate from the rule
// logic in rules.js, so both can be retuned without touching the
// evaluation code — exactly the "tunable without code changes" requirement.
// For this MVP "config" means this file (edit + redeploy); a later phase
// could move it to a DB-backed settings collection for true runtime tuning
// without a deploy, without changing anything in engine.js or rules.js.

const THRESHOLDS = {
  WARNING: 3,
  CRITICAL: 6,
};

// Static per-rule weight. A rule's condition() returns true/false; when
// true, this weight is added to the event's total riskScore. Repeated
// misbehavior (e.g. multiple failed decrypts) is captured by a rule's
// condition consulting `context` (recent-event counts), not by the weight
// itself scaling — see rules.js for how each rule uses context.
const WEIGHTS = {
  R_TIME_WINDOW: 4,
  R_FAILED_DECRYPT: 3,
  R_SKIP_STEP: 5,
  R_UNEXPECTED_ROLE: 4,
  R_LOCATION_MISMATCH: 3,
  R_TOO_EARLY_SCAN: 5,
  // Not one of the spec's required six — added because evaluateEvent is
  // explicitly invoked on LOGIN, and none of the required six ever fire on
  // a LOGIN event, which would make that wiring a no-op. Complements the
  // authLimiter rate limit (security/rate-limit.js) at the detection layer.
  R_REPEATED_LOGIN_FAILURE: 3,
};

// How far back "recent" event counts (e.g. repeated failed decrypts) look.
const LOOKBACK_MINUTES = 15;

function severityForScore(riskScore) {
  if (riskScore >= THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (riskScore >= THRESHOLDS.WARNING) return 'WARNING';
  return null; // below warning threshold — no alert
}

module.exports = { THRESHOLDS, WEIGHTS, LOOKBACK_MINUTES, severityForScore };
