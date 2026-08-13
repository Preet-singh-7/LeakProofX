const { Router } = require('express');
const Alert = require('../models/Alert');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(requireAuth);

// Phase 1 ships the Alert model and a read-only listing so the schema and
// wiring exist end to end. The anomaly/risk engine that actually populates
// this collection (rule evaluation, thresholds, acknowledge/resolve
// workflow) is built in Phase 2 — see master prompt Phase 2b.
router.get(
  '/',
  requireRole([ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR, ROLES.CENTER]),
  asyncHandler(async (req, res) => {
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(200);
    res.status(200).json({ alerts });
  })
);

module.exports = router;
