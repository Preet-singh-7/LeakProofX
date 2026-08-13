const { z } = require('zod');
const { ALERT_STATUS, ALERT_SEVERITY } = require('../config/constants');

const listAlertsQuerySchema = z
  .object({
    status: z.enum(Object.values(ALERT_STATUS)).optional(),
    severity: z.enum(Object.values(ALERT_SEVERITY)).optional(),
    paperId: z.string().length(24).optional(),
  })
  .strict();

const alertIdParamSchema = z.object({ id: z.string().length(24) }).strict();

const resolveAlertSchema = z
  .object({
    resolution: z.string().max(2000).optional(),
  })
  .strict();

module.exports = { listAlertsQuerySchema, alertIdParamSchema, resolveAlertSchema };
