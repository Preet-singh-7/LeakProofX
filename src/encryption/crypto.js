const crypto = require('crypto');
const { getKeyBuffer, getActiveKeyId, ALGORITHM } = require('./keyManager');

const IV_BYTES = 12; // recommended IV length for GCM

/**
 * Encrypts plaintext paper content with AES-256-GCM using the currently
 * active key. Returns everything needed to decrypt later, but never the key
 * itself — callers persist keyId (a reference), not key material.
 */
function encryptContent(plaintext) {
  const keyId = getActiveKeyId();
  const key = getKeyBuffer(keyId);
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    contentCipher: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId,
  };
}

/**
 * Decrypts paper content. Throws if the key, IV, or auth tag don't match —
 * GCM's auth tag check means any tampering with the ciphertext is detected
 * here rather than silently producing garbage plaintext.
 */
function decryptContent({ contentCipher, iv, authTag, keyId }) {
  const key = getKeyBuffer(keyId);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(contentCipher, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

module.exports = { encryptContent, decryptContent };
