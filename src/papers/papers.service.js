const crypto = require('crypto');
const Paper = require('../models/Paper');
const TrackingLog = require('../models/TrackingLog');
const VerificationEvidence = require('../models/VerificationEvidence');
const { encryptContent, decryptContent } = require('../encryption/crypto');
const { signQrToken, renderQrDataUrl } = require('./qr');
const { evaluateTransition } = require('./custody');
const { assertWithinAccessWindow, assertExamTimeReached } = require('./timeLock');
const { appendAuditLog } = require('../logs/audit.service');
const anomalyService = require('../anomaly/anomaly.service');
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

  // Accountability evidence: a live selfie captured client-side at the
  // moment of submission (required by createPaperSchema, not optional) —
  // so whoever created this specific paper is photographically on record,
  // not just "whoever's password worked." See src/verification/.
  const evidence = await VerificationEvidence.create({
    userId: actor.id,
    paperId: paper._id,
    action: 'PAPER_CREATED',
    selfieImage: input.selfieImage,
    capturedAt: new Date(),
  });

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'PAPER_CREATED',
    targetType: 'Paper',
    targetId: String(paper._id),
    metadata: {
      title: paper.title,
      examName: paper.examName,
      examTime: paper.examTime,
      keyId,
      verificationEvidenceId: String(evidence._id),
    },
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
async function accessPaperContent(id, actor, { action, location, deviceId, selfieImage }) {
  let paper = await getPaperById(id);
  const now = new Date();
  const eventType = action.startsWith('PAPER_DECRYPTED') ? 'DECRYPT' : 'PRINT';
  // Best-effort scoping for Alert.centerId: prefer the acting user's own
  // center, fall back to the paper's first assigned center. A paper can be
  // assigned to multiple centers, so this is an approximation, not an exact
  // "the event happened at this center" fact — acceptable for MVP triage
  // filtering, not something downstream logic should treat as authoritative.
  const centerId = actor.centerId || paper.assignedCenterIds?.[0] || null;

  try {
    assertWithinAccessWindow(paper.examTime, now);

    if (paper.currentCustodyStep === CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL) {
      const transitionCheck = evaluateTransition({
        fromStep: CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL,
        toStep: CUSTODY_STEPS.OPENED_FOR_EXAM,
        role: actor.role,
      });
      if (!transitionCheck.allowed) {
        throw new ApiError(403, transitionCheck.reason, undefined, transitionCheck.code);
      }
      assertExamTimeReached(paper.examTime, now);

      // Atomic, guarded update — the filter re-checks currentCustodyStep at
      // write time, not just what we read at the top of this function.
      // Concurrent requests that all read HANDOVER_TO_EXAM_HALL before any
      // of them wrote would previously all pass the check above and all
      // call paper.save(), each independently writing its own TrackingLog
      // entry for what should be a single, one-time transition (a real
      // TOCTOU race, found and confirmed live: 8 concurrent decrypt
      // requests produced 3 duplicate OPENED_FOR_EXAM transitions — see
      // docs/security.md). MongoDB resolves a single-document update
      // atomically, so putting the guard condition in the filter itself
      // means exactly one concurrent caller's update actually matches;
      // every other caller gets `updated === null` back.
      const updated = await Paper.findOneAndUpdate(
        { _id: paper._id, currentCustodyStep: CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL },
        { $set: { currentCustodyStep: CUSTODY_STEPS.OPENED_FOR_EXAM, status: PAPER_STATUS.OPENED } },
        { new: true }
      );

      if (updated) {
        // This call won the race — it's the one true transition. Record
        // exactly one TrackingLog entry for it.
        paper = updated;
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
      } else {
        // Someone else's concurrent request already made this exact
        // transition between our read and our write attempt. Re-fetch so
        // the rest of this function acts on the paper's real current
        // state instead of the stale in-memory copy from the top of this
        // function — the content is still legitimately readable (the
        // transition happened, just not because of this particular call).
        paper = await getPaperById(id);
        if (paper.currentCustodyStep !== CUSTODY_STEPS.OPENED_FOR_EXAM) {
          throw new ApiError(
            409,
            `Paper is in custody state ${paper.currentCustodyStep} and cannot be accessed for content`,
            undefined,
            'CUSTODY_STATE'
          );
        }
      }
    } else if (paper.currentCustodyStep !== CUSTODY_STEPS.OPENED_FOR_EXAM) {
      throw new ApiError(
        409,
        `Paper is in custody state ${paper.currentCustodyStep} and cannot be accessed for content`,
        undefined,
        'CUSTODY_STATE'
      );
    }

    const plaintext = decryptContent({
      contentCipher: paper.contentCipher,
      iv: paper.iv,
      authTag: paper.authTag,
      keyId: paper.keyId,
    });

    // Accountability evidence for the one content-access action that
    // produces a physical, leak-able copy: printing. A live selfie is
    // required by printContentSchema (not optional) whenever action is
    // PAPER_PRINTED — decrypt (on-screen view) doesn't carry one and
    // doesn't need this. See src/verification/.
    let verificationEvidenceId;
    if (action === 'PAPER_PRINTED') {
      const evidence = await VerificationEvidence.create({
        userId: actor.id,
        paperId: paper._id,
        action: 'PAPER_PRINTED',
        selfieImage,
        capturedAt: now,
      });
      verificationEvidenceId = String(evidence._id);
    }

    await appendAuditLog({
      actorUserId: actor.id,
      actorRoleId: actor.role,
      action,
      targetType: 'Paper',
      targetId: String(paper._id),
      metadata: { location, deviceId, success: true, verificationEvidenceId },
    });
    await anomalyService.recordEvent({
      type: eventType,
      success: true,
      userId: actor.id,
      role: actor.role,
      paperId: paper._id,
      centerId,
      examTime: paper.examTime,
      now,
      location,
      deviceId,
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
    await anomalyService.recordEvent({
      type: eventType,
      success: false,
      userId: actor.id,
      role: actor.role,
      paperId: paper._id,
      centerId,
      examTime: paper.examTime,
      now,
      location,
      deviceId,
      failureCode: err.failureCode,
    });
    throw err;
  }
}

module.exports = { createPaper, getPaperById, listPapers, getQrImage, accessPaperContent };
