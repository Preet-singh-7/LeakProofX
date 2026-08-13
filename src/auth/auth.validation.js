const { z } = require('zod');
const { ROLE_VALUES } = require('../config/constants');

const registerSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    password: z.string().min(8).max(200),
    role: z.enum(ROLE_VALUES),
    centerId: z.string().length(24).optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

module.exports = { registerSchema, loginSchema, refreshSchema };
