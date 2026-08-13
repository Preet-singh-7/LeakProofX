const { Router } = require('express');
const Paper = require('../models/Paper');
const Alert = require('../models/Alert');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = Router();

router.use(requireAuth);

// Minimal metrics for Phase 1 so the Phase 3 dashboard has a real endpoint to
// point at from day one. Deeper analytics (trends, per-center breakdowns)
// are a Phase 3 frontend concern layered on top of this.
router.get(
  '/summary',
  requireRole([ROLES.ADMIN, ROLES.BOARD, ROLES.AUDITOR]),
  asyncHandler(async (req, res) => {
    const [papersByStatus, openAlertCount, auditLogCount] = await Promise.all([
      Paper.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Alert.countDocuments({ status: 'OPEN' }),
      AuditLog.estimatedDocumentCount(),
    ]);

    res.status(200).json({
      papersByStatus: Object.fromEntries(papersByStatus.map((p) => [p._id, p.count])),
      openAlertCount,
      auditLogCount,
    });
  })
);

module.exports = router;
