const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRoleId: { type: String, default: 'SYSTEM' },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    prevHash: { type: String, required: true },
    currentHash: { type: String, required: true, unique: true, index: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    // Mongoose's default minimize:true strips empty-object fields (like an
    // empty metadata: {}) before writing. That would make the persisted
    // document diverge from the payload the hash chain was computed over,
    // so it's disabled here — the audit trail must store exactly what was hashed.
    minimize: false,
  }
);

// Append-only: this collection must never be updated or deleted through the app layer.
auditLogSchema.pre('findOneAndUpdate', function blockUpdate(next) {
  next(new Error('AuditLog is append-only and cannot be updated.'));
});
auditLogSchema.pre('updateOne', function blockUpdate(next) {
  next(new Error('AuditLog is append-only and cannot be updated.'));
});
auditLogSchema.pre('deleteOne', function blockDelete(next) {
  next(new Error('AuditLog is append-only and cannot be deleted.'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
