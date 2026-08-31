const { WEIGHTS, SYNC_DELAY_THRESHOLD_MINUTES } = require('./config');
const { CUSTODY_STEPS } = require('../config/constants');

/**
 * Event shape (built by the call sites in auth.service/papers.service/
 * tracking.service — see anomaly.service.js for the single entry point):
 *
 *   {
 *     type: 'LOGIN' | 'DECRYPT' | 'PRINT' | 'SCAN',
 *     success: boolean,
 *     userId, role,               // acting user
 *     ip,                         // LOGIN only
 *     paperId,                    // DECRYPT/PRINT/SCAN
 *     examTime, now,              // Date — DECRYPT/PRINT/SCAN
 *     fromStep, toStep,           // SCAN only
 *     location, deviceId,         // DECRYPT/PRINT/SCAN
 *     failureCode,                // set on success:false — see custody.js
 *                                 // ('SKIP_STEP' | 'UNEXPECTED_ROLE' | 'NO_RULE')
 *                                 // or papers.service ('TIME_WINDOW' |
 *                                 // 'TOO_EARLY' | 'CUSTODY_STATE')
 *     syncDelayMs,                // SCAN only — set when the mobile scanner
 *                                 // (Phase 4) submits a scan whose
 *                                 // clientTimestamp is older than when the
 *                                 // server actually received it (an
 *                                 // offline-queued scan synced late)
 *   }
 *
 * Context shape (assembled by anomaly.service.js just before evaluation —
 * this is where anything requiring a DB lookup lives, kept separate from
 * the event so rule conditions stay pure functions of (event, context)):
 *
 *   {
 *     recentFailedDecryptCount,   // failed DECRYPT/PRINT attempts by this
 *                                 // actor against this paper in the last
 *                                 // LOOKBACK_MINUTES, including this one
 *     expectedLocations,          // string[] — assigned center name/code(s)
 *                                 // for event.paperId, if any
 *   }
 *
 * Each rule's condition returns a boolean. `weight` is static, pulled from
 * config.js — see that file for why weights don't scale dynamically here.
 */
const RULES = [
  {
    ruleId: 'R_TIME_WINDOW',
    description: 'Content access (decrypt/print) attempted outside the allowed pre/post window around examTime.',
    weight: WEIGHTS.R_TIME_WINDOW,
    condition(event) {
      return (event.type === 'DECRYPT' || event.type === 'PRINT') && !event.success && event.failureCode === 'TIME_WINDOW';
    },
  },
  {
    ruleId: 'R_FAILED_DECRYPT',
    description: 'Repeated failed decrypt/print attempts against the same paper by the same actor.',
    weight: WEIGHTS.R_FAILED_DECRYPT,
    condition(event, context) {
      return (event.type === 'DECRYPT' || event.type === 'PRINT') && !event.success && context.recentFailedDecryptCount >= 2;
    },
  },
  {
    ruleId: 'R_SKIP_STEP',
    description: 'Custody scan attempted a transition that skips or reorders the custody state machine.',
    weight: WEIGHTS.R_SKIP_STEP,
    condition(event) {
      return event.type === 'SCAN' && !event.success && (event.failureCode === 'SKIP_STEP' || event.failureCode === 'NO_RULE');
    },
  },
  {
    ruleId: 'R_UNEXPECTED_ROLE',
    description: 'Custody scan or content-access attempt made by a role not authorized for that step.',
    weight: WEIGHTS.R_UNEXPECTED_ROLE,
    condition(event) {
      return ['SCAN', 'DECRYPT', 'PRINT'].includes(event.type) && !event.success && event.failureCode === 'UNEXPECTED_ROLE';
    },
  },
  {
    ruleId: 'R_LOCATION_MISMATCH',
    description: "Custody scan's reported location doesn't match any center the paper is assigned to.",
    weight: WEIGHTS.R_LOCATION_MISMATCH,
    condition(event, context) {
      if (event.type !== 'SCAN' || !event.location) return false;
      if (!context.expectedLocations || context.expectedLocations.length === 0) return false;
      return !context.expectedLocations.includes(event.location);
    },
  },
  {
    ruleId: 'R_TOO_EARLY_SCAN',
    description: 'Custody scan attempted to open a paper for exam (OPENED_FOR_EXAM) before its scheduled examTime.',
    weight: WEIGHTS.R_TOO_EARLY_SCAN,
    condition(event) {
      if (event.type !== 'SCAN' || event.toStep !== CUSTODY_STEPS.OPENED_FOR_EXAM) return false;
      if (!event.examTime || !event.now) return false;
      return event.now < event.examTime;
    },
  },
  {
    ruleId: 'R_REPEATED_LOGIN_FAILURE',
    description: 'Repeated failed login attempts for the same account in a short window.',
    weight: WEIGHTS.R_REPEATED_LOGIN_FAILURE,
    condition(event, context) {
      return event.type === 'LOGIN' && !event.success && context.recentFailedLoginCount >= 3;
    },
  },
  {
    ruleId: 'R_SYNC_DELAY',
    description: 'A custody scan synced long after it claims to have actually happened (offline queue on the mobile scanner).',
    weight: WEIGHTS.R_SYNC_DELAY,
    condition(event) {
      if (event.type !== 'SCAN' || typeof event.syncDelayMs !== 'number') return false;
      return event.syncDelayMs > SYNC_DELAY_THRESHOLD_MINUTES * 60 * 1000;
    },
  },
];

module.exports = { RULES };
