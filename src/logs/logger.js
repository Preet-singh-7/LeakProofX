const pino = require('pino');
const { env } = require('../config/env');

const logger = pino({
  level: env.logLevel,
  // "security" sits between warn(40) and error(50): security-relevant
  // events (rejected tokens, CORS denials, rate-limit trips, fired anomaly
  // rules) are notable enough to always want visible at the default `info`
  // level, but aren't necessarily application errors. Filtering logs to
  // just this level is how an operator (or a log-shipping rule) isolates
  // "things a security review should look at" from general request noise.
  customLevels: { security: 45 },
  useOnlyCustomLevels: false,
  transport:
    env.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      '*.password',
      '*.passwordHash',
      '*.contentCipher',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
