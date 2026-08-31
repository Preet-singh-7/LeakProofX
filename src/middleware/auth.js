const { verifyAccessToken } = require('../security/jwt-auth');
const { ApiError } = require('./errorHandler');
const User = require('../models/User');
const asyncHandler = require('./asyncHandler');
const logger = require('../logs/logger');

/**
 * Verifies the access token and attaches req.user (lean, no passwordHash).
 * Token signing/verification itself lives in security/jwt-auth.js (algorithm
 * pinning, revocation model) — this middleware is just the HTTP-facing gate.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    logger.security({ ip: req.ip, path: req.originalUrl }, 'rejected invalid/expired access token');
    throw new ApiError(401, 'Invalid or expired access token');
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) {
    throw new ApiError(401, 'User not found or deactivated');
  }
  if (user.tokenVersion !== payload.tv) {
    logger.security({ userId: String(user._id), ip: req.ip, path: req.originalUrl }, 'rejected revoked access token');
    throw new ApiError(401, 'Token has been revoked');
  }

  req.user = {
    id: String(user._id),
    name: user.name,
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
      logger.security(
        { userId: req.user.id, role: req.user.role, path: req.originalUrl },
        'rejected role-unauthorized request'
      );
      return next(new ApiError(403, `Role ${req.user.role} is not permitted to perform this action`));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
