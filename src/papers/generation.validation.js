const { z } = require('zod');
const { QUESTION_DIFFICULTY_VALUES, CUSTODY_STEP_ORDER } = require('../config/constants');

const objectId = z.string().length(24);

// One paper variant is generated per entry in assignedCenterIds — this is
// what makes generation different from createPaperSchema's optional,
// purely-informational assignedCenterIds: here it drives how many distinct
// papers get created. See generation.service.js.
const generatePapersSchema = z
  .object({
    title: z.string().min(1).max(300),
    examName: z.string().min(1).max(300),
    examTime: z.coerce.date(),
    durationMinutes: z.number().int().positive().max(24 * 60),
    assignedCenterIds: z.array(objectId).min(1),
    subject: z.string().min(1).max(200),
    // Per-row topic, not a single request-wide filter: a row with a topic
    // set draws only from that topic (no LLM involved); a row left
    // topic-unspecified has its count spread across whatever topics exist
    // in the bank by the LLM's syllabus-balancing (Job B — see
    // generation.service.js and docs/llm-integration.md), so a paper
    // doesn't end up accidentally concentrated in one topic.
    blueprint: z
      .array(
        z.object({
          topic: z.string().max(200).optional(),
          difficulty: z.enum(QUESTION_DIFFICULTY_VALUES),
          count: z.number().int().positive().max(100),
        })
      )
      .min(1)
      .max(20),
    expectedCustodySteps: z.array(z.enum(CUSTODY_STEP_ORDER)).optional(),
    selfieImage: z.string().min(1),
  })
  .strict();

module.exports = { generatePapersSchema };
