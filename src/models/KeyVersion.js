const mongoose = require('mongoose');

// Metadata record only. The actual key material lives in env/secret manager
// (see src/encryption/keyManager.js) and is never stored or referenced by value here.
const keyVersionSchema = new mongoose.Schema(
  {
    keyId: { type: String, required: true, unique: true, index: true },
    algorithm: { type: String, required: true, default: 'aes-256-gcm' },
    purpose: { type: String, required: true, default: 'paper-content-encryption' },
    validFrom: { type: Date, required: true, default: Date.now },
    validTo: { type: Date, default: null },
    status: { type: String, enum: ['ACTIVE', 'RETIRED'], default: 'ACTIVE' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('KeyVersion', keyVersionSchema);
