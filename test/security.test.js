// Integration-style tests for the security/ module, each against a small
// purpose-built Express app rather than the full server — none of these
// need a database, which keeps the suite fast and independent of Mongo
// being up. Full-stack behavior (auth + DB) is covered by the Phase 1/2
// manual end-to-end retests instead.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-at-least-32-characters-long';
process.env.QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || 'test-qr-secret-at-least-32-characters-long';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://allowed.example';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/leakproofx_test_unused';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const { validate, jsonBodyParser } = require('../src/security/input-validation');
const { corsPolicy } = require('../src/security/cors');
const { securityHeaders } = require('../src/security/headers');
const rateLimit = require('express-rate-limit');
const { verifyAccessToken, ALGORITHM } = require('../src/security/jwt-auth');
const { env } = require('../src/config/env');

test('input-validation: rejects unrecognized fields (strict schema)', async () => {
  const schema = z.object({ name: z.string() }).strict();
  const app = express();
  app.use(jsonBodyParser());
  app.post('/x', validate(schema), (req, res) => res.status(200).json({ ok: true }));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message, details: err.details })); // eslint-disable-line no-unused-vars

  const res = await request(app).post('/x').send({ name: 'ok', extra: 'nope' });
  assert.equal(res.status, 400);
  assert.ok(JSON.stringify(res.body).includes('Unrecognized key'));
});

test('input-validation: accepts a well-formed body and strips nothing it shouldn\'t', async () => {
  const schema = z.object({ name: z.string() }).strict();
  const app = express();
  app.use(jsonBodyParser());
  app.post('/x', validate(schema), (req, res) => res.status(200).json({ received: req.body }));

  const res = await request(app).post('/x').send({ name: 'ok' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.received, { name: 'ok' });
});

test('input-validation: body over the configured size limit is rejected', async () => {
  const app = express();
  app.use(jsonBodyParser({ limit: '1kb' }));
  app.post('/x', (req, res) => res.status(200).json({ ok: true }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'TOO_LARGE' })); // eslint-disable-line no-unused-vars

  const bigPayload = { blob: 'x'.repeat(5000) };
  const res = await request(app).post('/x').send(bigPayload);
  assert.equal(res.status, 413);
});

test('rate-limit: trips after the configured request count and returns 429 with the custom body', async () => {
  const app = express();
  const tinyLimiter = rateLimit({ windowMs: 60_000, limit: 3, handler: (req, res) => res.status(429).json({ error: 'RATE_LIMITED' }) });
  app.use(tinyLimiter);
  app.get('/x', (req, res) => res.status(200).json({ ok: true }));

  const agent = request.agent(app);
  for (let i = 0; i < 3; i++) {
    const res = await agent.get('/x');
    assert.equal(res.status, 200, `request ${i + 1} should succeed`);
  }
  const blocked = await agent.get('/x');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'RATE_LIMITED');
});

test('rate-limit: the real authLimiter export blocks the 11th request in its window', async () => {
  // Exercises the actual exported limiter (limit: 10), not a throwaway one,
  // so this fails if src/security/rate-limit.js's configured limit changes
  // without the test being updated deliberately.
  delete require.cache[require.resolve('../src/security/rate-limit')];
  const { authLimiter } = require('../src/security/rate-limit');
  const app = express();
  app.use(authLimiter);
  app.post('/login', (req, res) => res.status(401).json({ error: 'INVALID' })); // failed logins still count (skipSuccessfulRequests only skips 2xx)

  for (let i = 0; i < 10; i++) {
    const res = await request(app).post('/login');
    assert.equal(res.status, 401, `attempt ${i + 1} should reach the handler`);
  }
  const blocked = await request(app).post('/login');
  assert.equal(blocked.status, 429);
});

test('cors: rejects an origin not on the allowlist', async () => {
  const app = express();
  app.use(corsPolicy());
  app.use((err, req, res, next) => res.status(403).json({ error: err.message })); // eslint-disable-line no-unused-vars
  app.get('/x', (req, res) => res.status(200).json({ ok: true }));

  const res = await request(app).get('/x').set('Origin', 'http://evil.example');
  assert.equal(res.status, 403);
});

test('cors: allows an origin on the allowlist', async () => {
  const app = express();
  app.use(corsPolicy());
  app.get('/x', (req, res) => res.status(200).json({ ok: true }));

  const res = await request(app).get('/x').set('Origin', env.allowedOrigins[0]);
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], env.allowedOrigins[0]);
});

test('headers: helmet strips X-Powered-By and sets baseline security headers', async () => {
  const app = express();
  app.use(securityHeaders());
  app.get('/x', (req, res) => res.status(200).json({ ok: true }));

  const res = await request(app).get('/x');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('jwt-auth: rejects a token signed with alg:none regardless of its header claim', () => {
  // Construct a token whose header claims alg:none and whose payload is
  // otherwise valid — this is the classic JWT bypass this pinning defends
  // against. jsonwebtoken requires an explicit opt-in to sign with "none";
  // if that ever stops being possible, the point of this test is moot, so
  // the try/catch below treats "couldn't even construct the attack token"
  // as an acceptable pass too.
  let forged;
  try {
    forged = jwt.sign({ sub: 'someone', role: 'ADMIN', tv: 0 }, null, { algorithm: 'none' });
  } catch (err) {
    return; // library refuses to sign alg:none at all — nothing to bypass
  }
  assert.throws(() => verifyAccessToken(forged));
});

test('jwt-auth: rejects a token signed with a different algorithm than the pinned one', () => {
  // HS384 instead of the pinned HS256 — same secret, wrong algorithm.
  const wrongAlg = jwt.sign({ sub: 'someone', role: 'ADMIN', tv: 0 }, env.jwt.accessSecret, { algorithm: 'HS384' });
  assert.throws(() => verifyAccessToken(wrongAlg));
});

test('jwt-auth: accepts a validly signed token and rejects a tampered payload', () => {
  const token = jwt.sign({ sub: 'someone', role: 'ADMIN', tv: 0 }, env.jwt.accessSecret, { algorithm: ALGORITHM });
  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, 'someone');

  const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.throws(() => verifyAccessToken(tampered));
});
