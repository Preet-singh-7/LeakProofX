require('dotenv').config();
const crypto = require('crypto');

function devFallbackSecret(label) {
  // eslint-disable-next-line no-console
  console.warn(`[env] ${label} not set — generating an ephemeral secret for this process only. Set it explicitly outside development.`);
  return crypto.randomBytes(48).toString('hex');
}

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseKeyMap(prefix) {
  const keys = {};
  for (const [envKey, value] of Object.entries(process.env)) {
    if (envKey.startsWith(prefix)) {
      const keyId = envKey.slice(prefix.length);
      keys[keyId] = value;
    }
  }
  return keys;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/leakproofx'),

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL || '20m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },

  qrSigningSecret: process.env.QR_SIGNING_SECRET,

  paperEncKeys: parseKeyMap('PAPER_ENC_KEY_'),
  activePaperKeyId: process.env.ACTIVE_PAPER_KEY_ID || 'v1',

  timeLock: {
    allowedPreWindowMinutes: parseInt(process.env.ALLOWED_PRE_WINDOW_MINUTES || '30', 10),
    allowedPostWindowMinutes: parseInt(process.env.ALLOWED_POST_WINDOW_MINUTES || '180', 10),
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@leakproofx.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
    name: process.env.SEED_ADMIN_NAME || 'System Admin',
  },

  logLevel: process.env.LOG_LEVEL || 'info',
};

function assertProductionSecrets() {
  if (env.nodeEnv === 'production') {
    const missing = [];
    if (!env.jwt.accessSecret) missing.push('JWT_ACCESS_SECRET');
    if (!env.jwt.refreshSecret) missing.push('JWT_REFRESH_SECRET');
    if (!env.qrSigningSecret) missing.push('QR_SIGNING_SECRET');
    if (Object.keys(env.paperEncKeys).length === 0) missing.push('PAPER_ENC_KEY_<id>');
    if (missing.length) {
      throw new Error(`Missing required secrets in production: ${missing.join(', ')}`);
    }
  }
}

module.exports = { env, assertProductionSecrets };
