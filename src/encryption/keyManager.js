const { env } = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const REQUIRED_KEY_BYTES = 32;

/**
 * Resolves a paper-content encryption key by keyId. Key material lives only in
 * process env (or a secret manager in production) and is loaded once at
 * startup — it is never persisted to Mongo or logged.
 */
function getKeyBuffer(keyId) {
  const base64Key = env.paperEncKeys[keyId];
  if (!base64Key) {
    throw new Error(`Unknown or unconfigured encryption keyId: ${keyId}`);
  }
  const buffer = Buffer.from(base64Key, 'base64');
  if (buffer.length !== REQUIRED_KEY_BYTES) {
    throw new Error(
      `Encryption key "${keyId}" must decode to ${REQUIRED_KEY_BYTES} bytes for AES-256-GCM (got ${buffer.length}).`
    );
  }
  return buffer;
}

function getActiveKeyId() {
  const keyId = env.activePaperKeyId;
  if (!env.paperEncKeys[keyId]) {
    throw new Error(`ACTIVE_PAPER_KEY_ID "${keyId}" has no corresponding PAPER_ENC_KEY_${keyId} in env.`);
  }
  return keyId;
}

module.exports = { getKeyBuffer, getActiveKeyId, ALGORITHM };
