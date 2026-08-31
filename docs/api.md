# LeakProofX — API Reference

All routes are mounted under `/api/v1`. Every request/response body is
JSON. Authenticated requests send `Authorization: Bearer <accessToken>`.

Every request body schema is a Zod `.strict()` object — an unrecognized
field is rejected outright (400), not silently dropped. Schemas referenced
below live in each resource's `*.validation.js`.

Roles: `ADMIN`, `BOARD`, `COURIER`, `CENTER`, `INVIGILATOR`, `AUDITOR`. See
[security.md](security.md#roles) for what each role is for.

## Error shape

Every error response (validation failure, auth failure, business-rule
rejection) is:

```json
{ "error": "SOME_ERROR_CODE", "message": "Human-readable explanation" }
```

A 409 custody-transition rejection additionally includes `trackingLogId`,
since the rejected attempt itself was still written to `TrackingLog`.

---

## Auth (`/auth`)

| Method & path | Role | Rate limit | Body |
|---|---|---|---|
| `POST /auth/register` | ADMIN | `authLimiter` (10/15min) | `{ name, email, password, role, centerId? }` |
| `POST /auth/login` | Public | `authLimiter`, `skipSuccessfulRequests` | `{ email, password }` |
| `POST /auth/refresh` | Public (needs a valid refresh token) | — | `{ refreshToken }` |
| `POST /auth/logout` | Any authenticated user | — | — |
| `GET /auth/me` | Any authenticated user | — | — |

There is no public self-signup — `POST /auth/register` is ADMIN-gated. The
very first admin account is created out-of-band with
`npm run seed:admin` (see [security.md](security.md#seeding-the-first-admin)
for the production guard added this phase).

**`POST /auth/login` / `POST /auth/register` response:**

```json
{ "user": { "id", "name", "email", "role", "centerId" }, "accessToken": "...", "refreshToken": "..." }
```

**`POST /auth/refresh` response:** `{ "accessToken": "..." }` — issues a
fresh token pair internally but only returns the new access token; the
existing refresh token remains valid until its own TTL or a `tokenVersion`
bump (logout/deactivation) invalidates it.

**`GET /auth/me` response:** `{ "user": { ...same shape... } }` — always
reads the current DB row, not the token's own claims, so a role change or
deactivation is reflected immediately on next call (this is exactly what
both clients call on launch — see
[flow.md](flow.md#auth-bootstrap-and-token-refresh)).

---

## Users (`/users`) — ADMIN only

| Method & path | Body |
|---|---|
| `GET /users` | — |
| `GET /users/:id` | — |
| `POST /users/:id/deactivate` | — |

Deactivation sets `isActive: false` and does **not** itself bump
`tokenVersion` — a deactivated user's already-issued tokens are still
rejected because `requireAuth` checks `user.isActive` independently of the
version check, but see [security.md](security.md#known-limitations-carried-forward)
for the nuance this creates.

---

## Papers (`/papers`)

| Method & path | Role | Rate limit | Body |
|---|---|---|---|
| `POST /papers` | BOARD, ADMIN | — | `{ title, examName, content, examTime, durationMinutes, assignedCenterIds?, expectedCustodySteps? }` |
| `GET /papers` | Any role | — | — |
| `GET /papers/:id` | Any role | — | — |
| `GET /papers/:id/qr` | ADMIN, BOARD, COURIER, CENTER | — | — |
| `POST /papers/:id/decrypt` | INVIGILATOR, ADMIN | `sensitiveActionLimiter` (20/15min) | `{ location?, deviceId? }` |
| `POST /papers/:id/print` | INVIGILATOR, ADMIN | `sensitiveActionLimiter` | `{ location?, deviceId? }` |

`content` on create is raw plaintext up to 2MB — encrypted (AES-256-GCM)
before it ever touches the database; only `contentCipher`/`iv`/`authTag`/
`keyId` are stored. See [security.md](security.md#content-encryption).

`GET /papers/:id/qr` returns `{ paperId, dataUrl }` — a PNG data URL
encoding the paper's signed `qrToken` (a JWT, 180-day expiry, `purpose:
"custody-qr"` — see [flow.md](flow.md#custody-scan--transition)).

`POST /papers/:id/decrypt` and `/print` both enforce, independently of each
other and of `/tracking/scan`: role, custody state
(`HANDOVER_TO_EXAM_HALL` or already `OPENED_FOR_EXAM`), and the `examTime`
window (`ALLOWED_PRE_WINDOW_MINUTES` / `ALLOWED_POST_WINDOW_MINUTES`). If
the paper is still at `HANDOVER_TO_EXAM_HALL`, a successful call performs
the `→ OPENED_FOR_EXAM` custody transition itself (writing its own
`TrackingLog` entry) — there's no need to call `POST /tracking/scan`
separately first. Response: `{ title, examName, content }` — `content` is
the decrypted plaintext, returned only once every check above passes.

---

## Tracking (`/tracking`)

| Method & path | Role | Body |
|---|---|---|
| `POST /tracking/scan` | COURIER, CENTER, INVIGILATOR, BOARD, ADMIN | `{ qrToken, toStep, location?, deviceId?, clientTimestamp? }` |
| `GET /tracking/:id` | Any role | — (`:id` is a paper ID) |

`POST /tracking/scan` is the single entry point both the web dashboard's
scan form and the mobile scanner app call. `toStep` must be one of the
custody-step enum values; whether the *specific* `fromStep → toStep`
transition is legal for the caller's role is decided entirely server-side
(`src/papers/custody.js`) — see
[flow.md](flow.md#custody-scan--transition) for the full decision logic.
A rejected transition still returns a `TrackingLog` entry id and is scored
by the anomaly engine (`R_SKIP_STEP`, `R_UNEXPECTED_ROLE`,
`R_TOO_EARLY_SCAN`, `R_LOCATION_MISMATCH`, `R_SYNC_DELAY` as applicable).

`clientTimestamp` (optional) is what the mobile app's offline queue sends —
the moment the scan actually happened, which may be well before the server
receives it. The response is `{ paper, log }` on success.

`GET /tracking/:id` returns the full ordered `TrackingLog` history for a
paper — including rejected attempts, each with `accepted` and
`rejectionReason`.

---

## Alerts (`/alerts`) — read + triage only, no `POST /`

Alerts are exclusively system-generated by the anomaly engine.

| Method & path | Role | Body / query |
|---|---|---|
| `GET /alerts` | ADMIN, BOARD, AUDITOR, CENTER | query: `status?`, `severity?`, `paperId?` |
| `GET /alerts/:id` | ADMIN, BOARD, AUDITOR, CENTER | — |
| `POST /alerts/:id/acknowledge` | ADMIN, BOARD, AUDITOR | — |
| `POST /alerts/:id/resolve` | ADMIN, BOARD, AUDITOR | `{ resolution? }` |

An `Alert` carries `riskScore`, `severity` (`WARNING` / `CRITICAL`),
`triggeredRules` (which rule IDs fired and summed to that score), and
`context` (whatever the anomaly event captured — e.g. `fromStep`/`toStep`
for a custody rejection). See [flow.md](flow.md#anomaly-detection) for how
a score gets computed and turned into an alert in the first place.

---

## Dashboard (`/dashboard`)

| Method & path | Role |
|---|---|
| `GET /dashboard/summary` | ADMIN, BOARD, AUDITOR |

Response: `{ papersByStatus: { [status]: count }, openAlertCount, auditLogCount }`.
Deliberately minimal — Phase 1 built this so Phase 3's dashboard had a real
endpoint from day one; deeper analytics are a frontend-layer concern on top
of this and the list endpoints above.

---

## Not exposed over HTTP

- **Audit log** (`AuditLog`) has no read endpoint. It's a write-once,
  operationally-verified stream (`npm run verify:chain`), not something
  meant for arbitrary API querying yet — see
  [security.md](security.md#known-limitations-carried-forward).
- **Key rotation** is a CLI operation (`npm run rotate:key -- <keyId>`),
  not an API call — rotating the active encryption key is deliberately not
  something reachable over the network at all.
