const { z } = require('zod');
const { CUSTODY_STEP_ORDER } = require('../config/constants');

const scanEventSchema = z
  .object({
    qrToken: z.string().min(1),
    toStep: z.enum(CUSTODY_STEP_ORDER),
    location: z.string().max(200).optional(),
    deviceId: z.string().max(200).optional(),
    clientTimestamp: z.coerce.date().optional(),
  })
  .strict();

const paperIdParamSchema = z.object({ id: z.string().length(24) }).strict();

module.exports = { scanEventSchema, paperIdParamSchema };
