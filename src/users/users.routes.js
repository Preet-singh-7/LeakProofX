const { Router } = require('express');
const { z } = require('zod');
const controller = require('./users.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();
const idParamSchema = z.object({ id: z.string().length(24) }).strict();

router.use(requireAuth, requireRole([ROLES.ADMIN]));

router.get('/', controller.list);
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne);
router.post('/:id/deactivate', validate(idParamSchema, 'params'), controller.deactivate);

module.exports = router;
