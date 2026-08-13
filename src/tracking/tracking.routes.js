const { Router } = require('express');
const controller = require('./tracking.controller');
const validate = require('../middleware/validate');
const { scanEventSchema, paperIdParamSchema } = require('./tracking.validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(requireAuth);

router.post(
  '/scan',
  requireRole([ROLES.COURIER, ROLES.CENTER, ROLES.INVIGILATOR, ROLES.BOARD, ROLES.ADMIN]),
  validate(scanEventSchema),
  controller.scan
);
router.get('/:id', validate(paperIdParamSchema, 'params'), requireRole(Object.values(ROLES)), controller.timeline);

module.exports = router;
