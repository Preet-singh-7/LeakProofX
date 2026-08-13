const mongoose = require('mongoose');
const { ALERT_SEVERITY, ALERT_STATUS } = require('../config/constants');

const alertSchema = new mongoose.Schema(
  {
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', default: null },
    riskScore: { type: Number, required: true, min: 0 },
    severity: { type: String, enum: Object.values(ALERT_SEVERITY), required: true },
    triggeredRules: [{ type: String }],
    status: {
      type: String,
      enum: Object.values(ALERT_STATUS),
      default: ALERT_STATUS.OPEN,
    },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
