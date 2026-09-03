const mongoose = require('mongoose');
const { ROLE_VALUES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_VALUES, required: true },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', default: null },
    tokenVersion: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    // One-time identity verification (not re-checked on every login) — the
    // photo ID an admin reviewed when provisioning this account. Backs the
    // accountability story for BOARD (creates papers) and INVIGILATOR
    // (prints papers): `select: false` like passwordHash, since the image
    // itself should only ever be fetched deliberately by an admin, never
    // returned incidentally with a normal user lookup.
    idProofImage: { type: String, default: null, select: false },
    idVerified: { type: Boolean, default: false },
    idVerifiedAt: { type: Date, default: null },
    idVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
