const logger = require('../logs/logger');

class ApiError extends Error {
  constructor(statusCode, message, details = undefined, code = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    // Machine-readable failure reason (e.g. 'TIME_WINDOW', 'UNEXPECTED_ROLE') —
    // distinct from the HTTP-response `error` field convention already in
    // errorHandler below. Consumed by the anomaly engine so rule conditions
    // don't have to pattern-match human-readable messages.
    this.failureCode = code;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'unhandled error');
  } else {
    logger.warn({ errMessage: err.message, path: req.originalUrl, method: req.method }, 'request error');
  }

  const body = {
    error: err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  };
  if (err.details) body.details = err.details;

  res.status(statusCode).json(body);
}

module.exports = { ApiError, notFoundHandler, errorHandler };
