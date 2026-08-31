# LeakProofX — Key Flows

Four flows account for almost everything either client does. This is how
they actually work end to end, not just which endpoint each step calls.

## Auth bootstrap and token refresh

**On launch (either client):** if a stored access token exists, the client
calls `GET /auth/me` before trusting anything cached from a previous
session — a deactivated account or a role changed since last login is
caught immediately, not silently trusted until the token naturally expires
(20 minutes by default). Both `web/src/context/AuthContext.jsx` and
`mobile/src/context/AuthContext.js` do exactly this, differing only in
where the token is read from (`localStorage` vs. `expo-secure-store`,
synchronous vs. async).

**On login:** `POST /auth/login` → `auth.service.login()` looks up the
user, compares the password against a real bcrypt hash if the account
exists or a precomputed dummy hash otherwise (this phase's timing-side-
channel fix — see [security.md](security.md#login-timing-side-channel)),
and on success calls `issueTokenPair()`
(`src/security/jwt-auth.js`) to sign an access token (`role`, `tv`
embedded, 20min TTL) and a refresh token (`type: "refresh"`, `tv`
embedded, 7d TTL) — two different secrets, so one can never be verified as
the other (also hardened this phase, defense-in-depth against a
misconfigured deployment — see
[security.md](security.md#refresh-token-cannot-substitute-for-an-access-token)).
A `LOGIN_SUCCESS`/`LOGIN_FAILED` audit entry and an anomaly event
(`R_REPEATED_LOGIN_FAILURE`) are recorded either way.

**On every subsequent request:** the client's axios interceptor attaches
the access token; `requireAuth` (`src/middleware/auth.js`) verifies it,
re-fetches the user from the DB (not from the token's own `role` claim —
so a role edit takes effect on the very next request, not just next
login), and checks `tokenVersion` matches (logout/deactivation bump this
counter, instantly invalidating every outstanding token for that user).

**On a 401:** the client's response interceptor calls `POST /auth/refresh`
exactly once, sharing a single in-flight promise across any other
simultaneous 401s so a page that fires several requests at once doesn't
trigger several refresh calls, then retries the original request with the
new access token. Only if the refresh itself fails (expired/revoked
refresh token) does the client clear its session and redirect to login.
This pattern is identical across both clients — see Phase 3/4 docs for the
`localStorage` vs. `SecureStore` reasoning.

## Custody scan / transition

This is the core anti-leak mechanism: a paper's custody can only move
forward through a fixed sequence, and only the right role can perform each
step.

```
CREATED → HANDOVER_TO_COURIER → ARRIVED_AT_CENTER → STORED_IN_VAULT
        → HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM → COMPLETED
```

1. A paper is created (`POST /papers`, BOARD/ADMIN) with plaintext
   `content`, which is AES-256-GCM encrypted immediately
   (`src/encryption/crypto.js`) and never stored or logged in plaintext. A
   signed QR token (`src/papers/qr.js`, JWT, `purpose: "custody-qr"`,
   180-day expiry) is issued and rendered as a PNG — this is what gets
   physically attached to (or printed alongside) the paper.
2. Whoever is physically handling the paper scans that QR — via the web
   dashboard's scan form (which already has the token, since it's fetched
   from the Paper API) or the mobile app's camera (`ScanScreen` decodes the
   QR image itself; the *payload* decode is display-only, proving nothing
   — see below).
3. `POST /tracking/scan` → `tracking.service.recordScan()`:
   - `verifyQrToken()` checks the JWT signature and `purpose` claim — this
     is the actual authenticity check, not the client-side payload peek.
   - `custody.js`'s `evaluateTransition({ fromStep, toStep, role })` looks
     up `ALLOWED_TRANSITIONS[fromStep→toStep]` and checks the caller's role
     is in the allowed list for that exact pair. No table entry at all
     means the transition would skip/reorder the sequence — rejected as
     `NO_RULE`/`SKIP_STEP`. A table entry that doesn't include the caller's
     role — e.g. a COURIER attempting `CREATED → HANDOVER_TO_COURIER`,
     which only BOARD/ADMIN may perform (the board *hands the paper to*
     the courier; the courier doesn't initiate that step) — is rejected as
     `UNEXPECTED_ROLE`.
   - The `HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM` transition additionally
     enforces `now >= examTime`, applied here as well as in
     `/papers/:id/decrypt` — a Phase 2 fix, since only the decrypt endpoint
     originally enforced this floor.
   - **Every attempt is written to `TrackingLog`, accepted or not** — a
     rejected scan is itself a security-relevant signal (fed to the
     anomaly engine, see below), not just an error to discard.
   - On success, `Paper.currentCustodyStep` and `.status` advance and an
     audit-log entry is appended.
4. `GET /tracking/:id` returns the full ordered history — accepted and
   rejected entries alike, each carrying its `rejectionReason` if any.

**Why neither client has a copy of the authorization table:** the mobile
scan form shows every step as a manual choice (deliberately, so it works
offline — see below); the web dashboard computes a *suggested* next step
from `currentCustodyStep` purely as a UX hint. Neither actually decides
whether a transition is legal — `custody.js` on the backend is the sole
authority, confirmed concretely during Phase 4's physical-device testing
(a BOARD-role scan was accepted for the first transition; a COURIER-role
attempt at that same transition was correctly rejected, exactly as the
table specifies).

## Anomaly detection

`evaluateEvent(event, context)` (`src/anomaly/`) is a pure function — no DB
access, fully unit-tested — called from exactly three places:
`auth.service.login`, `papers.service.accessPaperContent` (decrypt/print),
and `tracking.service.recordScan`. Each caller assembles an `event` object
describing what just happened (type, success/failure, actor, timing,
location) and a DB-backed `context` (recent failure counts, the paper's
expected locations), then:

1. Every rule's `condition(event, context)` runs; the weights of whichever
   fired are summed.
2. The total is classified: **≥3 → WARNING**, **≥6 → CRITICAL**
   (`src/anomaly/config.js` — tunable without touching rule logic).
3. If the score crosses WARNING, `anomaly.service.recordEvent()` persists
   an `Alert` (risk score, severity, which rule IDs fired, context) and
   logs at the custom `security` pino level. `Alert.status` starts `OPEN`
   and is later moved through `ACKNOWLEDGED`/`RESOLVED` by
   `POST /alerts/:id/acknowledge`/`resolve`.

This **fails open by design**: an anomaly-evaluation bug never blocks the
request it's observing, because the actual allow/deny decision (role
check, time-lock, custody legality) already happened before
`recordEvent()` runs. The engine watches; it doesn't gate.

| Rule | Fires on |
|---|---|
| `R_TIME_WINDOW` | Decrypt/print denied for being outside the exam-time access window |
| `R_FAILED_DECRYPT` | ≥2 failed decrypt/print attempts, same actor + paper, 15min |
| `R_SKIP_STEP` | A custody scan skips or reorders the state machine |
| `R_UNEXPECTED_ROLE` | A scan/decrypt/print attempted by a role not authorized for that step |
| `R_LOCATION_MISMATCH` | Scan location doesn't match any of the paper's assigned centers |
| `R_TOO_EARLY_SCAN` | A scan attempts `OPENED_FOR_EXAM` before `examTime` |
| `R_REPEATED_LOGIN_FAILURE` | ≥3 failed logins, same account, 15min |
| `R_SYNC_DELAY` | A mobile-scanner scan syncs >30min after its `clientTimestamp` |

Two mid-severity rules firing on the same event can combine to cross
`CRITICAL` even though neither alone would — this is exercised directly in
`test/anomaly.test.js` and was live-triggered against the real stack
during Phase 2/3 verification, not just unit-tested.

## Mobile offline-first sync

The one flow that's genuinely client-specific (the web dashboard assumes a
live connection throughout).

```
Scan attempted
  ├─ App believes it's online
  │    ├─ Direct POST /tracking/scan succeeds → done
  │    └─ Request fails at the network level (not a server rejection)
  │         → falls back to the offline queue, same as below
  └─ App already knows it's offline
       → enqueueScan() writes to AsyncStorage immediately,
         capturing clientTimestamp at this exact moment

                    ⋮  (device may stay offline for any length of time)

NetInfo reports the offline→online transition (not a poll timer)
  → runSync() drains the queue IN RECORDED ORDER
       for each queued item:
         POST /tracking/scan (clientTimestamp preserved from capture time)
         ├─ 409 (server genuinely rejects it) → remove from queue,
         │    surface the rejection — retrying is pointless, and Phase 1/2's
         │    "log rejected attempts too" design already captured it
         └─ no server response at all (still offline/flaky)
              → stays queued, attempts++, tries again next reconnect
```

Submitting in recorded order matters specifically because custody
transitions are sequential — draining the queue out of order would
manufacture a spurious `SKIP_STEP` rejection that has nothing to do with
what actually happened in the field.

The backend has no special "offline" handling — it just receives whatever
`clientTimestamp` came with the request, which may be meaningfully older
than the receive time (`syncedAt`). `R_SYNC_DELAY` (above) is the only
piece of backend logic that exists specifically because this flow exists:
without a client ever populating a realistically-delayed `clientTimestamp`,
that rule would never fire outside a unit test.

See the Phase 4 Word doc for how this was verified against a real,
physically killed-and-restarted backend, and against a real camera scan on
physical hardware — not just read from the source.
