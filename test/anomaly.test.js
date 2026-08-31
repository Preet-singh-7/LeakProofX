// Pure unit tests for the anomaly rule engine — no DB, no server. Each rule's
// condition() is a pure function of (event, context), which is exactly what
// makes this possible; DB-backed context assembly (anomaly.service.js) is
// covered by the Phase 2 manual end-to-end retest instead.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { evaluateEvent } = require('../src/anomaly/engine');
const { THRESHOLDS, WEIGHTS } = require('../src/anomaly/config');
const { CUSTODY_STEPS } = require('../src/config/constants');

test('R_TIME_WINDOW fires on a denied decrypt outside the access window', () => {
  const { riskScore, firedRules, severity } = evaluateEvent({
    type: 'DECRYPT',
    success: false,
    failureCode: 'TIME_WINDOW',
  });
  assert.ok(firedRules.includes('R_TIME_WINDOW'));
  assert.equal(riskScore, WEIGHTS.R_TIME_WINDOW);
  assert.equal(severity, WEIGHTS.R_TIME_WINDOW >= THRESHOLDS.WARNING ? 'WARNING' : null);
});

test('R_TIME_WINDOW does not fire on a successful decrypt', () => {
  const { firedRules } = evaluateEvent({ type: 'DECRYPT', success: true });
  assert.ok(!firedRules.includes('R_TIME_WINDOW'));
});

test('R_FAILED_DECRYPT requires at least 2 recent failures, not just 1', () => {
  const single = evaluateEvent({ type: 'DECRYPT', success: false, failureCode: 'CUSTODY_STATE' }, { recentFailedDecryptCount: 1 });
  assert.ok(!single.firedRules.includes('R_FAILED_DECRYPT'));

  const repeated = evaluateEvent({ type: 'DECRYPT', success: false, failureCode: 'CUSTODY_STATE' }, { recentFailedDecryptCount: 2 });
  assert.ok(repeated.firedRules.includes('R_FAILED_DECRYPT'));
});

test('R_SKIP_STEP fires when a scan skips or reorders the custody sequence', () => {
  const { firedRules } = evaluateEvent({ type: 'SCAN', success: false, failureCode: 'SKIP_STEP' });
  assert.ok(firedRules.includes('R_SKIP_STEP'));
});

test('R_SKIP_STEP does not fire for a role-authorization failure', () => {
  const { firedRules } = evaluateEvent({ type: 'SCAN', success: false, failureCode: 'UNEXPECTED_ROLE' });
  assert.ok(!firedRules.includes('R_SKIP_STEP'));
  assert.ok(firedRules.includes('R_UNEXPECTED_ROLE'));
});

test('R_UNEXPECTED_ROLE fires for scan, decrypt, and print alike', () => {
  for (const type of ['SCAN', 'DECRYPT', 'PRINT']) {
    const { firedRules } = evaluateEvent({ type, success: false, failureCode: 'UNEXPECTED_ROLE' });
    assert.ok(firedRules.includes('R_UNEXPECTED_ROLE'), `expected R_UNEXPECTED_ROLE for ${type}`);
  }
});

test('R_LOCATION_MISMATCH fires when scan location is not among the paper\'s assigned centers', () => {
  const mismatch = evaluateEvent(
    { type: 'SCAN', success: true, location: 'Unknown Site' },
    { expectedLocations: ['Center A', 'CTR-A'] }
  );
  assert.ok(mismatch.firedRules.includes('R_LOCATION_MISMATCH'));

  const match = evaluateEvent({ type: 'SCAN', success: true, location: 'CTR-A' }, { expectedLocations: ['Center A', 'CTR-A'] });
  assert.ok(!match.firedRules.includes('R_LOCATION_MISMATCH'));
});

test('R_LOCATION_MISMATCH does not fire when no expected locations are known (avoid false positives)', () => {
  const { firedRules } = evaluateEvent({ type: 'SCAN', success: true, location: 'Anywhere' }, { expectedLocations: [] });
  assert.ok(!firedRules.includes('R_LOCATION_MISMATCH'));
});

test('R_TOO_EARLY_SCAN fires only for OPENED_FOR_EXAM attempted before examTime', () => {
  const examTime = new Date('2026-01-01T09:00:00Z');
  const tooEarly = evaluateEvent({
    type: 'SCAN',
    toStep: CUSTODY_STEPS.OPENED_FOR_EXAM,
    examTime,
    now: new Date('2026-01-01T08:00:00Z'),
  });
  assert.ok(tooEarly.firedRules.includes('R_TOO_EARLY_SCAN'));

  const onTime = evaluateEvent({
    type: 'SCAN',
    toStep: CUSTODY_STEPS.OPENED_FOR_EXAM,
    examTime,
    now: new Date('2026-01-01T09:00:01Z'),
  });
  assert.ok(!onTime.firedRules.includes('R_TOO_EARLY_SCAN'));

  const otherStep = evaluateEvent({
    type: 'SCAN',
    toStep: CUSTODY_STEPS.STORED_IN_VAULT,
    examTime,
    now: new Date('2026-01-01T08:00:00Z'),
  });
  assert.ok(!otherStep.firedRules.includes('R_TOO_EARLY_SCAN'));
});

test('R_REPEATED_LOGIN_FAILURE requires at least 3 recent failures', () => {
  const belowThreshold = evaluateEvent({ type: 'LOGIN', success: false }, { recentFailedLoginCount: 2 });
  assert.ok(!belowThreshold.firedRules.includes('R_REPEATED_LOGIN_FAILURE'));

  const atThreshold = evaluateEvent({ type: 'LOGIN', success: false }, { recentFailedLoginCount: 3 });
  assert.ok(atThreshold.firedRules.includes('R_REPEATED_LOGIN_FAILURE'));
});

test('R_SYNC_DELAY fires only when the sync gap exceeds the configured threshold', () => {
  const { SYNC_DELAY_THRESHOLD_MINUTES } = require('../src/anomaly/config');
  const thresholdMs = SYNC_DELAY_THRESHOLD_MINUTES * 60 * 1000;

  const withinThreshold = evaluateEvent({ type: 'SCAN', success: true, syncDelayMs: thresholdMs - 1 });
  assert.ok(!withinThreshold.firedRules.includes('R_SYNC_DELAY'));

  const overThreshold = evaluateEvent({ type: 'SCAN', success: true, syncDelayMs: thresholdMs + 1 });
  assert.ok(overThreshold.firedRules.includes('R_SYNC_DELAY'));

  // A same-instant online scan (syncDelayMs: 0, the tracking.service.js
  // default when there's no clientTimestamp) must never fire this.
  const noDelay = evaluateEvent({ type: 'SCAN', success: true, syncDelayMs: 0 });
  assert.ok(!noDelay.firedRules.includes('R_SYNC_DELAY'));
});

test('combining two mid-severity rules crosses into CRITICAL', () => {
  // SKIP_STEP (5) alone is WARNING; combined with a too-early open attempt
  // (5) on the same scan, the total (10) crosses the CRITICAL threshold (6).
  const { riskScore, severity, firedRules } = evaluateEvent({
    type: 'SCAN',
    success: false,
    failureCode: 'SKIP_STEP',
    toStep: CUSTODY_STEPS.OPENED_FOR_EXAM,
    examTime: new Date('2026-01-01T09:00:00Z'),
    now: new Date('2026-01-01T08:00:00Z'),
  });
  assert.ok(firedRules.includes('R_SKIP_STEP'));
  assert.ok(firedRules.includes('R_TOO_EARLY_SCAN'));
  assert.equal(riskScore, WEIGHTS.R_SKIP_STEP + WEIGHTS.R_TOO_EARLY_SCAN);
  assert.equal(severity, 'CRITICAL');
});

test('a clean successful event scores zero and needs no alert', () => {
  const { riskScore, firedRules, severity } = evaluateEvent({
    type: 'SCAN',
    success: true,
    toStep: CUSTODY_STEPS.ARRIVED_AT_CENTER,
  });
  assert.equal(riskScore, 0);
  assert.deepEqual(firedRules, []);
  assert.equal(severity, null);
});

test('thresholds: score below WARNING yields no severity, at/above WARNING yields WARNING, at/above CRITICAL yields CRITICAL', () => {
  const { severityForScore } = require('../src/anomaly/config');
  assert.equal(severityForScore(THRESHOLDS.WARNING - 1), null);
  assert.equal(severityForScore(THRESHOLDS.WARNING), 'WARNING');
  assert.equal(severityForScore(THRESHOLDS.CRITICAL - 1), 'WARNING');
  assert.equal(severityForScore(THRESHOLDS.CRITICAL), 'CRITICAL');
});
