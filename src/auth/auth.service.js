const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const { appendAuditLog } = require('../logs/audit.service');

const SALT_ROUNDS = 12;

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion }, env.jwt.accessSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwt.accessTtl,
  });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion, type: 'refresh' }, env.jwt.refreshSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwt.refreshTtl,
  });
}

function issueTokenPair(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
}

async function register({ name, email, password, role, centerId }, actor) {
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    throw new ApiError(409, 'A user with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, role, centerId: centerId || null });

  await appendAuditLog({
    actorUserId: actor?.id || null,
    actorRoleId: actor?.role || 'SYSTEM',
    action: 'USER_REGISTERED',
    targetType: 'User',
    targetId: String(user._id),
    metadata: { email, role },
  });

  return user;
}

async function login({ email, password }, context) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await appendAuditLog({
      actorUserId: user._id,
      actorRoleId: user.role,
      action: 'LOGIN_FAILED',
      targetType: 'User',
      targetId: String(user._id),
      metadata: { ip: context?.ip },
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  const tokens = issueTokenPair(user);

  await appendAuditLog({
    actorUserId: user._id,
    actorRoleId: user.role,
    action: 'LOGIN_SUCCESS',
    targetType: 'User',
    targetId: String(user._id),
    metadata: { ip: context?.ip },
  });

  return { user, ...tokens };
}

async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret, { algorithms: ['HS256'] });
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') {
    throw new ApiError(401, 'Invalid token type');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new ApiError(401, 'User not found or deactivated');
  }
  if (user.tokenVersion !== payload.tv) {
    throw new ApiError(401, 'Token has been revoked');
  }

  return issueTokenPair(user);
}

async function logout(userId) {
  // Bumping tokenVersion invalidates every access/refresh token issued so far
  // for this user (revocation-by-version rather than a token blacklist).
  const user = await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }, { new: true });

  await appendAuditLog({
    actorUserId: userId,
    actorRoleId: user?.role || 'UNKNOWN',
    action: 'LOGOUT',
    targetType: 'User',
    targetId: String(userId),
    metadata: {},
  });

  return true;
}

module.exports = { register, login, refresh, logout, issueTokenPair };
