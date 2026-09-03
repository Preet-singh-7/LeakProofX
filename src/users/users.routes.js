const { Router } = require('express');
const { z } = require('zod');
const controller = require('./users.controller');
const { validate, jsonBodyParser } = require('../security/input-validation');
const { adminLimiter } = require('../security/rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();
const idParamSchema = z.object({ id: z.string().length(24) }).strict();
const idProofSchema = z.object({ idProofImage: z.string().min(1) }).strict();

// 3mb, not the platform-wide 10kb default: this router's only large payload
// is the ID proof photo (users.routes.js's POST /:id/id-proof), the same
// reasoning as papers.routes.js's 2mb bump for paper content.
router.use(jsonBodyParser({ limit: '3mb' }));
router.use(adminLimiter);
router.use(requireAuth, requireRole([ROLES.ADMIN]));

router.get('/', controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post('/:id/deactivate', validate(idParamSchema, 'params'), controller.deactivate);
router.post(
  '/:id/id-proof',
  validate(idParamSchema, 'params'),
  validate(idProofSchema),
  controller.setIdProof
);

module.exports = router;
