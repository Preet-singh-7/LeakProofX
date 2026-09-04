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
    // What contentCipher decrypts back to: plain exam text, or a base64 PDF.
    // Never parsed server-side either way — PDFs are stored and returned as
    // opaque encrypted bytes so the browser's own PDF viewer renders them,
    // deliberately avoiding the attack surface a server-side PDF parser
    // would add. See papers.service.js's assertValidPdf.
    contentType: { type: String, enum: ['TEXT', 'PDF'], default: 'TEXT' },

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

    // Set only for papers produced by randomized generation (see
    // src/papers/generation.service.js): groups the distinct per-center
    // variants that came from one generation request, so they can be
    // queried/displayed together. null for manually-created papers.
    examGroupId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    // Which questions from the bank this specific variant compiled its
    // content from, and in what order — the traceability record if this
    // exact paper leaks. Empty for manually-typed papers.
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],

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
    // Also never serialize which questions compiled this paper's content —
    // exposing that (even to whoever just triggered generation) would let
    // anyone with question-bank read access reconstruct the exact exam
    // text before the access window even opens, defeating the point of
    // randomizing per center in the first place. Deliberately not even
    // ADMIN-visible here; forensic lookup after a leak goes through
    // GET /papers/:id/composition instead (AUDITOR/ADMIN only, see
    // papers.service.js's getPaperComposition), a separate, explicitly
    // investigative action rather than something bundled into routine
    // paper responses.
    delete ret.questionIds;
    return ret;
  },
});

module.exports = mongoose.model('Paper', paperSchema);
