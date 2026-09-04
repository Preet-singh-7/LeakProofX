const express = require('express');
const pinoHttp = require('pino-http');

const { env } = require('./config/env');
const logger = require('./logs/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { securityHeaders } = require('./security/headers');
const { corsPolicy } = require('./security/cors');
const { jsonBodyParser } = require('./security/input-validation');
const { globalLimiter } = require('./security/rate-limit');

const authRoutes = require('./auth/auth.routes');
const usersRoutes = require('./users/users.routes');
const papersRoutes = require('./papers/papers.routes');
const questionsRoutes = require('./questions/questions.routes');
const trackingRoutes = require('./tracking/tracking.routes');
const alertsRoutes = require('./alerts/alerts.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');
const verificationRoutes = require('./verification/verification.routes');

function buildApp() {
  const app = express();

  app.disable('x-powered-by'); // helmet also strips this; explicit for clarity
  app.set('trust proxy', 1);

  app.use(securityHeaders());
  app.use(corsPolicy());
  app.use(pinoHttp({ logger }));
  app.use(globalLimiter);

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  // No blanket body-size limit here: paper content can legitimately be up to
  // 2MB (see papers.validation.js), while every other endpoint's payload is
  // metadata-sized. Each router applies the body limit appropriate to what
  // it actually accepts (src/security/input-validation.js jsonBodyParser),
  // rather than one global limit that would either reject real paper
  // uploads or leave every other endpoint needlessly permissive.
  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/users', usersRoutes);
  api.use('/papers', papersRoutes);
  api.use('/questions', questionsRoutes);
  api.use('/tracking', trackingRoutes);
  api.use('/alerts', alertsRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/verification-evidence', verificationRoutes);

  app.use(env.apiPrefix, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
