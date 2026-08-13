# LeakProofX — Backend (Phase 1: Core Backend Foundation)

LeakProofX is an exam paper custody, encryption, and leak-prevention platform.
This is the Phase 1 backend: auth, encryption, custody tracking, QR
generation, time-locked access, and a tamper-evident audit log. The
anomaly/risk engine and hardened security module land in Phase 2.

## Stack

Node.js (LTS) + Express, MongoDB + Mongoose, JWT auth, AES-256-GCM content
encryption, SHA-256 hash-chained audit log, Zod validation, Helmet + CORS,
express-rate-limit, pino structured logging.

## Project layout

```
src/
  auth/          register/login/refresh/logout, JWT issuance
  users/         admin-gated user management
  papers/        paper CRUD, encryption, QR issuance, time-locked decrypt/print,
                 custody state machine (custody.js)
  tracking/      custody scan events, per-paper timeline
  encryption/    AES-256-GCM encrypt/decrypt, key manager
  alerts/        Alert model + read-only listing (rule engine is Phase 2)
  anomaly/       reserved for Phase 2 risk engine
  logs/          pino logger, hash-chained audit log service
  dashboard/     summary metrics endpoint
  security/      reserved for Phase 2 hardened security module
  middleware/    auth guards, validation, error handling
  models/        Mongoose schemas for all core entities
  config/        env loading, constants, db connection
scripts/
  seedAdmin.js       creates the first ADMIN user
  verifyHashChain.js recomputes and verifies the audit log hash chain
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
  time-locked — see below)
- `POST /tracking/scan` — records a custody transition against a paper's QR
  token; rejects out-of-order/skipped/wrong-role transitions but still logs
  the attempt
- `GET /tracking/:id` — custody timeline for a paper
- `GET /alerts` (read-only in Phase 1)
- `GET /dashboard/summary`

## Custody state machine

```
CREATED → HANDOVER_TO_COURIER → ARRIVED_AT_CENTER → STORED_IN_VAULT
        → HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM → COMPLETED
```

Each transition is gated to specific roles (see `src/papers/custody.js`).
Skipped, reordered, or wrong-role transitions are rejected (409) but still
written to `TrackingLog` (`accepted: false`) and to the audit log — this is
deliberate: a rejected scan is a security signal, not noise to discard, and
Phase 2's anomaly engine will read exactly these records.

## Time-lock

`POST /papers/:id/decrypt` and `POST /papers/:id/print` enforce, independently:

1. A window around `examTime`: `now` must be within
   `[examTime - ALLOWED_PRE_WINDOW_MINUTES, examTime + ALLOWED_POST_WINDOW_MINUTES]`.
2. If the paper is still at `HANDOVER_TO_EXAM_HALL`, the stricter rule from
   the spec: `now >= examTime` exactly (no early opening even inside the
   pre-window) before it will auto-transition the paper to `OPENED_FOR_EXAM`.
3. Role authorization (`INVIGILATOR` or `ADMIN`).
4. Custody state — must be `HANDOVER_TO_EXAM_HALL` or already `OPENED_FOR_EXAM`.

Every attempt — success or denial — is written to the audit log.

## Audit log

Append-only, hash-chained: each entry's `currentHash = SHA256(prevHash +
payload + timestamp)`. Writes are serialized by an in-process mutex to
prevent the chain forking under concurrent requests within one server
instance (see "Known limitations" in the Phase 1 documentation for what this
does not cover). `npm run verify:chain` recomputes the whole chain from
genesis and reports the first break, if any.

## Testing the flow manually

```bash
# 1. seed admin, login, register a BOARD/COURIER/CENTER/INVIGILATOR user each
# 2. as BOARD: POST /papers with content + examTime
# 3. as BOARD/COURIER/CENTER: POST /tracking/scan through each custody step
#    using the qrToken returned on the paper
# 4. as INVIGILATOR, at/after examTime: POST /papers/:id/decrypt
# 5. npm run verify:chain
```

## Known limitations (Phase 1)

- No anomaly/risk scoring yet — `Alert` is read-only. Built in Phase 2.
- `security/` module (hardened rate limits, input validation helpers,
  dedicated headers/CORS config, key rotation tooling) is a Phase 2
  deliverable; Phase 1 wires Helmet/CORS/rate-limit at baseline defaults
  directly in `src/app.js`.
- Audit hash-chain write serialization is in-process only — a
  multi-instance deployment can still fork the chain under concurrent
  writes across instances. Production hardening would need a DB-level
  transaction/lock (e.g. Mongo replica-set transactions) or a single
  writer service.
- This is a hash chain, not a blockchain: it detects tampering but has no
  independent distributed consensus. Explicitly out of scope for this MVP.
- `examTime - allowedPreWindow` is a server-clock check, not a cryptographic
  time-lock puzzle — a server with a manipulated clock could theoretically
  bypass it. Acceptable for MVP; flagged as future work (TLPs / HSM-backed
  release) in later phases.
