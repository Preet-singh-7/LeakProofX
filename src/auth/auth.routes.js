const { Router } = require('express');
const controller = require('./auth.controller');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema, refreshSchema } = require('./auth.validation');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

// The very first admin is created out-of-band via scripts/seedAdmin.js.
// From then on, new accounts are provisioned by an ADMIN through this endpoint —
// there is no open self-signup surface for an exam-security system.
router.post('/register', requireAuth, requireRole([ROLES.ADMIN]), validate(registerSchema), controller.register);
router.post('/login', validate(loginSchema), controller.login);
router.post('/refresh', validate(refreshSchema), controller.refresh);
router.post('/logout', requireAuth, controller.logout);
router.get('/me', requireAuth, controller.me);

module.exports = router;
