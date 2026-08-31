const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const { appendAuditLog } = require('../logs/audit.service');
const { issueTokenPair, verifyRefreshToken } = require('../security/jwt-auth');
const anomalyService = require('../anomaly/anomaly.service');

const SALT_ROUNDS = 12;

// Precomputed bcrypt hash of a value nobody will ever type. login() compares
// against this whenever the account doesn't exist, so a nonexistent/inactive
// email still pays the same bcrypt cost as a real wrong-password attempt —
// without it, an early return for "no such user" is measurably faster than
// the wrong-password path, letting an attacker enumerate valid emails by
// response latency alone.
const DUMMY_HASH = bcrypt.hashSync('leakproofx-dummy-password-for-timing', SALT_ROUNDS);

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
  // Always compare against something — a real hash if the user exists, the
  // dummy one otherwise — so this call takes the same time either way (see
  // DUMMY_HASH above).
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);

  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!valid) {
    await appendAuditLog({
      actorUserId: user._id,
      actorRoleId: user.role,
      action: 'LOGIN_FAILED',
      targetType: 'User',
      targetId: String(user._id),
      metadata: { ip: context?.ip },
    });
    await anomalyService.recordEvent({
      type: 'LOGIN',
      success: false,
      userId: user._id,
      role: user.role,
      centerId: user.centerId || null,
      ip: context?.ip,
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
  await anomalyService.recordEvent({
    type: 'LOGIN',
    success: true,
    userId: user._id,
    role: user.role,
    centerId: user.centerId || null,
    ip: context?.ip,
  });

  return { user, ...tokens };
}

async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
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
