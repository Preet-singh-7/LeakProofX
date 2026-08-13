const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const { env } = require('./config/env');
const logger = require('./logs/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./auth/auth.routes');
const usersRoutes = require('./users/users.routes');
const papersRoutes = require('./papers/papers.routes');
const trackingRoutes = require('./tracking/tracking.routes');
const alertsRoutes = require('./alerts/alerts.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');

function buildApp() {
  const app = express();

  app.disable('x-powered-by'); // helmet also strips this; explicit for clarity
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser requests (no Origin header) and any
        // origin on the explicit allowlist. Never falls back to "*" — this
        // API always serves authenticated, credentialed requests.
        if (!origin || env.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(pinoHttp({ logger }));

  // Baseline IP rate limit on the whole API. Phase 2 (security/rate-limit.js)
  // adds stricter, route-specific limits for auth and decrypt/print, and a
  // path to Redis-backed distributed limiting for multi-instance deployment.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/users', usersRoutes);
  api.use('/papers', papersRoutes);
  api.use('/tracking', trackingRoutes);
  api.use('/alerts', alertsRoutes);
  api.use('/dashboard', dashboardRoutes);

  app.use(env.apiPrefix, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
