const VerificationEvidence = require('../models/VerificationEvidence');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Metadata only (no selfieImage) — this is the list view, meant to show
 * who's on record for a paper without pulling every image over the wire.
 * Fetch a specific entry's image via getEvidenceById.
 */
async function listEvidence({ paperId } = {}) {
  const filter = {};
  if (paperId) filter.paperId = paperId;

  return VerificationEvidence.find(filter)
    .select('-selfieImage')
    .populate('userId', 'name email role')
    .sort({ capturedAt: -1 });
}

async function getEvidenceById(id) {
  const evidence = await VerificationEvidence.findById(id).populate('userId', 'name email role');
  if (!evidence) throw new ApiError(404, 'Verification evidence not found');
  return evidence;
}

module.exports = { listEvidence, getEvidenceById };
