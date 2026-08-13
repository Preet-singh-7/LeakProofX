// Key rotation bookkeeping — see README.md "Key rotation" section for the
// full operational procedure. This script does NOT generate or handle raw
// key material; it only records the rotation event in KeyVersion/AuditLog
// once you've already provisioned the new key in env/secret-manager.
//
// Usage: node scripts/rotateKey.js <newKeyId>
//   e.g. node scripts/rotateKey.js v2
//
// Prerequisite: PAPER_ENC_KEY_<newKeyId> must already be set in env,
// decoding to a 32-byte AES-256 key (same requirement as any active key).
require('dotenv').config();
const mongoose = require('mongoose');
const { env } = require('../src/config/env');
const { getKeyBuffer } = require('../src/encryption/keyManager');
const KeyVersion = require('../src/models/KeyVersion');
const { appendAuditLog } = require('../src/logs/audit.service');

async function main() {
  const newKeyId = process.argv[2];
  if (!newKeyId) {
    console.error('Usage: node scripts/rotateKey.js <newKeyId>');
    process.exit(1);
  }

  // Fail fast if the operator hasn't actually provisioned the key yet —
  // rotating bookkeeping ahead of the real key existing would leave
  // ACTIVE_PAPER_KEY_ID pointing at nothing once the env var is flipped.
  try {
    getKeyBuffer(newKeyId);
  } catch (err) {
    console.error(`Cannot rotate to "${newKeyId}": ${err.message}`);
    console.error(`Set PAPER_ENC_KEY_${newKeyId} in env before running this script.`);
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri);

  const now = new Date();
  const previouslyActive = await KeyVersion.find({ status: 'ACTIVE' });

  for (const kv of previouslyActive) {
    kv.status = 'RETIRED';
    kv.validTo = now;
    await kv.save();
  }

  const newVersion = await KeyVersion.findOneAndUpdate(
    { keyId: newKeyId },
    {
      keyId: newKeyId,
      algorithm: 'aes-256-gcm',
      purpose: 'paper-content-encryption',
      status: 'ACTIVE',
      validFrom: now,
      validTo: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await appendAuditLog({
    actorRoleId: 'SYSTEM',
    action: 'KEY_ROTATED',
    targetType: 'KeyVersion',
    targetId: String(newVersion._id),
    metadata: {
      newKeyId,
      retiredKeyIds: previouslyActive.map((kv) => kv.keyId),
    },
  });

  console.log(`Recorded rotation to key "${newKeyId}".`);
  if (previouslyActive.length) {
    console.log(`Retired: ${previouslyActive.map((kv) => kv.keyId).join(', ')}`);
  }
  console.log('');
  console.log('Next steps (manual — this script does not touch env or restart the app):');
  console.log(`  1. Set ACTIVE_PAPER_KEY_ID=${newKeyId} in your env / secret manager.`);
  console.log('  2. Restart the app so new papers are encrypted under the new key.');
  console.log('  3. Keep PAPER_ENC_KEY_<oldKeyId> configured — papers already encrypted');
  console.log('     under it store that keyId and still need it to decrypt.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Key rotation failed:', err);
  process.exit(1);
});
