const crypto = require('crypto');
const Paper = require('../models/Paper');
const TrackingLog = require('../models/TrackingLog');
const { encryptContent, decryptContent } = require('../encryption/crypto');
const { signQrToken, renderQrDataUrl } = require('./qr');
const { evaluateTransition } = require('./custody');
const { assertWithinAccessWindow, assertExamTimeReached } = require('./timeLock');
const { appendAuditLog } = require('../logs/audit.service');
const { ApiError } = require('../middleware/errorHandler');
const { CUSTODY_STEPS, PAPER_STATUS, ROLES } = require('../config/constants');

async function createPaper(input, actor) {
  const { contentCipher, iv, authTag, keyId } = encryptContent(input.content);

  // qrToken needs the paper's _id, so create first with a placeholder, then
  // finalize — simpler than pre-generating an id, and avoids a second write path.
  const paper = await Paper.create({
    title: input.title,
    examName: input.examName,
    boardId: actor.id,
    contentCipher,
    iv,
    authTag,
    keyId,
    examTime: input.examTime,
    durationMinutes: input.durationMinutes,
    assignedCenterIds: input.assignedCenterIds,
    expectedCustodySteps: input.expectedCustodySteps,
    currentCustodyStep: CUSTODY_STEPS.CREATED,
    status: PAPER_STATUS.SCHEDULED,
    qrToken: crypto.randomUUID(), // temporary unique placeholder to satisfy the required+unique index
  });

  paper.qrToken = signQrToken(paper._id);
  await paper.save();

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'PAPER_CREATED',
    targetType: 'Paper',
    targetId: String(paper._id),
    metadata: { title: paper.title, examName: paper.examName, examTime: paper.examTime, keyId },
  });

  return paper;
}

async function getPaperById(id) {
  const paper = await Paper.findById(id);
  if (!paper) throw new ApiError(404, 'Paper not found');
  return paper;
}

async function listPapers(actor) {
  const filter = {};
  if (actor.role === ROLES.CENTER && actor.centerId) {
    filter.assignedCenterIds = actor.centerId;
  }
  return Paper.find(filter).sort({ examTime: 1 });
}

async function getQrImage(id) {
  const paper = await getPaperById(id);
  const dataUrl = await renderQrDataUrl(paper.qrToken);
  return { paperId: String(paper._id), dataUrl };
}

/**
 * Handles both the "decrypt" and "print" endpoints. Both require the same
 * time-lock + role + custody-state checks; they differ only in which audit
 * action gets recorded, since printing is a materially different exposure
 * event than an on-screen decrypt.
 */
async function accessPaperContent(id, actor, { action, location, deviceId }) {
  const paper = await getPaperById(id);
  const now = new Date();

  try {
    assertWithinAccessWindow(paper.examTime, now);

    if (paper.currentCustodyStep === CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL) {
      const transitionCheck = evaluateTransition({
        fromStep: CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL,
        toStep: CUSTODY_STEPS.OPENED_FOR_EXAM,
        role: actor.role,
      });
      if (!transitionCheck.allowed) {
        throw new ApiError(403, transitionCheck.reason);
      }
      assertExamTimeReached(paper.examTime, now);

      paper.currentCustodyStep = CUSTODY_STEPS.OPENED_FOR_EXAM;
      paper.status = PAPER_STATUS.OPENED;
      await paper.save();

      await TrackingLog.create({
        paperId: paper._id,
        fromStep: CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL,
        toStep: CUSTODY_STEPS.OPENED_FOR_EXAM,
        userId: actor.id,
        roleId: actor.role,
        location: location || null,
        deviceId: deviceId || null,
        timestamp: now,
        syncedAt: now,
        accepted: true,
      });
    } else if (paper.currentCustodyStep !== CUSTODY_STEPS.OPENED_FOR_EXAM) {
      throw new ApiError(
        409,
        `Paper is in custody state ${paper.currentCustodyStep} and cannot be accessed for content`
      );
    }

    const plaintext = decryptContent({
      contentCipher: paper.contentCipher,
      iv: paper.iv,
      authTag: paper.authTag,
      keyId: paper.keyId,
    });

    await appendAuditLog({
      actorUserId: actor.id,
      actorRoleId: actor.role,
      action,
      targetType: 'Paper',
      targetId: String(paper._id),
      metadata: { location, deviceId, success: true },
    });

    return { title: paper.title, examName: paper.examName, content: plaintext };
  } catch (err) {
    // Failed/denied access attempts are exactly the signal the Phase 2
    // R_FAILED_DECRYPT / R_TIME_WINDOW rules key off of — record them even
    // though this request is about to fail.
    await appendAuditLog({
      actorUserId: actor.id,
      actorRoleId: actor.role,
      action: `${action}_DENIED`,
      targetType: 'Paper',
      targetId: String(paper._id),
      metadata: { location, deviceId, success: false, reason: err.message },
    });
    throw err;
  }
}

module.exports = { createPaper, getPaperById, listPapers, getQrImage, accessPaperContent };
