const mongoose = require('mongoose');
const { CUSTODY_STEP_ORDER, CUSTODY_STEPS, PAPER_STATUS } = require('../config/constants');

const paperSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    examName: { type: String, required: true, trim: true },
    boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Encrypted content (AES-256-GCM). Raw key never stored here — only a reference.
    contentCipher: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyId: { type: String, required: true },

    examTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },

    expectedCustodySteps: {
      type: [String],
      enum: CUSTODY_STEP_ORDER,
      default: CUSTODY_STEP_ORDER,
    },
    currentCustodyStep: {
      type: String,
      enum: CUSTODY_STEP_ORDER,
      default: CUSTODY_STEPS.CREATED,
    },

    assignedCenterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Center' }],

    status: {
      type: String,
      enum: Object.values(PAPER_STATUS),
      default: PAPER_STATUS.SCHEDULED,
    },

    qrToken: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

paperSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // Never serialize ciphertext material in list/detail responses by default.
    delete ret.contentCipher;
    delete ret.iv;
    delete ret.authTag;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Paper', paperSchema);
