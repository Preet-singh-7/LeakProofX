const { z } = require('zod');
const { CUSTODY_STEP_ORDER } = require('../config/constants');

const objectId = z.string().length(24);

// 7,000,000 base64 chars comfortably covers a 5MB PDF (base64 inflates size
// ~33%); plain exam text will never remotely approach that, so raising the
// shared ceiling to fit PDFs doesn't meaningfully weaken the text case.
const MAX_CONTENT_LENGTH = 7_000_000;

const createPaperSchema = z
  .object({
    title: z.string().min(1).max(300),
    examName: z.string().min(1).max(300),
    // Raw plaintext, or (when contentType is 'PDF') a base64-encoded PDF —
    // encrypted as-is before storage either way, never parsed server-side.
    content: z.string().min(1).max(MAX_CONTENT_LENGTH),
    contentType: z.enum(['TEXT', 'PDF']).default('TEXT'),
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

// Decrypt (on-screen view) and print both require a live selfie — the
// moment content is decrypted, its plaintext is exposed to whoever's
// looking at the screen, and that's already enough to leak it (photograph
// the monitor with a phone, screenshot, dictate it) without ever hitting
// "print." An earlier version of this schema treated only print as the
// leak-risk action; that was a real gap, found in testing, not a
// deliberate scope limit — viewing is the actual exposure event, printing
// is just one way to act on it. Same accountability reasoning as
// createPaperSchema's selfieImage either way.
const accessContentSchema = z
  .object({
    location: z.string().max(200).optional(),
    deviceId: z.string().max(200).optional(),
    selfieImage: z.string().min(1),
  })
  .strict();

const printContentSchema = accessContentSchema;

module.exports = { createPaperSchema, paperIdParamSchema, accessContentSchema, printContentSchema };
