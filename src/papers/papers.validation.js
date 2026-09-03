const { z } = require('zod');
const { CUSTODY_STEP_ORDER } = require('../config/constants');

const objectId = z.string().length(24);

const createPaperSchema = z
  .object({
    title: z.string().min(1).max(300),
    examName: z.string().min(1).max(300),
    content: z.string().min(1).max(2_000_000), // raw plaintext; encrypted before storage
    examTime: z.coerce.date(),
    durationMinutes: z.number().int().positive().max(24 * 60),
    assignedCenterIds: z.array(objectId).default([]),
    expectedCustodySteps: z.array(z.enum(CUSTODY_STEP_ORDER)).optional(),
    // Required, not optional: a live selfie captured client-side at the
    // moment of submission, so whoever created this specific paper is
    // photographically accountable for it — not just "whoever's password
    // worked." See src/verification/.
    selfieImage: z.string().min(1),
  })
  .strict();

const paperIdParamSchema = z.object({ id: objectId }).strict();

const accessContentSchema = z
  .object({
    location: z.string().max(200).optional(),
    deviceId: z.string().max(200).optional(),
  })
  .strict();

// Printing is the one content-access action that produces a physical,
// leak-able copy — decrypt (on-screen view) does not require this, print
// does. Same accountability reasoning as createPaperSchema's selfieImage.
const printContentSchema = accessContentSchema
  .extend({
    selfieImage: z.string().min(1),
  })
  .strict();

module.exports = { createPaperSchema, paperIdParamSchema, accessContentSchema, printContentSchema };
