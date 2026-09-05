const crypto = require('crypto');
const mongoose = require('mongoose');
const Paper = require('../models/Paper');
const Question = require('../models/Question');
const VerificationEvidence = require('../models/VerificationEvidence');
const { encryptContent } = require('../encryption/crypto');
const { signQrToken } = require('./qr');
const { balanceTopics } = require('../llm/balanceTopics');
const { LlmError } = require('../llm/client');
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

function poolKey(topic, difficulty) {
  return `${topic || ''}::${difficulty}`;
}

/**
 * Turns the blueprint (topic optional per row) into a flat list of
 * concrete (topic, difficulty, count) requirements. A row with an
 * explicit topic passes through untouched — no LLM involved. A row left
 * topic-unspecified has its count spread across whatever topics actually
 * exist in the bank for that subject/difficulty via Job B (see
 * docs/llm-integration.md) — this is what prevents a paper from
 * accidentally ending up concentrated in one topic when the admin didn't
 * ask for a specific one.
 */
async function expandBlueprint(subject, blueprint) {
  const expanded = [];
  for (const row of blueprint) {
    if (row.topic) {
      expanded.push({ topic: row.topic, difficulty: row.difficulty, count: row.count });
      continue;
    }

    const pool = await Question.find({ subject, difficulty: row.difficulty }, 'topic');
    const availability = {};
    for (const q of pool) {
      const key = q.topic || '';
      availability[key] = (availability[key] || 0) + 1;
    }

    let distribution;
    try {
      distribution = await balanceTopics({ subject, difficulty: row.difficulty, totalCount: row.count, availability });
    } catch (err) {
      if (err instanceof LlmError) {
        throw new ApiError(502, `AI syllabus balancing failed, paper not generated: ${err.message}`, undefined, 'LLM_BALANCING_FAILED');
      }
      throw err;
    }

    // NOT `topic || undefined` — an untagged question's topic really is the
    // literal empty string '' (Question.js's schema default), a concrete
    // value meaning "only untagged questions," not "no topic constraint at
    // all." Coercing it to undefined here previously made buildPools skip
    // the topic filter entirely for that entry, silently pulling from every
    // topic instead of just the untagged ones — a real bug, caught live: a
    // generated paper had the same question selected twice, once via its
    // own topic's dedicated (small) pool and once via the untagged bucket's
    // filter-less (and therefore much larger, overlapping) pool.
    for (const [topic, count] of Object.entries(distribution)) {
      expanded.push({ topic, difficulty: row.difficulty, count });
    }
  }

  // Merge entries that land on the same (topic, difficulty) — e.g. two
  // blueprint rows explicitly naming the same topic, or a balanced row's
  // output overlapping an explicit row's topic.
  const merged = new Map();
  for (const entry of expanded) {
    const key = poolKey(entry.topic, entry.difficulty);
    if (merged.has(key)) {
      merged.get(key).count += entry.count;
    } else {
      merged.set(key, { ...entry });
    }
  }
  return [...merged.values()];
}

async function buildPools(subject, expanded) {
  const pools = {};
  for (const { topic, difficulty, count } of expanded) {
    const key = poolKey(topic, difficulty);
    if (pools[key]) continue;
    // Always filter by topic, including the empty string (untagged) — every
    // entry reaching this point came either from an explicit blueprint row
    // or from Job B's distribution, both of which always carry a concrete
    // topic value. There is no "no topic constraint" case here; a filter
    // this unconditional is what keeps the untagged pool from silently
    // widening to include every topic (see expandBlueprint's comment).
    const pool = await Question.find({ subject, difficulty, topic });
    if (pool.length < count) {
      throw new ApiError(
        400,
        `Not enough ${difficulty} questions for subject "${subject}"${topic ? ` / topic "${topic}"` : ''} — need ${count}, have ${pool.length}`,
        undefined,
        'INSUFFICIENT_QUESTIONS'
      );
    }
    pools[key] = pool;
  }
  return pools;
}

function pickSelection(pools, expanded) {
  const selected = [];
  for (const { topic, difficulty, count } of expanded) {
    const key = poolKey(topic, difficulty);
    selected.push(...shuffle(pools[key]).slice(0, count));
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
 * assignedCenterIds — each pulled fresh from the question bank per the
 * same expanded blueprint (topic+difficulty -> count), independently
 * shuffled per center. Unlike createPaper (one shared paper, one custody
 * chain, possibly multiple centers), each variant here is its own Paper
 * document with its own custody chain and QR — a leaked physical copy can
 * be matched back to exactly one center by its content. The topic mix
 * itself (see expandBlueprint) is the same across every center's variant;
 * only which specific questions fill it, and their order, differs.
 */
async function generatePaperVariants(input, actor) {
  const { title, examName, examTime, durationMinutes, assignedCenterIds, subject, blueprint, expectedCustodySteps, selfieImage } = input;

  const expanded = await expandBlueprint(subject, blueprint);
  const pools = await buildPools(subject, expanded);

  const examGroupId = new mongoose.Types.ObjectId();
  const usedContents = new Set();
  const papers = [];

  for (const centerId of assignedCenterIds) {
    let selected;
    let content;
    let attempts = 0;
    do {
      selected = pickSelection(pools, expanded);
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
        // Topic-level counts, not question identity — doesn't defeat the
        // blind-generation property (Paper.js strips questionIds from
        // every routine response), just documents the syllabus mix this
        // variant was built from.
        topicDistribution: expanded.map((e) => ({ topic: e.topic || '(untagged)', difficulty: e.difficulty, count: e.count })),
      },
    });

    papers.push(paper);
  }

  return papers;
}

// expandBlueprint and buildPools are also exported for test/llm.test.js's
// regression test — see the real duplicate-selection bug documented in
// docs/llm-integration.md's Testing section, caught by running the real
// flow end-to-end rather than by the mocked tagQuestion/balanceTopics
// tests alone.
module.exports = { generatePaperVariants, expandBlueprint, buildPools };
