# LeakProofX — Adversarial Security Testing Pass

Three specific mechanisms this system claims to enforce, actually attacked
with real requests against the running backend, with results confirmed
against real database state — not inferred from reading the source. Every
command below was actually run; the output shown is the actual output.

Two genuine issues were found (one in 2a, one in 2c) and both were fixed
and re-verified using the same attack that found them. See
[`security.md`](security.md#this-phases-hardening-fixes) for the fix
write-ups in the same format as the three earlier Phase 5 fixes.

---

## 2a — QR / custody-chain forgery

**Claim being tested:** a role not authorized for a given custody
transition is rejected (409, not a crash or silent success), and a
tampered/forged QR token is rejected by signature verification before any
custody logic runs.

### 2a-i — Unauthorized role attempts a transition

A fresh paper (`Adversarial Test Paper`) was created at `CREATED`. Logged
in as `CENTER` (not authorized for `CREATED → HANDOVER_TO_COURIER` — only
`BOARD`/`ADMIN` may perform that step) and attempted the transition anyway
using the paper's real, validly-signed QR token:

```bash
curl -X POST $BASE/tracking/scan -H "Authorization: Bearer $CENTER_TOKEN" \
  -d '{"qrToken":"<real qrToken>","toStep":"HANDOVER_TO_COURIER"}'
```

**Result:**

```
{"error":"REQUEST_ERROR","message":"Role CENTER is not authorized for CREATED->HANDOVER_TO_COURIER","details":{"trackingLogId":"6a95ac36177b8db50de0ff2d"}}
HTTP_STATUS:409
```

Confirmed against DB state, not just the response:

| Check | Result |
|---|---|
| Paper's `currentCustodyStep` after the attempt | Unchanged (`CREATED`) |
| `TrackingLog` entry written | Yes — `accepted: false`, correct `rejectionReason` |
| `AuditLog` entry written | Yes — `CUSTODY_TRANSITION_REJECTED`, `actorRoleId: CENTER` |
| `Alert` raised | Yes — `R_UNEXPECTED_ROLE`, riskScore 4, severity WARNING |
| Security-level log line | Yes — `"anomaly alert raised"` at the custom security pino level, exact timestamp match |

**Verdict: PASS.** The correct status code, the correct rejection reason,
no state change, and the attempt is fully visible in the audit trail, the
tracking log, and as a scored alert.

### 2a-ii — Forged QR signature

Checked `src/papers/qr.js` first: QR tokens are JWTs signed with
`QR_SIGNING_SECRET` (`{ paperId, purpose: "custody-qr" }`, HS256), verified
in `verifyQrToken()` before `tracking.service.js` ever looks up a paper.
Forged a token for the same real `paperId`, but signed with a secret an
attacker would actually have to guess (not `QR_SIGNING_SECRET`):

```js
jwt.sign({ paperId, purpose: 'custody-qr' }, 'attacker-guessed-wrong-secret-value',
  { algorithm: 'HS256', expiresIn: '180d' })
```

```bash
curl -X POST $BASE/tracking/scan -H "Authorization: Bearer $BOARD_TOKEN" \
  -d '{"qrToken":"<forged token>","toStep":"HANDOVER_TO_COURIER"}'
```

**Result:**

```
{"error":"REQUEST_ERROR","message":"Invalid or unrecognized QR token"}
HTTP_STATUS:400
```

Confirmed against DB and log state:

| Check | Result (before fix) |
|---|---|
| Rejected before any custody logic ran | Yes — `verifyQrToken()` throws before `Paper.findById` is ever called |
| `TrackingLog` / `AuditLog` entry written | **No** — zero new entries; counts stayed exactly where they were before the attempt |
| `Alert` raised | **No** |
| Log level | Only a generic `WARN`-level `"request error"` line — the same level any malformed-request error gets, not the dedicated `security` level every other rejection in this system uses |

**Verdict: signature validation itself is solid (PASS) — but the logging
claim FAILED.** This system's own stated design is "every attempt is
written to the audit log" and "a rejected attempt is itself a security
signal for the anomaly engine" — true for 2a-i's role rejection, but a
forged-QR attempt was invisible to both. That's a real, exploitable-in-
spirit gap: an attacker probing for a valid `QR_SIGNING_SECRET` or replaying
a guessed token leaves no trace an operator or the anomaly engine would
ever see, only a log line indistinguishable from routine input-validation
noise.

**Fixed** in `src/tracking/tracking.service.js`'s `recordScan()`: a failed
`verifyQrToken()` now writes an `AuditLog` entry (`QR_TOKEN_REJECTED`,
actor captured, no trustworthy `targetId` since the token's claimed
`paperId` was never verified) and logs at the `security` level, before
re-throwing the same 400 the caller already saw.

**Re-verified** with the identical forged token against the fixed code:

```
AuditLog QR_TOKEN_REJECTED entry found: true
  { actorRoleId: "BOARD", action: "QR_TOKEN_REJECTED", targetId: null,
    metadata: { reason: "Invalid or unrecognized QR token" } }
[2026-08-31 22:09:53.078 +0530] USERLVL (27144): rejected invalid or forged custody QR token
```

Response to the caller is unchanged (still 400, still `"Invalid or
unrecognized QR token"`) — only the server-side visibility changed.

---

## 2b — Token replay after logout

**Claim being tested:** logout actually revokes the access token, not just
relies on its short (20 min) TTL to eventually expire.

Checked `src/auth/auth.service.js`'s `logout()` first: it increments the
user's `tokenVersion`, and `requireAuth` (`src/middleware/auth.js`) rejects
any token whose embedded `tv` doesn't match the user's current
`tokenVersion` — revocation-by-version, not a blacklist.

```bash
# 1. Log in, capture the access token
TOKEN=$(curl -X POST $BASE/auth/login -d '{"email":"...","password":"..."}' | jq -r .accessToken)

# 2. Confirm it works
curl $BASE/auth/me -H "Authorization: Bearer $TOKEN"   # -> 200

# 3. Log out
curl -X POST $BASE/auth/logout -H "Authorization: Bearer $TOKEN"   # -> 200

# 4. Replay the SAME captured token
curl $BASE/auth/me -H "Authorization: Bearer $TOKEN"
```

**Result:**

```
Before logout: {"user":{...}}                              HTTP 200
Logout:        {"message":"Logged out"}                     HTTP 200
Replay:        {"error":"REQUEST_ERROR","message":"Token has been revoked"}   HTTP 401
```

Also checked the refresh token from the same login isn't a backdoor around
this — replayed the old refresh token against `POST /auth/refresh` after
logout:

```
{"error":"REQUEST_ERROR","message":"Token has been revoked"}   HTTP 401
```

**Verdict: PASS.** Logout revokes immediately — both the access token and
the refresh token from that session are rejected on the very next request,
not just eventually once the TTL runs out. This is a real guarantee, not a
theoretical one: the replayed token is byte-for-byte the one captured
before logout, and it's rejected specifically with `"Token has been
revoked"` (the `tokenVersion` mismatch branch), not a generic auth failure.

---

## 2c — Time-lock boundary race condition (TOCTOU)

**Claim being tested:** the `HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM`
transition (triggered as a side effect of `POST /papers/:id/decrypt` or
`/print`) happens exactly once, even under concurrent requests at the
`examTime` boundary.

Read `src/papers/papers.service.js`'s `accessPaperContent()` first: before
this test, it read the paper (`getPaperById`), checked
`paper.currentCustodyStep === HANDOVER_TO_EXAM_HALL` in application memory,
then later called `paper.currentCustodyStep = ...; await paper.save()` —
a classic read-then-write pattern, not an atomic, guarded DB operation.

### Setup

A test paper was moved through custody to `HANDOVER_TO_EXAM_HALL`, and its
`examTime` was set directly in the DB to 2 seconds in the past (so every
concurrent request's `now >= examTime` check passes identically — a
controlled way to land multiple requests exactly at the boundary without
relying on wall-clock luck).

### Attack

8 genuinely concurrent `POST /papers/:id/decrypt` requests, dispatched via
`Promise.all` (not sequential curl calls) as `INVIGILATOR`:

```js
const requests = Array.from({length: 8}, (_, i) =>
  axios.post(`${BASE}/papers/${PAPER_ID}/decrypt`, { deviceId: `race-test-${i}` },
    { headers: { Authorization: `Bearer ${token}` } })
);
await Promise.all(requests);
```

### Result — before the fix

All 8 requests returned `200 OK` (expected — a legitimate transition should
let every authorized concurrent requester through). The real question was
how many times the one-time `HANDOVER_TO_EXAM_HALL → OPENED_FOR_EXAM`
transition actually got written:

```
TrackingLog entries for HANDOVER_TO_EXAM_HALL -> OPENED_FOR_EXAM: 3
  (expected 1)
```

**Three separate requests all read the paper while it was still at
`HANDOVER_TO_EXAM_HALL`, before any of their writes had landed — all three
passed the in-memory check, and all three independently wrote their own
transition and `TrackingLog` entry.** A genuine TOCTOU race, confirmed by
DB state, not inferred from reading the code.

### Fix

`src/papers/papers.service.js`: replaced the read-then-write with an
atomic, guarded `findOneAndUpdate` — the filter re-checks
`currentCustodyStep: HANDOVER_TO_EXAM_HALL` at write time, in the same
database operation that performs the write:

```js
const updated = await Paper.findOneAndUpdate(
  { _id: paper._id, currentCustodyStep: CUSTODY_STEPS.HANDOVER_TO_EXAM_HALL },
  { $set: { currentCustodyStep: CUSTODY_STEPS.OPENED_FOR_EXAM, status: PAPER_STATUS.OPENED } },
  { new: true }
);
```

MongoDB resolves a single-document update atomically, so under concurrent
requests exactly one caller's update matches the filter and gets a non-null
result back — every other concurrent caller gets `null`, re-fetches the
paper's real current state, and (since it's now legitimately
`OPENED_FOR_EXAM`) proceeds to read content without writing a second
transition. No lock, no mutex, no in-process serialization — the database
itself is the source of truth for who won.

### Re-verified — after the fix

The test paper was reset to `HANDOVER_TO_EXAM_HALL` and the prior
(pre-fix) duplicate tracking entries were cleared, then the **identical**
8-concurrent-request attack was re-run against the fixed code:

```
req 0 -> 200 OK   req 1 -> 200 OK   req 2 -> 200 OK   req 3 -> 200 OK
req 4 -> 200 OK   req 5 -> 200 OK   req 6 -> 200 OK   req 7 -> 200 OK
Succeeded: 8 / Failed: 0

TrackingLog entries for HANDOVER_TO_EXAM_HALL -> OPENED_FOR_EXAM: 1
  (expected exactly 1 now)
Final paper state: OPENED_FOR_EXAM OPENED
```

**Verdict: genuine race FOUND and FIXED.** Every legitimately-authorized
concurrent request still succeeds (8/8, same as before — this fix doesn't
change who gets access), but the custody chain now records the transition
exactly once instead of once per request that happened to race the write.

---

## Regression check

`npm test` (25/25 passing) and `node scripts/verifyHashChain.js` (chain
intact) were re-run after both fixes, in addition to the targeted
re-verification of each fix above.
