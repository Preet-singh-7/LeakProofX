const { Router } = require('express');
const controller = require('./papers.controller');
const validate = require('../middleware/validate');
const { createPaperSchema, paperIdParamSchema, accessContentSchema } = require('./papers.validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

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
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.INVIGILATOR, ROLES.ADMIN]),
  validate(accessContentSchema),
  controller.decrypt
);
router.post(
  '/:id/print',
  validate(paperIdParamSchema, 'params'),
  requireRole([ROLES.INVIGILATOR, ROLES.ADMIN]),
  validate(accessContentSchema),
  controller.print
);

module.exports = router;
