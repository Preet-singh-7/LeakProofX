# LeakProofX

An exam-paper custody, encryption, and leak-prevention platform, built in
five phases: a Node/Express backend (Phases 1–2), a React dashboard
(`web/`, Phase 3), a React Native/Expo scanner app (`mobile/`, Phase 4),
and this final consolidation/hardening pass (Phase 5).

The idea in one sentence: a paper is encrypted the moment it's created,
carries a signed QR code through a fixed, role-gated custody chain from
board to courier to exam center to invigilator, every step (accepted or
rejected) is written to a tamper-evident audit trail, and an anomaly
engine scores anything that looks wrong along the way.

## Where things are documented

This README covers running the backend. Deeper documentation lives in
`docs/`:

| Doc | What's in it |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | The three components, how they fit together, the data model |
| [`docs/api.md`](docs/api.md) | Every endpoint — method, role gate, request/response shape |
| [`docs/flow.md`](docs/flow.md) | How auth, custody transitions, anomaly scoring, and mobile offline sync actually work end to end |
| [`docs/security.md`](docs/security.md) | The full security model, including Phase 5's hardening fixes |
| [`docs/demo-script.md`](docs/demo-script.md) | A runnable, live-verified 5-minute walkthrough of the whole system |

Component-specific setup: [`web/README.md`](web/README.md),
[`mobile/README.md`](mobile/README.md). Phase-by-phase build history (what
was built, why, and every real bug found and fixed along the way):
[`outputs/`](outputs/) (Word docs, Phases 1–4).

## Repo layout

```
src/, scripts/, test/   backend (this README)
web/                    React dashboard — see web/README.md
mobile/                 React Native/Expo scanner app — see mobile/README.md
docs/                   architecture / api / flow / security / demo script
outputs/                Phase N Word documentation
```

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
  seedAdmin.js       creates the first ADMIN user (refuses a default password in production — see docs/security.md)
  verifyHashChain.js recomputes and verifies the audit log hash chain (--json, --help — see below)
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

   In production, this now refuses to run unless `SEED_ADMIN_PASSWORD` is
   explicitly set — see [`docs/security.md`](docs/security.md#seeding-the-first-admin).

5. Verify the audit hash chain at any time:

   ```bash
   npm run verify:chain           # human-readable
   node scripts/verifyHashChain.js --json   # machine-readable, for CI
   node scripts/verifyHashChain.js --help
   ```

6. Run the automated test suite (no DB required):

   ```bash
   npm test
   ```

7. Walk through the whole system live — custody chain, a deliberate
   rejection, the alert it raises, time-locked decrypt, hash-chain
   verification:

   ```bash
   # see docs/demo-script.md for the full, copy-pasteable script
   ```

## Environment variables

See [.env.example](.env.example) for the full list with inline comments:
server/DB config, JWT secrets and TTLs, QR signing secret, per-key-id
encryption keys (`PAPER_ENC_KEY_<keyId>`) plus `ACTIVE_PAPER_KEY_ID`,
time-lock pre/post windows, allowed CORS origins, and seed-admin credentials.

## API, roles, and the custody chain

Full reference: [`docs/api.md`](docs/api.md). Quick orientation:

- All routes under `/api/v1`; auth via `Authorization: Bearer <accessToken>`.
- Roles: `ADMIN`, `BOARD`, `COURIER`, `CENTER`, `INVIGILATOR`, `AUDITOR` —
  what each is for: [`docs/security.md#roles`](docs/security.md#roles).
- Custody moves one step at a time, each gated to specific roles
  (`src/papers/custody.js`):

  ```
  CREATED → HANDOVER_TO_COURIER → ARRIVED_AT_CENTER → STORED_IN_VAULT
          → HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM → COMPLETED
  ```

  Skipped, reordered, or wrong-role transitions are rejected (409) but
  still written to `TrackingLog` and the audit log — full mechanics in
  [`docs/flow.md#custody-scan--transition`](docs/flow.md#custody-scan--transition).

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

## Security, anomaly detection, and the audit log

Full detail (roles, encryption, rate limiting, the audit hash chain,
Phase 5's hardening fixes, and every known limitation carried forward from
Phases 1–4): [`docs/security.md`](docs/security.md). How the anomaly
engine actually scores events and how the hash chain is verified:
[`docs/flow.md`](docs/flow.md) and [`docs/security.md`](docs/security.md#audit-log).

## Build history

Each phase's Word doc (`outputs/`) documents what was built, why, the
reasoning behind significant decisions, and every real bug found and fixed
while building it — not just a changelog. Phase 5's fixes (a login timing
side-channel, a refresh/access token confusion hardening, and a
production-seeding guard) are documented in
[`docs/security.md`](docs/security.md#this-phases-hardening-fixes) since
they're security fixes, not new features.

## Known limitations

The consolidated, current list lives in
[`docs/security.md#known-limitations-carried-forward`](docs/security.md#known-limitations-carried-forward)
so it has one source of truth instead of drifting across four separate
READMEs.
