const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

const GENESIS_HASH = '0'.repeat(64);

function computeHash(prevHash, payload, timestamp) {
  const canonical = JSON.stringify({ prevHash, payload, timestamp: timestamp.toISOString() });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Serializes chain appends within this process so two concurrent requests
 * can't both read the same "latest" hash and fork the chain. This is an
 * in-memory mutex — it does NOT protect against a multi-instance deployment
 * writing concurrently (see Phase 1 docs: "known limitations").
 */
let writeQueue = Promise.resolve();

function appendAuditLog({ actorUserId = null, actorRoleId = 'SYSTEM', action, targetType, targetId = null, metadata = {} }) {
  const task = writeQueue.then(async () => {
    const timestamp = new Date();
    const last = await AuditLog.findOne().sort({ createdAt: -1, _id: -1 }).lean();
    const prevHash = last ? last.currentHash : GENESIS_HASH;

    const payload = { actorUserId, actorRoleId, action, targetType, targetId, metadata };
    const currentHash = computeHash(prevHash, payload, timestamp);

    const entry = await AuditLog.create({
      actorUserId,
      actorRoleId,
      action,
      targetType,
      targetId,
      metadata,
      prevHash,
      currentHash,
      timestamp,
    });

    logger.info({ audit: { action, targetType, targetId, actorRoleId } }, 'audit log recorded');
    return entry;
  });

  // Keep the queue alive even if this particular append fails, but surface the error to the caller.
  writeQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

/**
 * Recomputes the chain from genesis and reports the first break found, if any.
 * Used by scripts/verifyHashChain.js (Phase 5 tooling lives on top of this).
 */
async function verifyChain() {
  const entries = await AuditLog.find().sort({ createdAt: 1, _id: 1 }).lean();
  let expectedPrev = GENESIS_HASH;

  for (const entry of entries) {
    const recomputed = computeHash(expectedPrev, {
      actorUserId: entry.actorUserId,
      actorRoleId: entry.actorRoleId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
    }, entry.timestamp);

    if (entry.prevHash !== expectedPrev || entry.currentHash !== recomputed) {
      return { valid: false, brokenAt: entry._id, expectedPrev, actualPrev: entry.prevHash };
    }
    expectedPrev = entry.currentHash;
  }

  return { valid: true, entriesChecked: entries.length };
}

module.exports = { appendAuditLog, verifyChain, GENESIS_HASH };
