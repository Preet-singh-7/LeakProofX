const { CUSTODY_STEPS, CUSTODY_STEP_ORDER, ROLES } = require('../config/constants');

// Each transition is gated to the roles that are legitimately expected to
// perform it in the physical custody chain. ADMIN can perform any transition
// (operational override, e.g. correcting a scan error) — that override is
// exactly the kind of event the Phase 2 anomaly engine should be able to see
// and weigh, not something Phase 1 should silently allow unlogged.
const ALLOWED_TRANSITIONS = {
  [`${CUSTODY_STEPS.CREATED}->${CUSTODY_STEPS.HANDOVER_TO_COURIER}`]: [ROLES.BOARD, ROLES.ADMIN],
  [`${CUSTODY_STEPS.HANDOVER_TO_COURIER}->${CUSTODY_STEPS.ARRIVED_AT_CENTER}`]: [ROLES.COURIER, ROLES.ADMIN],
  [`${CUSTODY_STEPS.ARRIVED_AT_CENTER}->${CUSTODY_STEPS.STORED_IN_VAULT}`]: [ROLES.CENTER, ROLES.ADMIN],
  [`${CUSTODY_STEPS.STORED_IN_VAULT}->${CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL}`]: [ROLES.CENTER, ROLES.ADMIN],
  [`${CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL}->${CUSTODY_STEPS.OPENED_FOR_EXAM}`]: [ROLES.INVIGILATOR, ROLES.ADMIN],
  [`${CUSTODY_STEPS.OPENED_FOR_EXAM}->${CUSTODY_STEPS.COMPLETED}`]: [ROLES.INVIGILATOR, ROLES.ADMIN],
};

function stepIndex(step) {
  return CUSTODY_STEP_ORDER.indexOf(step);
}

function isSequential(fromStep, toStep) {
  const fromIdx = stepIndex(fromStep);
  const toIdx = stepIndex(toStep);
  return fromIdx !== -1 && toIdx === fromIdx + 1;
}

/**
 * Evaluates whether `role` may move a paper from `fromStep` to `toStep`.
 * Does NOT check time-lock (examTime) — that's a separate, orthogonal check
 * applied specifically to the OPENED_FOR_EXAM transition and to decrypt/print.
 */
function evaluateTransition({ fromStep, toStep, role }) {
  const key = `${fromStep}->${toStep}`;
  const allowedRoles = ALLOWED_TRANSITIONS[key];

  if (!allowedRoles) {
    return {
      allowed: false,
      reason: isSequential(fromStep, toStep)
        ? 'No transition rule defined for this step pair'
        : 'Transition skips or reorders the custody sequence',
    };
  }

  if (!allowedRoles.includes(role)) {
    return { allowed: false, reason: `Role ${role} is not authorized for ${key}` };
  }

  return { allowed: true, reason: null };
}

module.exports = { ALLOWED_TRANSITIONS, evaluateTransition, isSequential, stepIndex };
