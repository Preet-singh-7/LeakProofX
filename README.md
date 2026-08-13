# LeakProofX — Backend (Phase 1 + Phase 2)

LeakProofX is an exam paper custody, encryption, and leak-prevention platform.
This backend now covers Phase 1 (auth, encryption, custody tracking, QR
generation, time-locked access, tamper-evident audit log) and Phase 2
(hardened security module + rule-based anomaly/alert engine). Frontend
dashboard and mobile scanner app land in Phases 3–4.

## Stack

Node.js (LTS) + Express, MongoDB + Mongoose, JWT auth, AES-256-GCM content
encryption, SHA-256 hash-chained audit log, Zod validation, Helmet + CORS,
express-rate-limit, pino structured logging (with a custom `security` level).

## Project layout

```
src/
  auth/          register/login/refresh/logout, JWT issuance
  users/         admin-gated user management
  papers/        paper CRUD, encryption, QR issuance, time-locked decrypt/print,
                 custody state machine (custody.js)
  tracking/      custody scan events, per-paper timeline
  encryption/    AES-256-GCM encrypt/decrypt, key manager, startup key bookkeeping
  alerts/        Alert model + list/filter/acknowledge/resolve API
  anomaly/       rule-based risk engine (rules, config, evaluateEvent, anomaly.service)
  logs/          pino logger, hash-chained audit log service
  dashboard/     summary metrics endpoint
  security/      jwt-auth, rate-limit, input-validation, headers, cors
  middleware/    auth guards, error handling, async wrapper
  models/        Mongoose schemas for all core entities
  config/        env loading, constants, db connection
scripts/
  seedAdmin.js       creates the first ADMIN user
  verifyHashChain.js recomputes and verifies the audit log hash chain
  rotateKey.js       records a paper-encryption key rotation (see "Key rotation")
test/
  anomaly.test.js    unit tests for every anomaly rule
  security.test.js   integration tests for rate-limit/CORS/validation/JWT controls
```

## Setup

1. Copy the env template and fill in real secrets (never commit `.env`):

   ```bash
   cp .env.example .env
   ```

   At minimum set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `QR_SIGNING_SECRET`, and a base64-encoded 32-byte AES key for
   `PAPER_ENC_KEY_v1`. Generate one with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   In `development`, missing JWT/QR secrets fall back to an ephemeral
   in-process random secret (logged as a warning) so the server still boots —
   this fallback is refused in `production` (`assertProductionSecrets` in
   `src/config/env.js` throws on startup instead).

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run MongoDB + the app with Docker:

   ```bash
   docker compose up --build
   ```

   Or run against a local MongoDB (`mongod` on `27017` by default):

   ```bash
   npm run dev
   ```

4. Seed the first admin user (reads `SEED_ADMIN_*` from `.env`):

   ```bash
   npm run seed:admin
   ```

5. Verify the audit hash chain at any time:

   ```bash
   npm run verify:chain
   ```

6. Run the automated test suite (no DB required):

   ```bash
   npm test
   ```

## Environment variables

See [.env.example](.env.example) for the full list with inline comments:
server/DB config, JWT secrets and TTLs, QR signing secret, per-key-id
encryption keys (`PAPER_ENC_KEY_<keyId>`) plus `ACTIVE_PAPER_KEY_ID`,
time-lock pre/post windows, allowed CORS origins, and seed-admin credentials.

## API

All routes are mounted under `/api/v1`. Auth uses `Authorization: Bearer
<accessToken>`. Roles: `ADMIN`, `BOARD`, `COURIER`, `CENTER`, `INVIGILATOR`,
`AUDITOR`.

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `POST /auth/register` (ADMIN only — no public signup)
- `GET/POST /users` (ADMIN only)
- `POST /papers` (BOARD/ADMIN) — encrypts content, issues a signed QR token
- `GET /papers`, `GET /papers/:id`, `GET /papers/:id/qr`
- `POST /papers/:id/decrypt`, `POST /papers/:id/print` (INVIGILATOR/ADMIN,
  time-locked, rate-limited — see below)
- `POST /tracking/scan` — records a custody transition against a paper's QR
  token; rejects out-of-order/skipped/wrong-role/too-early transitions but
  still logs the attempt
- `GET /tracking/:id` — custody timeline for a paper
- `GET /alerts`, `GET /alerts/:id` — list/filter (`status`, `severity`, `paperId`)
- `POST /alerts/:id/acknowledge`, `POST /alerts/:id/resolve` (ADMIN/BOARD/AUDITOR)
- `GET /dashboard/summary`

## Custody state machine

```
CREATED → HANDOVER_TO_COURIER → ARRIVED_AT_CENTER → STORED_IN_VAULT
        → HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM → COMPLETED
```

Each transition is gated to specific roles (see `src/papers/custody.js`).
Skipped, reordered, or wrong-role transitions are rejected (409) but still
written to `TrackingLog` (`accepted: false`) and to the audit log. The
`HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM` transition additionally enforces
`now >= examTime` **regardless of which endpoint performs it** — both
`/tracking/scan` and `/papers/:id/decrypt` share this check (see "Fixed in
Phase 2" below).

## Time-lock

`POST /papers/:id/decrypt` and `POST /papers/:id/print` enforce, independently:

1. A window around `examTime`: `now` must be within
   `[examTime - ALLOWED_PRE_WINDOW_MINUTES, examTime + ALLOWED_POST_WINDOW_MINUTES]`.
2. If the paper is still at `HANDOVER_TO_EXAM_HALL`, the stricter rule from
   the spec: `now >= examTime` exactly (no early opening even inside the
   pre-window) before it will auto-transition the paper to `OPENED_FOR_EXAM`.
3. Role authorization (`INVIGILATOR` or `ADMIN`).
4. Custody state — must be `HANDOVER_TO_EXAM_HALL` or already `OPENED_FOR_EXAM`.

Every attempt — success or denial — is written to the audit log and scored
by the anomaly engine.

## Security module (`src/security/`)

- **`jwt-auth.js`** — single source of truth for signing/verifying access
  and refresh tokens. Algorithm pinned to HS256 on every verify call (an
  `alg: none` or wrong-algorithm token is rejected outright). Revocation is
  by `tokenVersion`, not a blacklist — logout/deactivation bump a counter
  that invalidates every outstanding token for that user at once.
- **`rate-limit.js`** — baseline global limiter (300 req/15min/IP) plus
  route-specific limiters: `authLimiter` (10/15min on `/auth/login` and
  ADMIN-gated `/auth/register`), `sensitiveActionLimiter` (20/15min on
  `/papers/:id/decrypt` and `/print`), `adminLimiter` (60/15min on
  `/users/*`). All in-memory; the file documents the exact swap to a
  Redis-backed store for multi-instance deployment.
- **`input-validation.js`** — the Zod `validate()` middleware (every schema
  uses `.strict()`, rejecting unrecognized fields) plus `jsonBodyParser()`.
  Body size limits are per-router: 10kb everywhere except the papers router
  (2mb, since paper content itself lives in that body — see "Fixed in Phase
  2": a single global 10kb limit in Phase 1 would have silently rejected
  real paper uploads).
- **`headers.js`** — Helmet with its default security headers.
- **`cors.js`** — explicit origin allowlist (`ALLOWED_ORIGINS`), never `*`,
  `credentials: true`.
- **Key rotation** — see below.
- **Logging** — `logs/logger.js` adds a custom `security` pino level
  (between `warn` and `error`) used for rejected tokens, CORS denials,
  rate-limit trips, role-authorization failures, and fired anomaly alerts.
  Passwords, tokens, and ciphertext are redacted from all logs.

## Key rotation

1. Generate a new 32-byte key and set it in env: `PAPER_ENC_KEY_v2=<base64>`.
2. Record the rotation (retires the previously-ACTIVE `KeyVersion`, creates
   the new one, writes a `KEY_ROTATED` audit log entry):

   ```bash
   npm run rotate:key -- v2
   ```

3. Set `ACTIVE_PAPER_KEY_ID=v2` and restart the app so **new** papers encrypt
   under the new key.
4. Keep `PAPER_ENC_KEY_v1` configured indefinitely — papers already encrypted
   under it store `keyId: "v1"` and need that key to decrypt. Nothing
   re-encrypts old papers automatically.

On first boot, `ensureActiveKeyVersion()` registers a `KeyVersion` for
whatever `ACTIVE_PAPER_KEY_ID` is already set to, so rotation history starts
from a real record instead of a gap.

## Anomaly / risk engine (`src/anomaly/`)

`evaluateEvent(event, context)` (pure, unit-tested in `test/anomaly.test.js`)
runs every rule's `condition(event, context)`, sums the weights of whichever
fired, and classifies the total: **≥3 → WARNING**, **≥6 → CRITICAL**
(`src/anomaly/config.js` — tunable without touching rule logic). Rules:

| Rule | Weight | Fires when |
|---|---|---|
| `R_TIME_WINDOW` | 4 | Decrypt/print denied for being outside the examTime access window |
| `R_FAILED_DECRYPT` | 3 | ≥2 failed decrypt/print attempts by the same actor on the same paper in 15 min |
| `R_SKIP_STEP` | 5 | A custody scan skips/reorders the state machine |
| `R_UNEXPECTED_ROLE` | 4 | A scan/decrypt/print attempted by a role not authorized for that step |
| `R_LOCATION_MISMATCH` | 3 | Scan location doesn't match any of the paper's assigned centers |
| `R_TOO_EARLY_SCAN` | 5 | A scan attempts `OPENED_FOR_EXAM` before `examTime` |
| `R_REPEATED_LOGIN_FAILURE` | 3 | ≥3 failed logins for the same account in 15 min — added beyond the spec's six, since none of the required six ever fire on a `LOGIN` event |

`anomaly.service.js` (`recordEvent`) is the actual entry point called from
`auth.service.login`, `papers.service.accessPaperContent`, and
`tracking.service.recordScan` — it assembles DB-backed `context` (recent
failure counts, expected locations), calls the pure engine, and persists an
`Alert` when the score crosses WARNING. It fails open: an anomaly-evaluation
bug never blocks the request it's observing, since the actual allow/deny
decision (role/time-lock/custody checks) already happened before this runs.

CRITICAL alerts are logged at the `security` level as "notify higher
authority" — see Known Limitations below for what that doesn't yet do.

## Audit log

Append-only, hash-chained: each entry's `currentHash = SHA256(prevHash +
payload + timestamp)`. Writes are serialized by an in-process mutex to
prevent the chain forking under concurrent requests within one server
instance. `npm run verify:chain` recomputes the whole chain from genesis and
reports the first break, if any.

## Fixed in Phase 2 (real issues found while building this phase, not just planned hardening)

- **Custody-scan time-lock bypass**: `POST /tracking/scan` could previously
  advance a paper straight to `OPENED_FOR_EXAM` before `examTime` — only the
  `/decrypt` endpoint enforced the time floor. Fixed in
  `tracking.service.js` to apply the same `assertExamTimeReached` check.
- **Paper-content body-size bug**: Phase 1's single global 10kb JSON body
  limit would have rejected any real paper submission over 10kb, despite
  `papers.validation.js` allowing content up to 2MB. Fixed by moving body
  limits to per-router configuration (`security/input-validation.js`).
- **Audit hash-chain false break**: Mongoose's default `minimize: true`
  stripped empty `metadata: {}` objects before saving, so entries like
  `LOGOUT` (empty metadata) diverged from what was hashed at write time —
  `verifyHashChain.js` reported a false tamper break. Fixed by setting
  `minimize: false` on `AuditLog`'s schema.

## Testing the flow manually

```bash
# 1. seed admin, login, register a BOARD/COURIER/CENTER/INVIGILATOR user each
# 2. as BOARD: POST /papers with content + examTime
# 3. as BOARD/COURIER/CENTER: POST /tracking/scan through each custody step
#    using the qrToken returned on the paper
# 4. as INVIGILATOR, at/after examTime: POST /papers/:id/decrypt
# 5. GET /alerts to see anything the anomaly engine flagged along the way
# 6. npm run verify:chain
```

## Known limitations

- **No paging/notification integration**: CRITICAL alerts are logged at the
  `security` level ("notify higher authority" per the spec) but nothing
  pages, emails, or SMSes anyone yet — that integration point is deferred.
- **Token revocation is per-user, not per-token**: `tokenVersion` revokes
  every session for a user at once; a stolen single token can't be revoked
  in isolation without also logging out that user's other sessions. A
  blacklist would need TTL-matched storage (Redis) to avoid growing
  unbounded — more infrastructure than this MVP's short-lived (20min)
  access tokens need yet.
- **Rate limiting is in-memory, single-instance**: documented swap to a
  Redis-backed store (`rate-limit-redis`) for horizontal scaling, not
  implemented — no Redis dependency added for this MVP.
- **Alert.centerId is best-effort**: derived from the acting user's own
  center or the paper's first assigned center, not a guaranteed-accurate
  "this happened at this center" fact — a paper can be assigned to multiple
  centers. Good enough for CENTER-role alert-list filtering; not
  authoritative for anything downstream.
- **Anomaly config is file-based, not DB-backed**: rule weights/thresholds
  live in `src/anomaly/config.js` — tunable without touching rule logic, but
  still requires an edit + redeploy, not a live admin-panel toggle.
- **Audit hash-chain write serialization is in-process only** — a
  multi-instance deployment can still fork the chain under concurrent
  writes across instances. This is a hash chain, not a blockchain: it
  detects tampering but has no independent distributed consensus.
- **`examTime` checks are server-clock based**, not a cryptographic
  time-lock puzzle — flagged as future work (TLPs / HSM-backed release) in
  later phases.
