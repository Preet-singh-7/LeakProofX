const { Router } = require('express');
const controller = require('./papers.controller');
const { validate, jsonBodyParser } = require('../security/input-validation');
const { sensitiveActionLimiter } = require('../security/rate-limit');
const { createPaperSchema, paperIdParamSchema, accessContentSchema, printContentSchema } = require('./papers.validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

// 4mb, not the platform-wide 10kb default: paper content lives in this
// router's POST / body (papers.validation.js's 2MB content cap), and both
// POST / and POST /:id/print now also carry a live-captured selfieImage
// (accountability evidence — see src/verification/), so there's headroom
// for content + selfie together.
router.use(jsonBodyParser({ limit: '4mb' }));
router.use(requireAuth);

router.post('/', requireRole([ROLES.BOARD, ROLES.ADMIN]), validate(createPaperSchema), controller.create);
router.get('/', requireRole(Object.values(ROLES)), controller.list);
router.get('/:id', validate(paperIdParamSchema, 'params'), requireRole(Object.values(ROLES)), controller.getOne);
router.get(
  '/:id/qr',
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.ADMIN, ROLES.BOARD, ROLES.COURIER, ROLES.CENTER]),
  controller.getQr
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
