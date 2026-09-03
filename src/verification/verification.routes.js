const { Router } = require('express');
const { z } = require('zod');
const controller = require('./verification.controller');
const { validate } = require('../security/input-validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

const idParamSchema = z.object({ id: z.string().length(24) }).strict();
const listQuerySchema = z.object({ paperId: z.string().length(24).optional() }).strict();

// Investigation evidence, not something the acting user should ever be
// able to review or delete themselves — ADMIN and AUDITOR only, matching
// the accountability purpose (see src/models/VerificationEvidence.js).
router.use(requireAuth, requireRole([ROLES.ADMIN, ROLES.AUDITOR]));

router.get('/', validate(listQuerySchema, 'query'), controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);

module.exports = router;
