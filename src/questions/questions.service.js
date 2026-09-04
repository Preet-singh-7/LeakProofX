const Question = require('../models/Question');
const { appendAuditLog } = require('../logs/audit.service');
const { ApiError } = require('../middleware/errorHandler');

async function createQuestion(input, actor) {
  const question = await Question.create({ ...input, createdBy: actor.id });

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
