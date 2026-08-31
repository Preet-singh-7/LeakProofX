# LeakProofX

[![CI](https://github.com/Preet-singh-7/LeakProofX/actions/workflows/ci.yml/badge.svg)](https://github.com/Preet-singh-7/LeakProofX/actions/workflows/ci.yml)

An exam-paper custody, encryption, and leak-prevention platform: a
Node/Express backend, a React web dashboard, and a React Native mobile
scanner app, sharing one authoritative API.

The idea in one sentence: a paper is encrypted the moment it's created,
carries a signed QR code through a fixed, role-gated custody chain from
board to courier to exam center to invigilator, every step (accepted or
rejected) is written to a tamper-evident audit trail, and a rule-based
anomaly engine scores anything that looks wrong along the way.

This file is the whole project's front door. Each component also has its
own README with the detail specific to it — this one is where you start.

## The three components

| | What it is | Who uses it | Setup |
|---|---|---|---|
| **Backend** (`src/`) | Node/Express API — auth, encryption, custody state machine, anomaly engine, audit log | Everything below talks to this | [Backend setup](#backend-setup) |
| **Web dashboard** (`web/`) | React + Vite + Tailwind | Admins, board officers, auditors, center staff — monitoring and administration | [`web/README.md`](web/README.md) |
| **Mobile scanner** (`mobile/`) | React Native (Expo), iOS-verified on physical hardware | Couriers, center staff, invigilators — the people physically handling the paper | [`mobile/README.md`](mobile/README.md) |

All three share one backend, one auth contract (JWT access + refresh
tokens), and one source of truth for what's actually allowed to happen to
a paper — neither client has its own copy of the custody-authorization
rules; they just show you what the server decided. See
[`docs/architecture.md`](docs/architecture.md) for how the pieces connect.

## Repo layout

```
src/, scripts/, test/   backend — this README's "Backend setup" section
web/                    React dashboard — web/README.md
mobile/                 React Native/Expo scanner app — mobile/README.md
docs/                   architecture / api / flow / security / security-testing / demo-script
outputs/                Phase-by-phase build history (Word docs)
.github/workflows/      CI — runs on every push/PR to main
```

## Documentation map

| Doc | What's in it |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | The three components, how they fit together, the data model |
| [`docs/api.md`](docs/api.md) | Every endpoint — method, role gate, request/response shape |
| [`docs/flow.md`](docs/flow.md) | How auth, custody transitions, anomaly scoring, and mobile offline sync actually work end to end |
| [`docs/security.md`](docs/security.md) | The full security model, including every hardening fix made and how it was verified |
| [`docs/security-testing.md`](docs/security-testing.md) | An adversarial testing pass — real attacks run against the running system, with results confirmed against database state |
| [`docs/demo-script.md`](docs/demo-script.md) | A runnable, live-verified 5-minute walkthrough of the whole system |
| [`outputs/`](outputs/) | Phase 1–4 Word docs: what was built, why, and every real bug found and fixed along the way |

## Quickstart — running all three together

```bash
# 1. Backend
cp .env.example .env   # fill in secrets, see "Backend setup" below
npm install
npm run seed:admin
npm run dev             # http://localhost:4007

# 2. Web dashboard (separate terminal)
cd web
cp .env.example .env    # point VITE_API_BASE_URL at the backend above
npm install
npm run dev              # http://localhost:5173

# 3. Mobile scanner (separate terminal) — needs a real device or Simulator + Xcode
cd mobile
cp .env.example .env     # point EXPO_PUBLIC_API_BASE_URL at the backend
npm install
npx expo run:ios
```

Log in with whatever you seeded (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`,
defaults `admin@leakproofx.local` / `ChangeMe123!` in development). For a
guided tour instead of poking around cold, run
[`docs/demo-script.md`](docs/demo-script.md) — it walks a paper through
the whole custody chain, triggers a deliberate rejection, and verifies the
audit trail, using nothing but `curl`.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: the full test
suite (`npm test`, no database needed), then a real MongoDB service
container seeded with one genuine audit entry (`npm run seed:admin`) so
the hash-chain verifier (`node scripts/verifyHashChain.js --json`)
exercises actual chain recomputation rather than trivially passing on an
empty database — see the comment in the workflow file for the full
reasoning.

## Backend setup

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

   In production, this refuses to run unless `SEED_ADMIN_PASSWORD` is
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

### Backend project layout

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
  seedAdmin.js       creates the first ADMIN user (refuses a default password in production)
  verifyHashChain.js recomputes and verifies the audit log hash chain (--json, --help)
  rotateKey.js       records a paper-encryption key rotation (see "Key rotation")
test/
  anomaly.test.js    unit tests for every anomaly rule
  security.test.js   integration tests for rate-limit/CORS/validation/JWT controls
```

### Environment variables

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

Full detail (roles, encryption, rate limiting, the audit hash chain, every
hardening fix made and how each was verified, and every known limitation
carried forward): [`docs/security.md`](docs/security.md). Real attacks run
against the live system, including a genuine race condition found and
fixed: [`docs/security-testing.md`](docs/security-testing.md). How the
anomaly engine actually scores events and how the hash chain is verified:
[`docs/flow.md`](docs/flow.md).

## Build history

Each phase's Word doc (`outputs/`) documents what was built, why, the
reasoning behind significant decisions, and every real bug found and fixed
while building it — not just a changelog. Every security fix made after
the initial build (timing side-channels, token confusion, a production
seeding guard, an unlogged QR-forgery path, and a concurrency race) is
documented in [`docs/security.md`](docs/security.md#this-phases-hardening-fixes)
and [`docs/security-testing.md`](docs/security-testing.md) instead, since
those are fixes to what exists, not new features.

## Known limitations

The consolidated, current list lives in
[`docs/security.md#known-limitations-carried-forward`](docs/security.md#known-limitations-carried-forward)
so it has one source of truth instead of drifting across four separate
READMEs.
