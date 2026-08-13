const mongoose = require('mongoose');
const { CUSTODY_STEP_ORDER } = require('../config/constants');

const trackingLogSchema = new mongoose.Schema(
  {
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', required: true, index: true },
    fromStep: { type: String, enum: CUSTODY_STEP_ORDER, required: true },
    toStep: { type: String, enum: CUSTODY_STEP_ORDER, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roleId: { type: String, required: true },
    location: { type: String, default: null },
    deviceId: { type: String, default: null },
    timestamp: { type: Date, required: true, default: Date.now },
    syncedAt: { type: Date, default: null },
    accepted: { type: Boolean, default: true },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true }
);

trackingLogSchema.index({ paperId: 1, timestamp: 1 });

module.exports = mongoose.model('TrackingLog', trackingLogSchema);
