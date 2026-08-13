const { env } = require('../config/env');
const { getActiveKeyId } = require('./keyManager');
const KeyVersion = require('../models/KeyVersion');
const { appendAuditLog } = require('../logs/audit.service');

/**
 * On startup, makes sure the currently-configured ACTIVE_PAPER_KEY_ID has a
 * corresponding KeyVersion record. Without this, a fresh deployment's first
 * key would have no bookkeeping trail at all — scripts/rotateKey.js only
 * records the *transition* between keys, so the very first key needs this
 * separate bootstrap step to appear in KeyVersion/AuditLog history.
 */
async function ensureActiveKeyVersion() {
  const activeKeyId = getActiveKeyId(); // throws if misconfigured — fail startup loudly, not silently
  const existing = await KeyVersion.findOne({ keyId: activeKeyId });
  if (existing) return existing;

  const created = await KeyVersion.create({
    keyId: activeKeyId,
    algorithm: 'aes-256-gcm',
    purpose: 'paper-content-encryption',
    status: 'ACTIVE',
    validFrom: new Date(),
  });

  await appendAuditLog({
    actorRoleId: 'SYSTEM',
    action: 'KEY_REGISTERED',
    targetType: 'KeyVersion',
    targetId: String(created._id),
    metadata: { keyId: activeKeyId },
  });

  return created;
}

module.exports = { ensureActiveKeyVersion };
