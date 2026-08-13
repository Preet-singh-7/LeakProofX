const { evaluateEvent } = require('./engine');
const { LOOKBACK_MINUTES } = require('./config');
const AuditLog = require('../models/AuditLog');
const Paper = require('../models/Paper');
const Center = require('../models/Center');
const Alert = require('../models/Alert');
const logger = require('../logs/logger');

async function countRecentFailedDecrypts({ userId, paperId }) {
  if (!userId || !paperId) return 0;
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);
  return AuditLog.countDocuments({
    actorUserId: userId,
    targetId: String(paperId),
    action: { $in: ['PAPER_DECRYPTED_DENIED', 'PAPER_PRINTED_DENIED'] },
    timestamp: { $gte: since },
  });
}

async function countRecentFailedLogins(userId) {
  if (!userId) return 0;
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);
  return AuditLog.countDocuments({
    actorUserId: userId,
    action: 'LOGIN_FAILED',
    timestamp: { $gte: since },
  });
}

async function getExpectedLocations(paperId) {
  if (!paperId) return [];
  const paper = await Paper.findById(paperId).select('assignedCenterIds').lean();
  if (!paper || !paper.assignedCenterIds?.length) return [];

  const centers = await Center.find({ _id: { $in: paper.assignedCenterIds } }).select('name code').lean();
  return centers.flatMap((c) => [c.name, c.code]).filter(Boolean);
}

async function buildContext(event) {
  const context = {};

  if ((event.type === 'DECRYPT' || event.type === 'PRINT') && !event.success) {
    context.recentFailedDecryptCount = await countRecentFailedDecrypts({ userId: event.userId, paperId: event.paperId });
  }

  if (event.type === 'SCAN') {
    context.expectedLocations = await getExpectedLocations(event.paperId);
  }

  if (event.type === 'LOGIN' && !event.success) {
    context.recentFailedLoginCount = await countRecentFailedLogins(event.userId);
  }

  return context;
}

/**
 * Single entry point called from auth.service (LOGIN), papers.service
 * (DECRYPT/PRINT), and tracking.service (SCAN). Evaluates the event against
 * every anomaly rule and, if the score crosses the warning threshold,
 * persists an Alert. Deliberately fails open: a bug in anomaly scoring
 * must never block or fail the request it's observing — the primary
 * security controls (role/time-lock/custody checks) already ran and made
 * their own allow/deny decision before this is ever called.
 */
async function recordEvent(event) {
  try {
    const context = await buildContext(event);
    const { riskScore, firedRules, severity } = evaluateEvent(event, context);

    if (!severity) return { riskScore, firedRules, severity: null };

    const alert = await Alert.create({
      paperId: event.paperId || null,
      userId: event.userId || null,
      centerId: event.centerId || null,
      riskScore,
      severity,
      triggeredRules: firedRules,
      context: {
        eventType: event.type,
        fromStep: event.fromStep,
        toStep: event.toStep,
        location: event.location,
        deviceId: event.deviceId,
        ip: event.ip,
        failureCode: event.failureCode,
      },
    });

    logger.security(
      { alertId: String(alert._id), severity, riskScore, firedRules, eventType: event.type, userId: event.userId },
      severity === 'CRITICAL' ? 'CRITICAL anomaly alert raised — notify higher authority' : 'anomaly alert raised'
    );

    return { riskScore, firedRules, severity, alertId: alert._id };
  } catch (err) {
    logger.error({ err, eventType: event?.type }, 'anomaly evaluation failed — request was not blocked by this');
    return { riskScore: 0, firedRules: [], severity: null };
  }
}

module.exports = { recordEvent };
