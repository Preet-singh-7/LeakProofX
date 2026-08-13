const Alert = require('../models/Alert');
const { ApiError } = require('../middleware/errorHandler');
const { appendAuditLog } = require('../logs/audit.service');
const { ALERT_STATUS, ROLES } = require('../config/constants');

async function listAlerts(actor, filters) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.severity) query.severity = filters.severity;
  if (filters.paperId) query.paperId = filters.paperId;

  // CENTER accounts only see alerts scoped to their own center — same
  // pattern as papers.service.listPapers restricting by assignedCenterIds.
  if (actor.role === ROLES.CENTER && actor.centerId) {
    query.centerId = actor.centerId;
  }

  return Alert.find(query).sort({ createdAt: -1 }).limit(200);
}

async function getAlertById(id) {
  const alert = await Alert.findById(id);
  if (!alert) throw new ApiError(404, 'Alert not found');
  return alert;
}

async function acknowledgeAlert(id, actor) {
  const alert = await getAlertById(id);
  if (alert.status !== ALERT_STATUS.OPEN) {
    throw new ApiError(409, `Alert is already ${alert.status.toLowerCase()}`);
  }

  alert.status = ALERT_STATUS.ACKNOWLEDGED;
  alert.acknowledgedBy = actor.id;
  alert.acknowledgedAt = new Date();
  await alert.save();

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'ALERT_ACKNOWLEDGED',
    targetType: 'Alert',
    targetId: String(alert._id),
    metadata: { severity: alert.severity, riskScore: alert.riskScore },
  });

  return alert;
}

async function resolveAlert(id, actor, { resolution } = {}) {
  const alert = await getAlertById(id);
  if (alert.status === ALERT_STATUS.RESOLVED) {
    throw new ApiError(409, 'Alert is already resolved');
  }

  alert.status = ALERT_STATUS.RESOLVED;
  alert.resolvedBy = actor.id;
  alert.resolvedAt = new Date();
  await alert.save();

  await appendAuditLog({
    actorUserId: actor.id,
    actorRoleId: actor.role,
    action: 'ALERT_RESOLVED',
    targetType: 'Alert',
    targetId: String(alert._id),
    metadata: { severity: alert.severity, riskScore: alert.riskScore, resolution },
  });

  return alert;
}

module.exports = { listAlerts, getAlertById, acknowledgeAlert, resolveAlert };
