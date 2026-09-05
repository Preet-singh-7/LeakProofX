const mongoose = require('mongoose');

// Photographic accountability evidence, captured live at the moment of the
// highest-risk actions in the custody chain: creating a paper (BOARD/ADMIN),
// decrypting it for on-screen view, and printing it (both INVIGILATOR/ADMIN).
// Decrypt is included alongside print — not just print — because viewing
// the plaintext is itself the exposure event (the screen can be
// photographed) and needs the same accountability trail. This is
// deliberately separate from AuditLog — AuditLog is the permanent,
// hash-chained record that an action happened; this is the (larger,
// image-bearing) evidence backing a specific entry, referenced by id
// rather than embedded in the hash chain itself.
const verificationEvidenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', required: true, index: true },
    action: { type: String, enum: ['PAPER_CREATED', 'PAPER_DECRYPTED', 'PAPER_PRINTED'], required: true },
    selfieImage: { type: String, required: true }, // base64 data URL, captured live client-side
    capturedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VerificationEvidence', verificationEvidenceSchema);
