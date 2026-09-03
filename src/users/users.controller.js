const usersService = require('./users.service');
const asyncHandler = require('../middleware/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const users = await usersService.listUsers();
  res.status(200).json({ users });
});

const getOne = asyncHandler(async (req, res) => {
  const user = await usersService.getUser(req.params.id);
  res.status(200).json({ user });
});

const deactivate = asyncHandler(async (req, res) => {
  const user = await usersService.deactivateUser(req.params.id, req.user);
  res.status(200).json({ user });
});

const setIdProof = asyncHandler(async (req, res) => {
  const user = await usersService.setIdProof(req.params.id, req.body.idProofImage, req.user);
  res.status(200).json({ user });
});

module.exports = { list, getOne, deactivate, setIdProof };
