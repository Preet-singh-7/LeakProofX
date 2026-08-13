const trackingService = require('./tracking.service');
const asyncHandler = require('../middleware/asyncHandler');

const scan = asyncHandler(async (req, res) => {
  const { paper, log } = await trackingService.recordScan(req.body, req.user);
  res.status(201).json({ paper, log });
});

const timeline = asyncHandler(async (req, res) => {
  const logs = await trackingService.getTimeline(req.params.id);
  res.status(200).json({ logs });
});

module.exports = { scan, timeline };
