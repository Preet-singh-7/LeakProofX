const mongoose = require('mongoose');

// Minimal supporting entity referenced by User.centerId, Paper.assignedCenterIds,
// and Alert.centerId. Not one of the core entities enumerated in the spec, but
// needed so those references resolve to something concrete rather than a bare string.
const centerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    address: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Center', centerSchema);
