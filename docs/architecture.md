# LeakProofX — Architecture

One backend, two clients, one job: make an exam paper's custody chain hard
to leak from and easy to audit after the fact. This document is the
system-wide picture; each phase's Word doc in `../outputs/` covers the
build history and reasoning behind individual decisions in more depth.

## Components

```
                        ┌─────────────────────┐
                        │   MongoDB            │
                        │  (papers, users,      │
                        │   tracking logs,      │
                        │   alerts, audit log)  │
                        └──────────┬────────────┘
                                   │
                        ┌──────────┴────────────┐
                        │   Backend (src/)       │
                        │   Node.js + Express     │
                        │                        │
                        │  auth · papers · users │
                        │  tracking · alerts     │
                        │  anomaly · logs        │
                        │  encryption · security │
                        └──────┬─────────┬───────┘
                               │         │
                 REST + JWT    │         │  REST + JWT
                    (browser)  │         │  (mobile, SecureStore)
                               │         │
                ┌──────────────┴──┐   ┌──┴───────────────────┐
                │  Web dashboard   │   │  Mobile scanner       │
                │  web/            │   │  mobile/              │
                │  React + Vite    │   │  React Native (Expo)  │
                │  + Tailwind      │   │  + expo-camera        │
                │                  │   │                       │
                │  Admin/board/    │   │  Couriers/center staff│
                │  invigilator/    │   │  /invigilators —      │
                │  auditor console │   │  scan a QR, record a   │
                │                  │   │  custody transition,   │
                │                  │   │  online or offline     │
                └──────────────────┘   └───────────────────────┘
```

Both clients speak to the same backend, under `/api/v1`, using the same
JWT-based auth contract (a token pair returned in the response body — not
cookies; see [security.md](security.md#why-tokens-in-a-body-not-cookies)).
Neither client has its own business logic for anything security-sensitive:
role authorization, custody-transition legality, time-lock enforcement, and
encryption all live exclusively in the backend. A client can *suggest* an
action (e.g. the mobile scan form's step picker) but never *decide* whether
it's allowed.

## Why one backend, not one per client

The master build prompt's phases were sequenced backend-first (Phases 1–2),
then two independent frontends against the same API (Phases 3–4) — the
same pattern a real deployment would use: one authoritative service, many
consumption surfaces. Duplicating backend logic per client would mean
duplicating exactly the code most worth getting right once (custody state
machine, time-lock, anomaly scoring) — a correctness and security risk, not
a convenience.

## Data model (MongoDB / Mongoose, `src/models/`)

| Model | Purpose |
|---|---|
| `User` | Account + role (`ADMIN`, `BOARD`, `COURIER`, `CENTER`, `INVIGILATOR`, `AUDITOR`), bcrypt hash, `tokenVersion` (revocation) |
| `Paper` | Encrypted content + custody state (`currentCustodyStep`, `status`), `examTime`, signed `qrToken` |
| `TrackingLog` | Every custody-scan attempt — accepted or rejected — with `timestamp` (client-claimed) and `syncedAt` (server-received) |
| `Alert` | Anomaly-engine output: risk score, severity, which rules fired, triage state |
| `AuditLog` | Append-only, SHA-256 hash-chained record of every security-relevant action |
| `KeyVersion` | Encryption-key rotation history (which `keyId` was active, when) |
| `Center` | Minimal supporting model referenced by `assignedCenterIds` / `centerId` |

No model is owned by a specific client — `web/` and `mobile/` both read and
write the same collections through the same endpoints.

## Request path (either client)

```
Client → HTTPS → Express app
  → globalLimiter (300 req/15min/IP)
  → helmet (security headers) + cors (origin allowlist)
  → jsonBodyParser (per-router size limit)
  → requireAuth (JWT verify + tokenVersion check → req.user)
  → requireRole([...]) (per-route)
  → validate(zodSchema) (per-route, .strict())
  → route-specific limiter, if sensitive (auth, decrypt/print, admin)
  → controller → service (business logic + audit log + anomaly event)
  → response
```

Every layer in that chain is centralized (`src/security/`,
`src/middleware/`) rather than reimplemented per route — see
[security.md](security.md) for what each one actually does.

## Cross-cutting concerns, and where they live

- **Authorization is table-driven, not scattered in `if` statements.**
  `src/papers/custody.js`'s `ALLOWED_TRANSITIONS` map is the single source
  of truth for which role may perform which custody-step transition. Both
  clients keep a *display-only* copy of the step order
  (`CUSTODY_STEP_ORDER`) to render UI, but neither has a copy of the
  authorization table itself — that boundary is deliberate (see
  [flow.md](flow.md#custody-scan--transition)).
- **The audit log is one append-only, hash-chained stream** across every
  action type (logins, custody scans — accepted and rejected — decrypt/
  print attempts, alert triage, key rotation, admin actions). There's no
  per-feature log; `appendAuditLog()` is called from every service that
  does something security-relevant, and `scripts/verifyHashChain.js`
  verifies the whole thing at once.
- **The anomaly engine is a pure function over events**, called from three
  places (`auth.service.login`, `papers.service.accessPaperContent`,
  `tracking.service.recordScan`) rather than embedded in each. Rule logic
  (`src/anomaly/rules.js`) and tuning (`src/anomaly/config.js`) are
  separated so a threshold change never touches rule code.
- **Offline-first is a mobile-only concern**, not a backend one. The
  backend has no notion of "this scan happened offline" — it just receives
  a `clientTimestamp` that may be older than the receive time, and
  `R_SYNC_DELAY` scores the gap. The queueing, retry, and sync-on-reconnect
  logic all live in `mobile/src/context/SyncContext.js` and
  `mobile/src/storage/scanQueue.js`.

## Deployment shape (as built; see Known Limitations in each phase for what's not yet production-hardened)

- Backend: single Node.js process (`docker-compose.yml` provided), single
  MongoDB instance. Rate limiting and the audit-log write-serialization
  mutex are both in-process — documented, not yet solved, multi-instance
  concerns (see [security.md](security.md#known-limitations-carried-forward)).
- Web dashboard: static Vite build, served independently, calling the
  backend's public URL.
- Mobile: native iOS build (Expo/React Native), calling the backend over
  whatever network the device is on — LAN during development, a real
  public API host in a real deployment.

## Where to look next

- [api.md](api.md) — every endpoint, request/response shape, role gate
- [flow.md](flow.md) — the four flows that actually matter: auth, custody
  transitions, anomaly detection, mobile offline sync
- [security.md](security.md) — the security model as a whole, including
  this phase's hardening fixes and every known limitation carried forward
  from Phases 1–4
- `../outputs/LeakProofX_Phase{1,2,3,4}_Documentation.docx` — phase-by-phase
  build history, including real bugs found and fixed along the way
