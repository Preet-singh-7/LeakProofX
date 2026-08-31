# LeakProofX — Scanner App (Phase 4)

React Native (Expo) app for couriers, center staff, and invigilators to scan
a paper's custody QR code and record the next custody-chain transition —
online or offline.

## Setup

```bash
cp .env.example .env   # set EXPO_PUBLIC_API_BASE_URL to the running backend
npm install
npx expo run:ios       # native build + launch on the iOS Simulator
```

`npx expo run:ios` does a real native build (needed for `expo-camera`'s
barcode scanning, which isn't available in the generic Expo Go sandbox on
every SDK) — first run installs CocoaPods and takes several minutes. If
`pod install` fails with a Ruby/CocoaPods `Unicode Normalization` error, your
shell locale isn't set to UTF-8: `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`
before retrying (see CocoaPods' own warning about this).

For Android: `npx expo run:android` (untested in this build — see Known
limitations).

## Project layout

```
src/
  api/          axios client (SecureStore-backed token attach + refresh-on-401),
                auth.js, tracking.js (submitScan), syncService.js (runSync)
  context/      AuthContext (session), SyncContext (connectivity + queue + auto-sync-on-reconnect)
  storage/      tokenStorage.js (SecureStore — tokens), scanQueue.js (AsyncStorage — offline scans)
  screens/      LoginScreen, HomeScreen, ScanScreen, QueueScreen
  utils/        constants.js (mirrors backend enums), qr.js (client-side QR payload decode)
  RootNavigator.js
```

## How offline-first works

1. `ScanScreen` decodes the scanned QR's payload client-side (display only —
   the backend independently verifies the signature on submit) and shows a
   custody-step picker.
2. On submit, `SyncContext.recordScan()`:
   - If online: submits directly to `POST /tracking/scan`. A network-level
     failure (not a server rejection) falls back to the offline queue.
   - If offline: queues immediately via `storage/scanQueue.js`
     (AsyncStorage), capturing `clientTimestamp` at the moment of the scan.
3. `SyncContext` listens for connectivity via `NetInfo`; the offline→online
   transition triggers `runSync()` automatically (not a poll timer).
4. `runSync()` submits each queued scan **in order** (custody transitions are
   sequential — submitting out of order would itself look like a skipped
   step) with its original `clientTimestamp`. The backend stores that as
   `TrackingLog.timestamp` and the server's actual receive time as
   `syncedAt` — this was already built in Phase 1/2
   (`tracking.service.js`), Phase 4 just adds the client that exercises it.
5. A scan the server genuinely rejects (409 — e.g. someone else already
   advanced this paper while we were offline) is removed from the queue, not
   retried forever. A scan that fails from having no connection stays queued.

### Large sync delays are visible to the anomaly engine

New in Phase 4: `R_SYNC_DELAY` (`../src/anomaly/rules.js`) fires when the gap
between a scan's `clientTimestamp` and the server's actual receive time
(`syncedAt`) exceeds `SYNC_DELAY_THRESHOLD_MINUTES` (default 30,
`../src/anomaly/config.js`). A courier out of signal for a short drive won't
trip it; a scan that surfaces hours or days late will.

## Known limitations

- **iOS only** — Android (`expo run:android`) uses the same code path
  (Expo's cross-platform camera/storage APIs) but wasn't built or run in
  this environment.
- **Physical-device camera scanning: verified.** The Simulator has no
  camera hardware, so `expo-camera`'s barcode scanner was first exercised
  end-to-end on a real iPhone — logged in, scanned a live signed QR code
  with the actual camera, submitted a real custody transition, and
  confirmed the result against the database (not just the app's own
  success message). A second scan at the same step was correctly rejected
  server-side, confirming the anti-replay sequencing rule holds via the
  real camera path too, not only in unit tests. See the Phase 4 Word doc
  (`../outputs/`) for the physical-device build/signing issues hit and
  fixed along the way (device-ID format mismatches between Apple's own
  tooling, per-rebuild developer-trust resets, and a Debug-build Metro
  dependency issue resolved by building Release instead).
- **No suggested "next step"**: unlike the web dashboard (which can fetch a
  paper's current custody state), the scan form presents every possible step
  as a manual choice — deliberately, so the app works fully offline without
  a network round-trip before every scan. The person scanning is standing at
  the physical handover and knows which step they're performing.
- **Failed syncs beyond a network error aren't retried indefinitely with
  backoff** — a queued item just waits for the next reconnect event or
  manual "Sync now" tap; there's no exponential-backoff retry scheduler.
- **No push notifications** for sync failures or newly-raised alerts — the
  scanner is a custody-recording tool, not a monitoring dashboard (that's
  the web app's job).
