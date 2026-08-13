const Paper = require('../models/Paper');
const TrackingLog = require('../models/TrackingLog');
const { verifyQrToken } = require('../papers/qr');
const { evaluateTransition } = require('../papers/custody');
const { appendAuditLog } = require('../logs/audit.service');
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

  const check = evaluateTransition({ fromStep, toStep, role: actor.role });

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

  if (!check.allowed) {
    throw new ApiError(409, check.reason, { trackingLogId: String(log._id) });
  }

  paper.currentCustodyStep = toStep;
  if (STATUS_BY_STEP[toStep]) {
    paper.status = STATUS_BY_STEP[toStep];
  }
  await paper.save();

  return { paper, log };
}

async function getTimeline(paperId) {
  return TrackingLog.find({ paperId }).sort({ timestamp: 1 });
}

module.exports = { recordScan, getTimeline };
