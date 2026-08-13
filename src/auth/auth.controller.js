const authService = require('./auth.service');
const asyncHandler = require('../middleware/asyncHandler');

const register = asyncHandler(async (req, res) => {
  // Self-registration only permitted for the first admin bootstrap flow; in practice
  // this endpoint is ADMIN-gated (see auth.routes.js) so only admins create new accounts.
  const user = await authService.register(req.body, req.user);
  res.status(201).json({ user });
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, { ip: req.ip });
  res.status(200).json({ user, accessToken, refreshToken });
});

const refresh = asyncHandler(async (req, res) => {
  const tokens = await authService.refresh(req.body);
  res.status(200).json(tokens);
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  res.status(200).json({ message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  res.status(200).json({ user: req.user });
});

module.exports = { register, login, refresh, logout, me };
