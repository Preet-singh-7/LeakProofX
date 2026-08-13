const { ApiError } = require('./errorHandler');

// Validates a Zod schema against req[part] and replaces it with the parsed
// (and thus type-coerced/stripped-of-unknown-fields, where schemas use .strict()) value.
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

module.exports = validate;
