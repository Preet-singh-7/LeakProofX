const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const ALGORITHM = 'HS256';

/**
 * Single source of truth for issuing and verifying LeakProofX's own JWTs
 * (access + refresh). Algorithm is pinned explicitly on every verify call —
 * jsonwebtoken only accepts algorithms present in this list, so a token
 * crafted with "alg": "none" or any other algorithm is rejected outright
 * regardless of what its header claims.
 *
 * Revocation model: tokenVersion, not a blacklist. Each User carries a
 * tokenVersion counter; every issued token embeds the version it was signed
 * under (`tv`). Logout/deactivation bump the counter, which invalidates
 * every outstanding access AND refresh token for that user in one write —
 * no need to track individual tokens. The trade-off (documented in the
 * Phase 2 write-up) is that this revokes ALL of a user's sessions at once,
 * not one specific stolen token; a per-token blacklist would need
 * TTL-matched storage (e.g. Redis) to avoid growing unbounded, which is
 * more infrastructure than an MVP needs given access tokens are already
 * short-lived (JWT_ACCESS_TTL, default 20m).
 */
function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion }, env.jwt.accessSecret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwt.accessTtl,
  });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion, type: 'refresh' }, env.jwt.refreshSecret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwt.refreshTtl,
  });
}

function issueTokenPair(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
}

/**
 * Throws (jsonwebtoken's JsonWebTokenError/TokenExpiredError) on any failure
 * — callers decide the HTTP shape. Also rejects a well-formed refresh token
 * outright (payload.type === 'refresh'): access and refresh tokens are
 * signed with different secrets so this never fires in a correctly
 * configured deployment, but if an operator ever sets JWT_ACCESS_SECRET and
 * JWT_REFRESH_SECRET to the same value, this stops a longer-lived (7d)
 * refresh token from also working as a 20m access token.
 */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwt.accessSecret, { algorithms: [ALGORITHM] });
  if (payload.type === 'refresh') {
    throw new Error('Refresh token presented where an access token was expected');
  }
  return payload;
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.jwt.refreshSecret, { algorithms: [ALGORITHM] });
  if (payload.type !== 'refresh') {
    throw new Error('Token is not a refresh token');
  }
  return payload;
}

module.exports = { ALGORITHM, signAccessToken, signRefreshToken, issueTokenPair, verifyAccessToken, verifyRefreshToken };
