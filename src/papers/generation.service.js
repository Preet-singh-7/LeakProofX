const crypto = require('crypto');
const mongoose = require('mongoose');
const Paper = require('../models/Paper');
const Question = require('../models/Question');
const VerificationEvidence = require('../models/VerificationEvidence');
const { encryptContent } = require('../encryption/crypto');
const { signQrToken } = require('./qr');
const { appendAuditLog } = require('../logs/audit.service');
const { ApiError } = require('../middleware/errorHandler');
const { CUSTODY_STEPS, PAPER_STATUS } = require('../config/constants');

const MAX_UNIQUENESS_ATTEMPTS = 10;

// Fisher-Yates using crypto.randomInt (not Math.random, which is neither
// uniform nor cryptographically unpredictable) — each center's selection
// order needs to be genuinely independent of every other center's, since
// that's what makes a leaked copy traceable back to which center it came
// from in the first place.
function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickSelection(pools, blueprint) {
  const selected = [];
  for (const { difficulty, count } of blueprint) {
    selected.push(...shuffle(pools[difficulty]).slice(0, count));
  }
  return selected;
}

function compileContent({ title, examName, questions }) {
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const header = `${title}\n${examName}\nTotal marks: ${totalMarks}\n${'='.repeat(40)}`;
  const body = questions
    .map((q, i) => {
      const options = q.options?.length
        ? '\n' + q.options.map((opt, idx) => `   ${String.fromCharCode(65 + idx)}. ${opt}`).join('\n')
        : '';
      return `Q${i + 1}. [${q.marks} marks] ${q.text}${options}`;
    })
    .join('\n\n');
  return `${header}\n\n${body}`;
}

/**
 * Generates one distinct, randomly-assembled paper per entry in
 * assignedCenterIds — each pulled fresh from the question bank per the same
 * blueprint (difficulty -> count), independently shuffled. Unlike
 * createPaper (one shared paper, one custody chain, possibly multiple
 * centers), each variant here is its own Paper document with its own
 * custody chain and QR — a leaked physical copy can be matched back to
 * exactly one center by its content.
 */
async function generatePaperVariants(input, actor) {
  const { title, examName, examTime, durationMinutes, assignedCenterIds, subject, topic, blueprint, expectedCustodySteps, selfieImage } =
    input;

  const pools = {};
  for (const { difficulty, count } of blueprint) {
    const filter = { subject, difficulty };
    if (topic) filter.topic = topic;
    const pool = await Question.find(filter);
    if (pool.length < count) {
      throw new ApiError(
        400,
        `Not enough ${difficulty} questions for subject "${subject}"${topic ? ` / topic "${topic}"` : ''} — need ${count}, have ${pool.length}`,
        undefined,
        'INSUFFICIENT_QUESTIONS'
      );
    }
    pools[difficulty] = pool;
  }

  const examGroupId = new mongoose.Types.ObjectId();
  const usedContents = new Set();
  const papers = [];

  for (const centerId of assignedCenterIds) {
    let selected;
    let content;
    let attempts = 0;
    do {
      selected = pickSelection(pools, blueprint);
      content = compileContent({ title, examName, questions: selected });
      attempts += 1;
    } while (usedContents.has(content) && attempts < MAX_UNIQUENESS_ATTEMPTS);
    usedContents.add(content);

    const { contentCipher, iv, authTag, keyId } = encryptContent(content);

    const paper = await Paper.create({
      title,
      examName,
      boardId: actor.id,
      contentCipher,
      iv,
      authTag,
      keyId,
      examTime,
      durationMinutes,
      assignedCenterIds: [centerId],
      expectedCustodySteps,
      currentCustodyStep: CUSTODY_STEPS.CREATED,
      status: PAPER_STATUS.SCHEDULED,
      qrToken: crypto.randomUUID(), // temporary unique placeholder, same pattern as createPaper
      examGroupId,
      questionIds: selected.map((q) => q._id),
    });

    paper.qrToken = signQrToken(paper._id);
    await paper.save();

    const evidence = await VerificationEvidence.create({
      userId: actor.id,
      paperId: paper._id,
      action: 'PAPER_CREATED',
      selfieImage,
      capturedAt: new Date(),
    });

    const totalMarks = selected.reduce((sum, q) => sum + q.marks, 0);
    await appendAuditLog({
      actorUserId: actor.id,
      actorRoleId: actor.role,
      action: 'PAPER_CREATED',
      targetType: 'Paper',
      targetId: String(paper._id),
      metadata: {
        title,
        examName,
        examTime,
        keyId,
        verificationEvidenceId: String(evidence._id),
        examGroupId: String(examGroupId),
        centerId: String(centerId),
        generated: true,
        questionCount: selected.length,
        totalMarks,
      },
    });

    papers.push(paper);
  }

  return papers;
}

module.exports = { generatePaperVariants };
