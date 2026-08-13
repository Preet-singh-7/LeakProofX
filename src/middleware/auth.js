const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { ApiError } = require('./errorHandler');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');

/**
 * Verifies the access token and attaches req.user (lean, no passwordHash).
 * Pins the algorithm explicitly so a token crafted with alg:"none" or an
 * unexpected algorithm is rejected outright, regardless of what the token
 * header claims.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.accessSecret, { algorithms: ['HS256'] });
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired access token');
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) {
    throw new ApiError(401, 'User not found or deactivated');
  }
  if (user.tokenVersion !== payload.tv) {
    throw new ApiError(401, 'Token has been revoked');
  }

  req.user = {
    id: String(user._id),
    role: user.role,
    email: user.email,
    centerId: user.centerId ? String(user.centerId) : null,
  };
  next();
});

function requireRole(allowedRoles) {
  return function roleGate(req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, `Role ${req.user.role} is not permitted to perform this action`));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
