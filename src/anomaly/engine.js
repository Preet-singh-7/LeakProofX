const { RULES } = require('./rules');
const { severityForScore } = require('./config');

/**
 * Pure function: runs every rule's condition(event, context), sums the
 * weights of whichever fired, and classifies the total against the
 * configured thresholds. No I/O here — anomaly.service.js is responsible
 * for assembling `context` (which needs DB lookups) and for persisting an
 * Alert when the result crosses the warning threshold. Keeping this pure
 * is what makes rules.js's conditions unit-testable without a database
 * (see test/anomaly.test.js).
 */
function evaluateEvent(event, context = {}) {
  const firedRules = [];
  let riskScore = 0;

  for (const rule of RULES) {
    if (rule.condition(event, context)) {
      firedRules.push(rule.ruleId);
      riskScore += rule.weight;
    }
  }

  return { riskScore, firedRules, severity: severityForScore(riskScore) };
}

module.exports = { evaluateEvent };
