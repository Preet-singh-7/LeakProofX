const { Router } = require('express');
const controller = require('./tracking.controller');
const { validate, jsonBodyParser } = require('../security/input-validation');
const { scanEventSchema, paperIdParamSchema } = require('./tracking.validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(jsonBodyParser());
router.use(requireAuth);

router.post(
  '/scan',
  requireRole([ROLES.COURIER, ROLES.CENTER, ROLES.INVIGILATOR, ROLES.BOARD, ROLES.ADMIN]),
  validate(scanEventSchema),
  controller.scan
);
router.get('/:id', validate(paperIdParamSchema, 'params'), requireRole(Object.values(ROLES)), controller.timeline);

module.exports = router;
