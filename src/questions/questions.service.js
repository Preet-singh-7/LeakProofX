const Question = require('../models/Question');
const { appendAuditLog } = require('../logs/audit.service');
const { ApiError } = require('../middleware/errorHandler');
const { tagQuestion } = require('../llm/tagQuestion');
const { LlmError } = require('../llm/client');

/**
 * Job A (see docs/llm-integration.md): if this question is missing a
 * topic, difficulty, or marks, ask the LLM to fill in just the gaps —
 * this only ever runs against bank content that hasn't been scheduled
 * into any paper yet. If tagging fails for any reason, question creation
 * fails with it — a question is never silently saved half-tagged.
 */
async function resolveTags(input) {
  if (input.topic && input.difficulty && input.marks !== undefined) {
    return input;
  }
  try {
    const tags = await tagQuestion({
      text: input.text,
      subject: input.subject,
      topic: input.topic,
      difficulty: input.difficulty,
      marks: input.marks,
    });
    return { ...input, ...tags };
  } catch (err) {
    if (err instanceof LlmError) {
      throw new ApiError(502, `AI tagging failed, question not added: ${err.message}`, undefined, 'LLM_TAGGING_FAILED');
    }
    throw err;
  }
}

async function createQuestion(input, actor) {
  const resolved = await resolveTags(input);
  const question = await Question.create({ ...resolved, createdBy: actor.id });

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'QUESTION_CREATED',
    targetType: 'Question',
    targetId: String(question._id),
    metadata: { subject: question.subject, difficulty: question.difficulty, marks: question.marks },
  });

  return question;
}

async function listQuestions(filter) {
  const query = {};
  if (filter.subject) query.subject = filter.subject;
  if (filter.topic) query.topic = filter.topic;
  if (filter.difficulty) query.difficulty = filter.difficulty;
  return Question.find(query).sort({ subject: 1, difficulty: 1, createdAt: -1 });
}

async function getQuestionById(id) {
  const question = await Question.findById(id);
  if (!question) throw new ApiError(404, 'Question not found');
  return question;
}

async function updateQuestion(id, input, actor) {
  const question = await getQuestionById(id);
  Object.assign(question, input);
  await question.save();

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'QUESTION_UPDATED',
    targetType: 'Question',
    targetId: String(question._id),
    metadata: { subject: question.subject, difficulty: question.difficulty, marks: question.marks },
  });

  return question;
}

async function deleteQuestion(id, actor) {
  const question = await getQuestionById(id);
  await question.deleteOne();

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'QUESTION_DELETED',
    targetType: 'Question',
    targetId: String(question._id),
    metadata: { subject: question.subject, difficulty: question.difficulty },
  });
}

module.exports = { createQuestion, listQuestions, getQuestionById, updateQuestion, deleteQuestion };
