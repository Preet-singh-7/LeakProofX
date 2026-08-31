# LeakProofX — Security Model

This consolidates the security posture already documented per-component
(backend `README.md`, `web/README.md`, `mobile/README.md`) into one place,
and records the concrete hardening fixes made during Phase 5's security
review — real issues found by reading the code, not a generic checklist.

## Roles

| Role | What it's for |
|---|---|
| `ADMIN` | Full access; the only role that can manage users |
| `BOARD` | Creates papers, hands them off to couriers (`CREATED → HANDOVER_TO_COURIER`), views alerts |
| `COURIER` | Moves a paper between board and center (`HANDOVER_TO_COURIER → ARRIVED_AT_CENTER`) |
| `CENTER` | Receives and stores the paper at the exam center (`ARRIVED_AT_CENTER → STORED_IN_VAULT → HANDOVER_TO_EXAM_HALL`) |
| `INVIGILATOR` | The only role (besides ADMIN) that can decrypt/print, and the one that opens the paper (`→ OPENED_FOR_EXAM → COMPLETED`) |
| `AUDITOR` | Read-only oversight — views/triages alerts, cannot alter custody or content |

Every role gate is enforced by `requireRole([...])` reading `req.user.role`,
which `requireAuth` populated from a **fresh DB lookup**, not from the JWT's
own `role` claim — a role changed mid-session takes effect on the very
next request, not just the next login.

## Authentication

- **Password hashing:** bcrypt, 12 rounds (`src/auth/auth.service.js`).
- **Tokens:** JWT, HS256, algorithm pinned on every `jwt.verify()` call — a
  token crafted with `"alg": "none"` or any other algorithm is rejected
  regardless of what its header claims (`src/security/jwt-auth.js`,
  covered directly by `test/security.test.js`).
- **Two separate secrets** for access vs. refresh tokens
  (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`) — a refresh token can never
  be verified as an access token or vice versa, because they're checked
  against different keys entirely.
- **Revocation by `tokenVersion`, not a blacklist:** logout and
  deactivation both bump a per-user counter; every outstanding access and
  refresh token for that user is invalidated in one write, with no need to
  track individual tokens. Trade-off: this revokes *all* of a user's
  sessions at once, not one specific stolen token — a per-token blacklist
  would need TTL-matched storage (Redis) to avoid growing unbounded, more
  infrastructure than this MVP's short-lived (20min) access tokens need
  yet.

### Why tokens in a body, not cookies

Both clients receive `{ accessToken, refreshToken }` in the login response
body and attach the access token manually via an `Authorization` header,
rather than the backend setting `httpOnly` cookies. An `httpOnly` cookie
is the stronger default against XSS-based token theft (JavaScript can't
read it), but React Native has no browser cookie jar at all — the mobile
client structurally needs a token-in-body contract, so the web dashboard
uses the same one rather than the two clients having different auth
mechanisms against one backend. The web dashboard's `localStorage` storage
is flagged as the resulting trade-off below; the mobile client instead
uses `expo-secure-store` (Keychain/Keystore) for the same tokens, since
the mobile platform offers a real encrypted-storage option the browser
doesn't.

## This phase's hardening fixes

Three concrete issues found and fixed during Phase 5's review — not
hypothetical, each verified live against the running backend.

### Login timing side-channel

**Before:** `auth.service.login()` returned immediately (`401 Invalid
credentials`) for a nonexistent or deactivated email, without ever calling
`bcrypt.compare()`. For an existing, active account with the wrong
password, it *did* call `bcrypt.compare()`, which costs measurable time
(bcrypt is deliberately slow). The difference in response latency between
those two cases lets an attacker enumerate which emails have accounts —
and which of those are active — purely by timing, independent of the
identical `"Invalid credentials"` message both paths return.

**Fix:** `login()` now always calls `bcrypt.compare()` — against the real
hash if the user exists, against a precomputed dummy hash otherwise — so
every login attempt costs the same regardless of whether the account
exists. Verified live: wrong password, nonexistent email, and a correct
login all still behave identically from the caller's perspective (same
error shape; successful login still issues tokens), with `npm test`'s 25
tests passing unchanged.

### Refresh token cannot substitute for an access token

**Before:** `verifyAccessToken()` verified the JWT signature and algorithm
but never checked the payload's `type` claim. In a correctly configured
deployment this is harmless — access and refresh tokens are signed with
different secrets, so a refresh token fails signature verification against
`JWT_ACCESS_SECRET` outright. But if an operator ever sets
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to the *same* value (a
plausible copy-paste misconfiguration, not caught by
`assertProductionSecrets()`, which only checks that each secret is
*present*, not that they differ), a refresh token — 7 days by default —
would pass as a valid access token, extending its practical exposure
window far beyond the intended 20-minute access-token TTL.

**Fix:** `verifyAccessToken()` now explicitly rejects a payload with
`type: "refresh"`, symmetric to `verifyRefreshToken()`'s existing check in
the other direction. Defense-in-depth: costs nothing in the correctly
configured case, closes the gap in the misconfigured one.

### Seeding the first admin

**Before:** `scripts/seedAdmin.js` reads `SEED_ADMIN_PASSWORD` from env,
falling back to a hardcoded default (`ChangeMe123!`, publicly documented in
this very README) if unset. `assertProductionSecrets()` — the function
that's supposed to refuse missing secrets in production — is only called
from `src/server.js`'s boot sequence; `seedAdmin.js` is a standalone script
that never calls it. Running `npm run seed:admin` against a production
database without first setting `SEED_ADMIN_PASSWORD` would therefore
silently create an `ADMIN` account with a password anyone reading this
repo already knows.

**Fix:** `seedAdmin.js` now refuses outright — before connecting to the
database at all — if `NODE_ENV=production` and `SEED_ADMIN_PASSWORD` isn't
explicitly set. Verified live both ways: refuses with a clear error when
the password is unset in production, proceeds normally otherwise (and
unaffected in development, where the fallback remains intentional for
quick local setup).

### Addendum — found via adversarial testing

Two more real issues, found by actually attacking the running system
rather than reading the code for bugs (full attack transcripts, exact
requests, and DB verification for all three tests attempted — including
the one that didn't find anything — in
[`security-testing.md`](security-testing.md)).

### Forged QR tokens were invisible to the audit trail

**Before:** `POST /tracking/scan` verifies the QR token's signature
(`verifyQrToken()`, `src/papers/qr.js`) before looking up any paper. A
forged token — signed with a guessed secret instead of the real
`QR_SIGNING_SECRET` — was correctly rejected with `400 Invalid or
unrecognized QR token`, before any custody logic ran. But that rejection
threw straight out of `verifyQrToken()`, before `tracking.service.js`'s own
`AuditLog`/`TrackingLog`/anomaly-engine calls were ever reached. Confirmed
live: a forged-token attempt left zero new entries in `TrackingLog`,
`AuditLog`, or `Alert` — only a generic `WARN`-level `"request error"` line
indistinguishable from any other malformed request, not the dedicated
`security` log level every other rejection in this system uses (role
rejections, rate-limit trips, CORS denials, revoked tokens). An attacker
probing for the signing secret, or replaying a guessed token, would leave
no trace an operator or the anomaly engine would ever see.

**Fix:** `tracking.service.js`'s `recordScan()` now catches a failed
`verifyQrToken()`, writes an `AuditLog` entry (`QR_TOKEN_REJECTED`, actor
captured, no `targetId` since the token's claimed paper was never
verified), and logs at the `security` level — before re-throwing the same
400 the caller already saw. The caller-facing behavior is unchanged;
only server-side visibility improved. Re-verified with the identical
forged token: the `AuditLog` entry and security-level log line both now
appear.

### A duplicate custody-transition race at the exam-time boundary (TOCTOU)

**Before:** `papers.service.js`'s `accessPaperContent()` (backing
`POST /papers/:id/decrypt` and `/print`) read a paper, checked
`currentCustodyStep === HANDOVER_TO_EXAM_HALL` in application memory, and
only *then* wrote `currentCustodyStep = OPENED_FOR_EXAM` via
`paper.save()` — a read-then-write pattern with no atomicity between the
check and the write. Confirmed live: 8 genuinely concurrent (`Promise.all`,
not sequential) decrypt requests at the exam-time boundary produced **3
duplicate `HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM` `TrackingLog` entries**
for what should be a single, one-time transition — three separate requests
all read the paper before any of their writes landed, and all three passed
the in-memory check and wrote their own transition.

**Fix:** replaced the read-then-write with an atomic, guarded
`Paper.findOneAndUpdate({ _id, currentCustodyStep: HANDOVER_TO_EXAM_HALL }, { $set: {...} }, { new: true })`
— the custody-state guard now lives in the same database operation as the
write, not a separate in-memory check beforehand. MongoDB resolves a
single-document update atomically, so under concurrent requests exactly
one caller's update matches and gets a result back; every other caller
gets `null`, re-fetches the paper's real current state, and (since it's
now legitimately `OPENED_FOR_EXAM`) proceeds to read content without
writing a second transition. No lock or mutex — the database itself
arbitrates. Re-verified with the identical 8-concurrent-request attack:
all 8 still succeed (access for legitimately authorized requesters is
unaffected), but exactly 1 transition is now recorded instead of 3.

## Content encryption

Paper content is AES-256-GCM encrypted (`src/encryption/crypto.js`)
immediately on `POST /papers`, before it ever reaches the database — only
`contentCipher`, `iv`, `authTag`, and a `keyId` *reference* are stored, never
the key itself. GCM's auth tag means any ciphertext tampering is detected
on decrypt (throws) rather than silently producing garbage plaintext. Keys
are loaded once from env at startup and never logged or persisted.

**Key rotation:** `npm run rotate:key -- <keyId>` records a new active key
version and retires the previous one; existing papers keep decrypting
under whichever `keyId` they were originally encrypted with (`PAPER_ENC_KEY_v1`
must stay configured indefinitely once anything used it — nothing
re-encrypts old papers automatically). Rotation is a CLI-only operation,
deliberately not reachable over the API.

## Time-lock

`POST /papers/:id/decrypt` and `/print` both enforce, independently of each
other and of `/tracking/scan`'s parallel check on the
`HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM` transition:

1. `now` within `[examTime − ALLOWED_PRE_WINDOW_MINUTES, examTime + ALLOWED_POST_WINDOW_MINUTES]`.
2. If still at `HANDOVER_TO_EXAM_HALL`: the stricter `now >= examTime`
   exactly (no early opening even inside the pre-window).
3. Role (`INVIGILATOR`/`ADMIN`) and custody state
   (`HANDOVER_TO_EXAM_HALL` or already `OPENED_FOR_EXAM`).

This is a server-clock check, not a cryptographic time-lock puzzle — see
Known Limitations below.

## Input validation, rate limiting, headers, CORS

- **Validation:** every request schema (`src/*/​*.validation.js`) is a Zod
  `.strict()` object — an unrecognized field is a 400, not a silently
  dropped value. Body size limits are per-router: 10kb everywhere except
  the papers router (2MB, since paper content lives in that body).
- **Rate limiting** (`src/security/rate-limit.js`, in-memory,
  single-instance): global baseline (300/15min/IP), `authLimiter`
  (10/15min on login/register, only counting failed attempts),
  `sensitiveActionLimiter` (20/15min on decrypt/print), `adminLimiter`
  (60/15min on `/users/*`). Every trip is logged at the `security` level.
- **Headers:** Helmet's defaults (`src/security/headers.js`).
- **CORS:** explicit origin allowlist (`ALLOWED_ORIGINS`), never `*`,
  `credentials: true`.
- **Logging:** a custom `security` pino level for rejected tokens, CORS
  denials, rate-limit trips, role-authorization failures, and fired
  anomaly alerts. Passwords, tokens, and ciphertext are never logged.

## Audit log

Append-only, SHA-256 hash-chained
(`currentHash = SHA256(prevHash + payload + timestamp)`,
`src/logs/audit.service.js`). Writes are serialized by an in-process mutex
so concurrent requests within one server instance can't fork the chain.
`npm run verify:chain` recomputes the entire chain from genesis and
reports the first break, if any — see the script's own `--help` for the
CLI options added this phase (JSON output, explicit exit codes for CI).

This is a hash chain, not a blockchain: it detects tampering after the
fact, but has no independent distributed consensus — a single compromised
instance with DB write access could still append a self-consistent forged
tail. What it *does* guarantee is that any edit to an already-written entry
(changing a `metadata` field, backdating a `timestamp`, deleting an entry
from the middle) breaks every hash after it, and `verify:chain` finds
exactly where.

## Mobile-specific: token storage

`expo-secure-store` (iOS Keychain / Android Keystore) for tokens — a
stricter choice than the web dashboard's `localStorage`, since the mobile
platform provides real encrypted storage at no extra cost. The offline
scan queue deliberately uses plain `AsyncStorage` instead: it holds
custody metadata (which paper, which step, where, when), not secrets, and
SecureStore is designed for a small number of small secret values, not a
growing, frequently-rewritten list.

## Known limitations carried forward

Flagged in the relevant phase's docs, restated here as the consolidated
list — none of these are new, and none were silently dropped between
phases:

- **No paging/notification integration** — CRITICAL alerts are logged at
  the `security` level but nothing pages/emails/SMSes anyone yet.
- **Token revocation is per-user, not per-token** — see Authentication
  above.
- **Rate limiting and audit-log write serialization are both in-process,
  single-instance** — documented Redis-backed swaps exist for both but
  aren't implemented; a multi-instance deployment needs them before this
  is safe to scale horizontally.
- **`Alert.centerId` is best-effort**, not authoritative — derived from
  the acting user's own center or the paper's first assigned center.
- **Anomaly config is file-based** (`src/anomaly/config.js`) — tunable
  without touching rule logic, but still an edit + redeploy, not a live
  admin toggle.
- **`examTime` checks are server-clock based**, not a cryptographic
  time-lock puzzle (TLP) or HSM-backed release — flagged as future
  hardening, not attempted here.
- **Web dashboard tokens in `localStorage`** — readable by any script on
  the page; mitigated by short access-token TTL and Helmet's CSP, not
  eliminated. Moving to `httpOnly` cookies needs a coordinated
  backend auth-contract change (see "Why tokens in a body, not cookies"
  above) — out of scope for a frontend-only phase, and now that the
  mobile client also depends on the token-in-body contract, changing it
  would need to happen for both clients at once.
- **Mobile physical-device testing used personal-team, not distribution,
  code signing** — see the Phase 4 Word doc; a real pilot deployment needs
  a paid Apple Developer Program enrollment and a proper ad hoc/TestFlight
  build, not automatic personal-team signing.
