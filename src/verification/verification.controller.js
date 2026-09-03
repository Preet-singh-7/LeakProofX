const verificationService = require('./verification.service');
const asyncHandler = require('../middleware/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const evidence = await verificationService.listEvidence({ paperId: req.query.paperId });
  res.status(200).json({ evidence });
});

const getOne = asyncHandler(async (req, res) => {
  const evidence = await verificationService.getEvidenceById(req.params.id);
  res.status(200).json({ evidence });
});

module.exports = { list, getOne };
