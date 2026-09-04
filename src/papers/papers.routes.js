const { Router } = require('express');
const controller = require('./papers.controller');
const { validate, jsonBodyParser } = require('../security/input-validation');
const { sensitiveActionLimiter } = require('../security/rate-limit');
const { createPaperSchema, paperIdParamSchema, accessContentSchema, printContentSchema } = require('./papers.validation');
const { generatePapersSchema } = require('./generation.validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

// 10mb, not the platform-wide 10kb default: paper content lives in this
// router's POST / body, and can now be a base64 PDF up to ~7mb
// (papers.validation.js's MAX_CONTENT_LENGTH), plus both POST / and
// POST /:id/print also carry a live-captured selfieImage (accountability
// evidence — see src/verification/), so there's headroom for content +
// selfie together.
router.use(jsonBodyParser({ limit: '10mb' }));
router.use(requireAuth);

router.post('/', requireRole([ROLES.BOARD, ROLES.ADMIN]), validate(createPaperSchema), controller.create);
router.post('/generate', requireRole([ROLES.BOARD, ROLES.ADMIN]), validate(generatePapersSchema), controller.generate);
router.get('/', requireRole(Object.values(ROLES)), controller.list);
router.get('/:id', validate(paperIdParamSchema, 'params'), requireRole(Object.values(ROLES)), controller.getOne);
router.get(
  '/:id/qr',
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.ADMIN, ROLES.BOARD, ROLES.COURIER, ROLES.CENTER]),
  controller.getQr
);
router.get(
  '/:id/composition',
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.ADMIN, ROLES.AUDITOR]),
  controller.getComposition
);
router.post(
  '/:id/decrypt',
  sensitiveActionLimiter,
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.INVIGILATOR, ROLES.ADMIN]),
  validate(accessContentSchema),
  controller.decrypt
);
router.post(
  '/:id/print',
  sensitiveActionLimiter,
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.INVIGILATOR, ROLES.ADMIN]),
  validate(printContentSchema),
  controller.print
);

module.exports = router;
