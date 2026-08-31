# LeakProofX — 5-Minute Demo Script

A live walkthrough of the whole system: create a paper, move it through
custody, deliberately trigger a rejection (and watch it become an alert),
decrypt it at exam time, and verify the audit trail wasn't tampered with.
Every step is a real API call or a real screen — nothing here is mocked.

**Before you start:** backend running (`npm run dev` or `docker compose up`),
an admin seeded (`npm run seed:admin`), and `BASE=http://localhost:4007/api/v1`
(adjust the port to whatever `.env`'s `PORT` is set to). If you'd rather
click through the web dashboard than run curl, every step below has a
1:1 equivalent screen — noted inline.

```bash
BASE=http://localhost:4007/api/v1
```

## 1. Log in, provision the cast (≈45s)

```bash
ADMIN_TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@leakproofx.local","password":"ChangeMe123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

for role_email in BOARD:board COURIER:courier CENTER:center INVIGILATOR:invigilator; do
  role="${role_email%%:*}"; slug="${role_email##*:}"
  curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"name\":\"Demo $role\",\"email\":\"$slug@leakproofx.local\",\"password\":\"Passw0rd!23\",\"role\":\"$role\"}" \
    > /dev/null
done
```

*(Skip if these accounts already exist — `POST /auth/register` 409s
harmlessly.)* **Web dashboard equivalent:** Admin/Users → Create user.

## 2. Create a paper with `examTime` a minute from now (≈30s)

Setting `examTime` just ahead of "now" means the whole custody chain *and*
the time-locked decrypt both happen live, inside this one demo — no
waiting for a real exam slot.

```bash
BOARD_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"board@leakproofx.local","password":"Passw0rd!23"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

EXAM_TIME=$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat())")

PAPER=$(curl -s -X POST $BASE/papers -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BOARD_TOKEN" \
  -d "{\"title\":\"Demo Paper\",\"examName\":\"Live Demo\",\"content\":\"THE ANSWER IS 42\",\"examTime\":\"$EXAM_TIME\",\"durationMinutes\":60}")

# create returns { paper: {...} } — the paper object is nested, not top-level
PAPER_ID=$(echo $PAPER | python3 -c "import sys,json; print(json.load(sys.stdin)['paper']['_id'])")
QR_TOKEN=$(echo $PAPER | python3 -c "import sys,json; print(json.load(sys.stdin)['paper']['qrToken'])")
echo "Paper $PAPER_ID created, exam at $EXAM_TIME"
```

**Web dashboard equivalent:** Admin/Papers → Schedule paper. Point out:
`content` is already ciphertext in the DB by the time this call returns —
nothing plaintext ever gets written.

## 3. Walk the custody chain, including a deliberate rejection (≈90s)

```bash
COURIER_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"courier@leakproofx.local","password":"Passw0rd!23"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# This one is WRONG on purpose — COURIER isn't authorized for the first
# transition (BOARD hands the paper to the courier, not the reverse) —
# and it's about to become the demo's anomaly alert.
echo "--- deliberate rejection ---"
curl -s -X POST $BASE/tracking/scan -H "Content-Type: application/json" \
  -H "Authorization: Bearer $COURIER_TOKEN" \
  -d "{\"qrToken\":\"$QR_TOKEN\",\"toStep\":\"HANDOVER_TO_COURIER\"}"

echo ""
echo "--- correct: BOARD hands off ---"
curl -s -X POST $BASE/tracking/scan -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BOARD_TOKEN" \
  -d "{\"qrToken\":\"$QR_TOKEN\",\"toStep\":\"HANDOVER_TO_COURIER\"}"

echo ""
echo "--- courier delivers to center ---"
curl -s -X POST $BASE/tracking/scan -H "Content-Type: application/json" \
  -H "Authorization: Bearer $COURIER_TOKEN" \
  -d "{\"qrToken\":\"$QR_TOKEN\",\"toStep\":\"ARRIVED_AT_CENTER\"}"

CENTER_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"center@leakproofx.local","password":"Passw0rd!23"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo ""
echo "--- center stores it, then hands to the exam hall ---"
curl -s -X POST $BASE/tracking/scan -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CENTER_TOKEN" \
  -d "{\"qrToken\":\"$QR_TOKEN\",\"toStep\":\"STORED_IN_VAULT\"}"
curl -s -X POST $BASE/tracking/scan -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CENTER_TOKEN" \
  -d "{\"qrToken\":\"$QR_TOKEN\",\"toStep\":\"HANDOVER_TO_EXAM_HALL\"}"
```

**Mobile app equivalent:** log in as each role, scan the same QR image,
pick the step chip. **Talking point:** the rejected first attempt above
still wrote a `TrackingLog` entry — pull up `GET /tracking/$PAPER_ID` and
show `accepted: false` sitting right alongside the accepted ones.

## 4. Show the alert the rejection created (≈30s)

```bash
sleep 1  # anomaly scoring is async-adjacent to the write; give it a beat
curl -s "$BASE/alerts?paperId=$PAPER_ID" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
```

Point out `triggeredRules: ["R_UNEXPECTED_ROLE"]` and the risk score —
this alert exists purely because step 3's wrong-role attempt happened;
nothing here was seeded. **Web dashboard equivalent:** Alerts page,
filtered to this paper.

## 5. Wait for exam time, then decrypt (≈30s wait + 15s)

```bash
echo "Waiting for examTime..."; sleep 60

INVIGILATOR_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"email":"invigilator@leakproofx.local","password":"Passw0rd!23"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

curl -s -X POST $BASE/papers/$PAPER_ID/decrypt -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INVIGILATOR_TOKEN" -d '{}' | python3 -m json.tool
```

No separate "open for exam" scan is needed first — `decrypt` performs that
`→ OPENED_FOR_EXAM` custody transition itself when the paper is still at
`HANDOVER_TO_EXAM_HALL` (worth calling out: this is the one place a custody
step advances as a side effect of a different endpoint, not a dedicated
`/tracking/scan` call). `"content": "THE ANSWER IS 42"` comes back —
decrypted only because every check passed: right role, right custody
state, and `now >= examTime`. Try this same call again right after step 2
(before waiting) in a second
terminal to show it fail on the time-lock instead, if there's time.

## 6. Verify the audit trail (≈15s)

```bash
npm run verify:chain
```

`Chain OK — N entries verified.` — every login, every custody scan
(accepted *and* rejected), the alert, and the decrypt from this entire demo
are all in that chain, and recomputing it from genesis confirms none of
them were altered after the fact. This is the "leak-proof" part made
concrete: even the operator running this demo can't quietly edit history
without `verify:chain` catching it.

## Closing line

*"Every step you just watched — the encryption, the role check, the
rejected scan, the alert it raised, the time-lock, the audit trail — is
enforced by the backend alone. Neither the web dashboard nor the mobile
scanner app you could swap in for curl has a copy of any of that logic;
they just show you what the server decided."*
