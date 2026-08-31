# LeakProofX — Web Dashboard (Phase 3)

React (Vite) + Tailwind CSS + React Router dashboard for the LeakProofX
backend (`../src`). Login, custody tracking, alert triage, CSV reports, and
admin (user management, paper scheduling).

## Setup

```bash
cp .env.example .env   # set VITE_API_BASE_URL to the running backend, e.g. http://localhost:4000/api/v1
npm install
npm run dev
```

The backend must already be running (see `../README.md`) with the dev
server's origin included in its `ALLOWED_ORIGINS`.

## Project layout

```
src/
  api/          axios client (token attach + refresh-on-401) + one wrapper module per backend resource
  context/      AuthContext — session state, login/logout, GET /auth/me revalidation on load
  components/   ProtectedRoute (route-level role gate), RoleGate (in-page gate), Layout, shared UI (ui.jsx)
  pages/        one component per route
  utils/        constants.js (mirrors backend enums), csv.js (client-side export)
```

## Pages / access

| Route | Access |
|---|---|
| `/login` | Public |
| `/` (dashboard) | All roles — metrics for ADMIN/BOARD/AUDITOR, quick-links otherwise |
| `/tracking`, `/tracking/:id` | All roles — list, custody timeline, scan form, decrypt/print panel |
| `/alerts`, `/alerts/:id` | ADMIN, BOARD, AUDITOR, CENTER |
| `/reports` | ADMIN, BOARD, AUDITOR |
| `/admin/papers` | ADMIN, BOARD |
| `/admin/users` | ADMIN |

## Known limitations

- **Tokens in localStorage**, not httpOnly cookies — readable by any script
  on the page (mitigated by short access-token TTL + Helmet's CSP). Changing
  this needs a coordinated backend auth-contract change; the Phase 4 mobile
  app instead uses `expo-secure-store` (Keychain/Keystore) since the mobile
  platform gives a better option for the same problem.
- **No automated frontend test suite** — verified via live browser testing
  against the real backend instead (see Phase 3/re-test documentation in
  `../outputs/`).
- **`assignedCenterIds`** entered as raw comma-separated ObjectIds on the
  paper-scheduling form — there's no `GET /centers` endpoint yet to back a
  picker.
- **Duplicated constants** (`src/utils/constants.js` mirrors
  `../src/config/constants.js` by hand) — frontend and backend are separate
  npm packages with no shared workspace set up.
