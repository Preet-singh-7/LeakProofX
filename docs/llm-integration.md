# LeakProofX — LLM Integration

An LLM is used in exactly two places in this system, both inside
`src/llm/`. This document is the design record for where it's allowed to
touch content, where it categorically isn't, and why — because this
project's entire purpose is exam-leak prevention, and an LLM integration
that isn't scoped carefully is itself a leak vector.

## The two jobs

### Job A — Tagging (`src/llm/tagQuestion.js`)

Runs at question-bank creation time (`questions.service.js`'s
`createQuestion`, invisibly as part of the existing `POST /questions`
flow — manual entry and PDF import both go through it). If a submitted
question is missing `topic`, `difficulty`, or `marks`, that question's own
text is sent to the LLM, which infers the missing fields. Anything already
provided is kept as-is and never re-sent for inference.

This is the only point in the system where the LLM ever sees a question's
actual text — and it only happens for bank content that has not yet been
selected into any paper.

### Job B — Balancing (`src/llm/balanceTopics.js`)

Runs at paper-generation time (`generation.service.js`'s
`expandBlueprint`), only for a blueprint row that was left
topic-unspecified. It's given:

- the topic labels already in the bank for that subject/difficulty (from
  Job A or manual tagging)
- how many questions exist per topic
- the row's total count and difficulty

and returns a distribution — e.g. `{"Thermodynamics": 3, "Optics": 2}` for
a 5-question EASY row. **It never receives question text or question
IDs**, only topic names and counts. Once the distribution comes back, a
separate, deterministic step (`pickSelection`, using `crypto.randomInt`
Fisher-Yates, the same one already used for per-center randomization)
fills each topic's slot with actual randomly-selected questions. The LLM
decides the *mix*; it never sees or picks a specific question.

If a blueprint row already names a topic explicitly, Job B is skipped
entirely for that row — no LLM call, no dependency, no possible failure
point. If a row's topic is unspecified but only one topic (or none)
exists in the bank for that subject/difficulty, Job B is also skipped —
there's nothing to balance, and it's one less real-network call that can
fail during a live demo.

## The privacy boundary, and why it's drawn where it is

**The LLM must never receive the content of a question that is part of a
scheduled, assigned, or encrypted paper.** Once a question is selected
into a paper by Job B's random-fill step, it's exam content, and it's
off-limits to any LLM call for the rest of its lifecycle — the same way
`Paper.js` never serializes `contentCipher` or `questionIds` in a routine
response (see `docs/security.md` and the blind-generation note below).

This is a hard line, not a soft preference:

- Job A only ever runs on bank content *before* it's been scheduled into
  anything.
- Job B's input is topic names and counts — never text, never IDs.
- If a future feature seems to need the LLM to see paper-assembled
  content (an already-generated paper's actual text), that is **not** a
  natural extension of this feature. It needs its own explicit design
  review, the same way this one got one, not a quiet addition to
  `tagQuestion`/`balanceTopics`.

### Relationship to blind generation

Separately from the LLM work, `Paper.js`'s `toJSON` strips `questionIds`
from every response — nobody who triggers generation (or reads a paper
back) can see which questions were selected, only ADMIN/AUDITOR via the
dedicated, audit-logged `GET /papers/:id/composition` forensic endpoint.
Job B's output (a topic *distribution*, like "3 Thermo + 2 Optics") is
logged in that paper's `PAPER_CREATED` audit metadata for transparency,
which does **not** weaken that guarantee — knowing a topic-level count
doesn't tell you which specific questions, or in what order, were chosen
from a pool of many.

## Fail-closed, not fail-open

If an LLM call fails, times out, or returns output that doesn't validate,
the calling operation fails with a clear, specific error — question
creation is rejected, or paper generation stops — rather than silently
falling back to an untagged question or an unbalanced pool-everything
draw. This matches the rest of the project's existing security posture
(see `docs/security.md`): a control that can't complete its job doesn't
quietly do a weaker version of it.

Concretely, `src/llm/client.js`'s `callLlmForJson` throws `LlmError` for:

- **Not configured** — `GROQ_API_KEY` isn't set.
- **Timeout** — the request is aborted after `LLM_TIMEOUT_MS` (default
  9000ms) via `AbortController`, so a slow or hung API response fails
  fast and visibly instead of leaving a request — and, in a live demo,
  the UI — hanging indefinitely.
- **Non-2xx response** from the API.
- **Unparseable or malformed output** — `tagQuestion` validates the
  returned `difficulty` is a real enum value and `marks` is a positive
  integer; `balanceTopics` validates the returned distribution only
  references real topics from the input, never exceeds a topic's
  available supply, and sums to exactly the requested total. Nothing the
  LLM returns is trusted without checking it first.

`questions.service.js` and `generation.service.js` both wrap `LlmError`
into an `ApiError(502, ...)` with a message that names what failed and
why (`LLM_TAGGING_FAILED` / `LLM_BALANCING_FAILED`), so the failure
reaches the UI as a real, specific error banner — not a blank screen or
an infinite spinner.

## Provider: hosted now, self-hostable later by design

This uses the hosted Groq API (`src/llm/client.js`, OpenAI-compatible Chat
Completions format, model configured via `LLM_MODEL`, default
`openai/gpt-oss-20b`), on Groq's free tier — chosen specifically so
this feature costs nothing to run or demo. For this project's timeline —
a live, judged demo a few weeks out — a local/self-hosted model was
deliberately not attempted either: it adds real infrastructure risk
(setup time, compute requirements, reliability under demo conditions)
that isn't worth taking on this close to presenting.

This is actually the *second* free-tier provider used during development.
The first pass used Gemini, which worked correctly but turned out to have
a daily quota too tight for this project's real usage pattern — a single
PDF import can legitimately need 30-40+ Job A calls in one bulk "add all"
action, and that alone was enough to exhaust a day's free quota during
testing. Groq's free tier is more generous for this kind of
short-request, high-frequency workload. If Groq's limits ever prove too
tight too, the fix is the same contained swap described below, not a
redesign.

That said, a real institutional deployment of this system should
seriously consider a self-hosted model instead of any hosted API. The
question bank may be under institutional confidentiality, and sending any
of it to a third-party API — even scoped as tightly as Job A/B are here —
is a trust boundary a real exam board may not be willing to accept. This
integration is built so that swap is a contained change:

- Every LLM call goes through exactly one function —
  `callLlmForJson` in `src/llm/client.js`. `tagQuestion.js` and
  `balanceTopics.js` know nothing about HTTP, API keys, or which provider
  is in use; they just call it and get back a JSON object.
- Swapping providers — to a self-hosted model, or a different hosted
  API — means replacing `callLlmForJson`'s implementation (point it at a
  different endpoint and adjust the request/response shape) — not
  touching either job's logic, prompts, or validation. This has already
  happened twice during development (Anthropic → Gemini, for demo-cost
  reasons; then Gemini → Groq, after Gemini's free-tier daily quota proved
  too tight for real usage) — each swap touched only this one file.
- The API key lives behind the same env-var pattern as every other secret
  in this project (`src/config/env.js`'s `env.llm`, `.env`'s
  `GROQ_API_KEY`) — not hardcoded, not a separate secrets mechanism.

## Testing

`test/llm.test.js` covers both jobs against a mocked `fetch` — no real API
key needed to run the suite. For each job: the happy path, skip-when-
unnecessary (nothing missing / only one topic), API failure, malformed
output (invalid difficulty, non-integer marks, distribution that doesn't
sum correctly, distribution naming an unknown topic, distribution
exceeding available supply), timeout, and "not configured."

Both jobs were also verified against the real database with a mocked LLM
response (a one-off script, not part of the permanent suite) — confirming
Job A's tag actually gets written to a real `Question` document with a
real audit-log entry, and Job B's distribution actually produces a
generated paper whose selected questions genuinely span multiple topics
from a deliberately lopsided bank (10 questions in one topic, 2 in
another), not concentrated in one. The fail-closed path was verified live
too, against the real running backend with no API key configured: both
`POST /questions` (missing topic) and `POST /papers/generate` (topic-
unspecified row, multiple topics in the bank) return a clear `502` and
create nothing, while a fully-specified question, an explicit-topic
blueprint row, and a single-topic bank all correctly skip the LLM
entirely and succeed immediately.

### A real bug the mocked tests didn't catch

Once a real API key was wired in, the very first live Job B run against a
bank with an untagged bucket (`topic: ''`) produced a generated paper with
the **same question selected twice**. Root cause, in
`generation.service.js`'s `expandBlueprint`: the untagged bucket's key
(the literal empty string `''`, `Question.js`'s schema default) was being
coerced to `undefined` before being handed to `buildPools`, which then
read "topic is `undefined`" as "no topic filter at all" rather than
"filter for the untagged bucket specifically." The untagged pool silently
widened to include *every* question regardless of topic — overlapping
with whatever a dedicated single-topic pool had already claimed for that
same generation, so the same question could land in both.

This is exactly why mocked unit tests alone weren't enough here:
`test/llm.test.js` only exercises `tagQuestion`/`balanceTopics` in
isolation, never the surrounding `expandBlueprint`/`buildPools` pipeline
against real data — and a distribution that legitimately includes an
untagged bucket is a normal, expected case, not an edge case, for any
bank that hasn't been fully tagged. Caught by actually running the real
flow end-to-end against the real database per this doc's own verification
checklist, the same way the project's Phase 5 TOCTOU race condition was
(see `docs/security-testing.md`) — not by code review or by the mocked
suite. Fixed by keeping the topic value concrete (including `''`) all the
way through, and re-verified against the real API afterward: the same
scenario that produced the duplicate now produces four distinct
questions, correctly spread across all three topic buckets.

### More real bugs, caught by an actual bulk import of a real document

Once a real question-bank PDF (38 real questions, not a toy sample) was
actually imported through the browser UI, three more real issues turned
up that no amount of mocked testing would have surfaced:

1. **The PDF-import splitter didn't recognize this document's numbering
   convention** (`Q008`, `Q009`, ...) and, worse, PDF text extraction
   collapses real line breaks into plain spaces, so a start-of-line-based
   split silently produced one giant "question" containing the entire
   document. Fixed in `web/src/utils/pdfText.js`: split on the marker
   wherever it appears in the flowing text, and tightened the plain-number
   fallback (`12.`/`12)`) to require real preceding whitespace, not just
   "not another digit" — the initial fix still false-matched reference
   codes like `(25CAT-721)` and `(E17984)` in the document's header.
2. **The bulk "add all" progress indicator counted attempts, not
   successes** — a batch where every single item failed still showed the
   counter climbing to "37 of 38," making a 0%-success run look like it
   was nearly finished. Fixed by tracking added/failed separately and
   showing both.
3. **`/questions` shared the general `adminLimiter` (60 requests /
   15 min)**, sized for typical admin traffic — but importing a real
   question bank legitimately submits one request per question, and a
   38-question import alone can approach that cap on its own, especially
   stacked on other admin activity in the same window. Fixed with a
   dedicated `questionBankLimiter` (300/15min) for `/questions` specifically,
   leaving `/users/*` on the original tighter cap.

Separately — not a bug, but a real operational limit worth recording:
Gemini's free-tier daily quota turned out too tight for this project's
actual bulk-import volume (see "Provider" above) and is why this now runs
on Groq. When that happened mid-batch, `client.js`'s retry-on-503/429
logic meant every failing item was independently retried 3 times before
surfacing — burning through a 38-item batch this way wastes real time for
no benefit once the underlying cause is a quota, not a blip. Fixed
alongside the progress-counter bug: `QuestionBankPage.jsx`'s bulk-add now
stops the batch after 2 consecutive failures (each of which already
survived its own 3 retries) rather than grinding through the rest,
keeping every not-yet-attempted draft for a later retry instead of losing
it.
