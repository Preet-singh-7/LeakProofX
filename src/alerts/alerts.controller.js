const alertsService = require('./alerts.service');
const asyncHandler = require('../middleware/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const alerts = await alertsService.listAlerts(req.user, req.query);
  res.status(200).json({ alerts });
});

const getOne = asyncHandler(async (req, res) => {
  const alert = await alertsService.getAlertById(req.params.id);
  res.status(200).json({ alert });
});

const acknowledge = asyncHandler(async (req, res) => {
  const alert = await alertsService.acknowledgeAlert(req.params.id, req.user);
  res.status(200).json({ alert });
});

const resolve = asyncHandler(async (req, res) => {
  const alert = await alertsService.resolveAlert(req.params.id, req.user, req.body);
  res.status(200).json({ alert });
});

module.exports = { list, getOne, acknowledge, resolve };
