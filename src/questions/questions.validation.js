const { z } = require('zod');
const { QUESTION_DIFFICULTY_VALUES } = require('../config/constants');

const objectId = z.string().length(24);

const questionIdParamSchema = z.object({ id: objectId }).strict();

const createQuestionSchema = z
  .object({
    subject: z.string().min(1).max(200),
    // topic/difficulty/marks are all optional here (unlike most required
    // fields elsewhere) — whatever's left out gets filled in by the LLM
    // at creation time (see questions.service.js's resolveTags / Job A in
    // docs/llm-integration.md). If tagging fails, creation fails with it;
    // nothing is ever saved half-tagged.
    topic: z.string().max(200).optional(),
    difficulty: z.enum(QUESTION_DIFFICULTY_VALUES).optional(),
    marks: z.number().int().positive().max(100).optional(),
    text: z.string().min(1).max(5_000),
    options: z.array(z.string().min(1).max(500)).max(10).optional(),
  })
  .strict();

const updateQuestionSchema = createQuestionSchema.partial().strict();

const listQuestionsQuerySchema = z
  .object({
    subject: z.string().max(200).optional(),
    topic: z.string().max(200).optional(),
    difficulty: z.enum(QUESTION_DIFFICULTY_VALUES).optional(),
  })
  .strict();

module.exports = { questionIdParamSchema, createQuestionSchema, updateQuestionSchema, listQuestionsQuerySchema };
