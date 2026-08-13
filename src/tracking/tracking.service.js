const Paper = require('../models/Paper');
const TrackingLog = require('../models/TrackingLog');
const { verifyQrToken } = require('../papers/qr');
const { evaluateTransition } = require('../papers/custody');
const { assertExamTimeReached } = require('../papers/timeLock');
const { appendAuditLog } = require('../logs/audit.service');
const anomalyService = require('../anomaly/anomaly.service');
const { ApiError } = require('../middleware/errorHandler');
const { CUSTODY_STEPS, PAPER_STATUS } = require('../config/constants');

const STATUS_BY_STEP = {
  [CUSTODY_STEPS.HANDOVER_TO_COURIER]: PAPER_STATUS.IN_TRANSIT,
  [CUSTODY_STEPS.ARRIVED_AT_CENTER]: PAPER_STATUS.IN_TRANSIT,
  [CUSTODY_STEPS.STORED_IN_VAULT]: PAPER_STATUS.SECURED,
  [CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL]: PAPER_STATUS.SECURED,
  [CUSTODY_STEPS.OPENED_FOR_EXAM]: PAPER_STATUS.OPENED,
  [CUSTODY_STEPS.COMPLETED]: PAPER_STATUS.COMPLETED,
};

/**
 * Records a custody scan event. This is the primary entry point the scanner
 * app (Phase 4) will call. Every attempt is written to TrackingLog —
 * including rejected ones — because a rejected/out-of-order scan is itself
 * a security-relevant signal for the Phase 2 anomaly engine, not just noise
 * to discard.
 */
async function recordScan(input, actor) {
  const { paperId } = verifyQrToken(input.qrToken);
  const paper = await Paper.findById(paperId);
  if (!paper) throw new ApiError(404, 'Paper not found for this QR token');

  const fromStep = paper.currentCustodyStep;
  const toStep = input.toStep;
  const timestamp = new Date();

  let check = evaluateTransition({ fromStep, toStep, role: actor.role });

  // The transition into OPENED_FOR_EXAM carries an additional, unconditional
  // time-lock requirement (now >= examTime) per the custody spec. This must
  // hold no matter which API path performs the transition — without this
  // check here, a raw /tracking/scan call bypasses the time-lock that
  // /papers/:id/decrypt otherwise enforces (assertExamTimeReached there).
  if (check.allowed && toStep === CUSTODY_STEPS.OPENED_FOR_EXAM) {
    try {
      assertExamTimeReached(paper.examTime, timestamp);
    } catch (err) {
      check = { allowed: false, code: err.failureCode || 'TOO_EARLY', reason: err.message };
    }
  }

  const log = await TrackingLog.create({
    paperId: paper._id,
    fromStep,
    toStep,
    userId: actor.id,
    roleId: actor.role,
    location: input.location || null,
    deviceId: input.deviceId || null,
    timestamp: input.clientTimestamp || timestamp,
    syncedAt: timestamp,
    accepted: check.allowed,
    rejectionReason: check.allowed ? null : check.reason,
  });

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: check.allowed ? 'CUSTODY_TRANSITION' : 'CUSTODY_TRANSITION_REJECTED',
    targetType: 'Paper',
    targetId: String(paper._id),
    metadata: { fromStep, toStep, location: input.location, deviceId: input.deviceId, reason: check.reason },
  });

  const centerId = actor.centerId || paper.assignedCenterIds?.[0] || null;

  const anomalyEvent = {
    type: 'SCAN',
    success: check.allowed,
    userId: actor.id,
    role: actor.role,
    paperId: paper._id,
    centerId,
    fromStep,
    toStep,
    examTime: paper.examTime,
    now: timestamp,
    location: input.location,
    deviceId: input.deviceId,
    failureCode: check.allowed ? undefined : check.code,
  };

  if (!check.allowed) {
    await anomalyService.recordEvent(anomalyEvent);
    throw new ApiError(409, check.reason, { trackingLogId: String(log._id) }, check.code);
  }

  paper.currentCustodyStep = toStep;
  if (STATUS_BY_STEP[toStep]) {
    paper.status = STATUS_BY_STEP[toStep];
  }
  await paper.save();
  await anomalyService.recordEvent(anomalyEvent);

  return { paper, log };
}

async function getTimeline(paperId) {
  return TrackingLog.find({ paperId }).sort({ timestamp: 1 });
}

module.exports = { recordScan, getTimeline };
