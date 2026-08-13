const express = require('express');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Validates a Zod schema against req[part] and replaces it with the parsed
 * value. Every schema in this codebase that validates a request body uses
 * Zod's `.strict()`, so this also enforces "reject unexpected fields" —
 * that's a property of the schemas, not of this function, but it's worth
 * noting here since it's exactly the "reject unexpected fields" control the
 * Phase 2 spec calls for.
 */
function validate(schema, part = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(new ApiError(400, 'Validation failed', result.error.flatten()));
    }
    req[part] = result.data;
    next();
  };
}

/**
 * 10kb is generous for every JSON body in this API (auth payloads, paper
 * metadata, scan events) — the one exception is paper content itself, which
 * can legitimately be large (papers.validation.js caps it at 2MB at the
 * schema level, independent of this transport-level limit). Keeping this
 * limit at the Express body-parser layer means an oversized payload is
 * rejected before it reaches any route handler or validation schema.
 */
function jsonBodyParser({ limit = '10kb' } = {}) {
  return express.json({ limit });
}

module.exports = { validate, jsonBodyParser };
