// Unit tests for src/llm/ — Job A (tagQuestion) and Job B (balanceTopics).
// No DB, no server, no real API key: every LLM call is mocked at the
// fetch() layer, matching this project's existing no-DB unit-test pattern
// (see anomaly.test.js). Covers the happy path, malformed/untrustworthy
// output, and timeout for both jobs — the same three cases
// docs/llm-integration.md's fail-closed section commits to handling.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
const { LlmError } = require('../src/llm/client');
const { tagQuestion } = require('../src/llm/tagQuestion');
const { balanceTopics } = require('../src/llm/balanceTopics');
const { ApiError } = require('../src/middleware/errorHandler');
const Question = require('../src/models/Question');
const { expandBlueprint, buildPools } = require('../src/papers/generation.service');

// Mimics Groq's OpenAI-compatible response shape (choices[0].message.content),
// with response_format: 'json_object' meaning that content is already a
// bare JSON string — no markdown fence or prefill trick to undo.
function mockOkResponse(jsonObject) {
  return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(jsonObject) } }] }) };
}

test.beforeEach(() => {
  env.llm.apiKey = 'test-key';
  env.llm.timeoutMs = 200; // short, so the timeout test doesn't slow the suite
  env.llm.retryDelayMs = 5; // short, so the retry-backoff tests don't slow the suite
});

// ─── Job A: tagQuestion ───

test('tagQuestion: happy path fills a missing topic and keeps provided fields', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    mockOkResponse({ topic: 'Thermodynamics', difficulty: 'MEDIUM', marks: 4 })
  );

  const result = await tagQuestion({
    text: 'Explain the second law of thermodynamics.',
    subject: 'Physics',
    difficulty: 'EASY', // already set — must be kept, not overwritten by the mocked MEDIUM
    marks: 2, // already set — must be kept
  });

  assert.deepEqual(result, { topic: 'Thermodynamics', difficulty: 'EASY', marks: 2 });
});

test('tagQuestion: skips the LLM entirely when nothing is missing', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not have been called');
  });

  const result = await tagQuestion({ text: 'x', subject: 'Physics', topic: 'Optics', difficulty: 'EASY', marks: 2 });

  assert.deepEqual(result, { topic: 'Optics', difficulty: 'EASY', marks: 2 });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('tagQuestion: LLM API failure surfaces as LlmError, not a silent default', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, text: async () => 'upstream error' }));

  await assert.rejects(
    () => tagQuestion({ text: 'x', subject: 'Physics' }),
    (err) => err instanceof LlmError
  );
});

test('tagQuestion: malformed output (invalid difficulty) is rejected, not passed through', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ topic: 'Optics', difficulty: 'IMPOSSIBLE', marks: 3 }));

  await assert.rejects(
    () => tagQuestion({ text: 'x', subject: 'Physics' }),
    (err) => err instanceof LlmError && /difficulty/i.test(err.message)
  );
});

test('tagQuestion: malformed output (non-integer marks) is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ topic: 'Optics', difficulty: 'EASY', marks: 'a lot' }));

  await assert.rejects(
    () => tagQuestion({ text: 'x', subject: 'Physics' }),
    (err) => err instanceof LlmError && /marks/i.test(err.message)
  );
});

test('tagQuestion: a hung API call times out cleanly instead of hanging', async (t) => {
  t.mock.method(globalThis, 'fetch', (url, opts) => {
    return new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });

  await assert.rejects(
    () => tagQuestion({ text: 'x', subject: 'Physics' }),
    (err) => err instanceof LlmError && /timed out/i.test(err.message)
  );
});

test('tagQuestion: not configured (no API key) fails clearly, not silently', async () => {
  env.llm.apiKey = '';
  await assert.rejects(
    () => tagQuestion({ text: 'x', subject: 'Physics' }),
    (err) => err instanceof LlmError && /not configured/i.test(err.message)
  );
});

// ─── Retry-with-backoff (real behavior caught live: a 38-question bulk
// PDF import hit a genuine transient 503 "high demand" from the free
// tier partway through) ───

test('callLlmForJson: a transient 503 is retried and can still succeed', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls < 3) return { ok: false, status: 503, text: async () => 'high demand' };
    return mockOkResponse({ topic: 'Optics', difficulty: 'EASY', marks: 2 });
  });

  const result = await tagQuestion({ text: 'x', subject: 'Physics' });

  assert.equal(calls, 3);
  assert.deepEqual(result, { topic: 'Optics', difficulty: 'EASY', marks: 2 });
});

test('callLlmForJson: a persistent 503 still fails loudly after exhausting retries', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return { ok: false, status: 503, text: async () => 'high demand' };
  });

  await assert.rejects(
    () => tagQuestion({ text: 'x', subject: 'Physics' }),
    (err) => err instanceof LlmError && /503/.test(err.message)
  );
  assert.equal(calls, 3, 'should try 3 times total, not more, not fewer');
});

test('callLlmForJson: a non-retryable status (e.g. 400) fails immediately, no retries wasted', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return { ok: false, status: 400, text: async () => 'bad request' };
  });

  await assert.rejects(() => tagQuestion({ text: 'x', subject: 'Physics' }), LlmError);
  assert.equal(calls, 1);
});

// ─── Job B: balanceTopics ───

test('balanceTopics: happy path returns a validated distribution summing to the total', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ Thermodynamics: 3, Optics: 2 }));

  const result = await balanceTopics({
    subject: 'Physics',
    difficulty: 'EASY',
    totalCount: 5,
    availability: { Thermodynamics: 10, Optics: 10 },
  });

  assert.deepEqual(result, { Thermodynamics: 3, Optics: 2 });
});

test('balanceTopics: skips the LLM when there is only one topic to balance across', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not have been called');
  });

  const result = await balanceTopics({ subject: 'Physics', difficulty: 'EASY', totalCount: 4, availability: { Optics: 10 } });

  assert.deepEqual(result, { Optics: 4 });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('balanceTopics: not enough total supply fails before ever calling the LLM', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch should not have been called');
  });

  await assert.rejects(
    () => balanceTopics({ subject: 'Physics', difficulty: 'EASY', totalCount: 100, availability: { Thermodynamics: 2, Optics: 2 } }),
    (err) => err instanceof ApiError && err.statusCode === 400 && err.failureCode === 'INSUFFICIENT_QUESTIONS'
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('balanceTopics: distribution that does not sum to the requested total is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ Thermodynamics: 2, Optics: 2 })); // sums to 4, asked for 5

  await assert.rejects(
    () =>
      balanceTopics({
        subject: 'Physics',
        difficulty: 'EASY',
        totalCount: 5,
        availability: { Thermodynamics: 10, Optics: 10 },
      }),
    (err) => err instanceof LlmError && /summed to/i.test(err.message)
  );
});

test('balanceTopics: distribution referencing an unknown topic is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ Mechanics: 5 })); // not in availability

  await assert.rejects(
    () => balanceTopics({ subject: 'Physics', difficulty: 'EASY', totalCount: 5, availability: { Thermodynamics: 10, Optics: 10 } }),
    (err) => err instanceof LlmError && /unknown topic/i.test(err.message)
  );
});

test('balanceTopics: distribution exceeding a topic\'s available supply is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ Thermodynamics: 5, Optics: 0 })); // only 3 Thermo available

  await assert.rejects(
    () => balanceTopics({ subject: 'Physics', difficulty: 'EASY', totalCount: 5, availability: { Thermodynamics: 3, Optics: 10 } }),
    (err) => err instanceof LlmError && /available/i.test(err.message)
  );
});

test('balanceTopics: a hung API call times out cleanly instead of hanging', async (t) => {
  t.mock.method(globalThis, 'fetch', (url, opts) => {
    return new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });

  await assert.rejects(
    () =>
      balanceTopics({ subject: 'Physics', difficulty: 'EASY', totalCount: 5, availability: { Thermodynamics: 10, Optics: 10 } }),
    (err) => err instanceof LlmError && /timed out/i.test(err.message)
  );
});

// ─── Regression: generation.service.js's expandBlueprint/buildPools ───
// Real bug, caught live against the real Gemini API (see
// docs/llm-integration.md's Testing section): an untagged question's topic
// is the literal empty string '' (Question.js's schema default), and it
// was being coerced to `undefined` before reaching buildPools, which read
// "topic is undefined" as "no topic filter at all" — silently widening the
// untagged bucket's pool to include every topic, so a question already
// claimed by its own topic's pool could also turn up in the untagged pool
// and get selected twice into the same generated paper.

test('expandBlueprint + buildPools: an untagged-topic bucket only contains genuinely untagged questions, never overlapping a named topic\'s pool', async (t) => {
  env.llm.apiKey = 'test-key';

  const allQuestions = [
    { _id: 'untagged-1', subject: 'Physics', difficulty: 'EASY', topic: '', marks: 1, text: 'untagged 1' },
    { _id: 'untagged-2', subject: 'Physics', difficulty: 'EASY', topic: '', marks: 1, text: 'untagged 2' },
    { _id: 'optics-1', subject: 'Physics', difficulty: 'EASY', topic: 'Optics', marks: 1, text: 'optics 1' },
  ];

  // Mirrors the real Question.find(filter[, projection]) call sites in
  // generation.service.js — filters by whatever's actually in `filter`,
  // so a buggy caller that omits `topic` from the filter gets back every
  // topic, exactly reproducing the real bug's conditions.
  t.mock.method(Question, 'find', (filter) => {
    let results = allQuestions.filter((q) => q.subject === filter.subject && q.difficulty === filter.difficulty);
    if ('topic' in filter) {
      results = results.filter((q) => q.topic === filter.topic);
    }
    return Promise.resolve(results.map((q) => ({ ...q })));
  });

  t.mock.method(globalThis, 'fetch', async () => mockOkResponse({ '': 2, Optics: 1 }));

  const expanded = await expandBlueprint('Physics', [{ difficulty: 'EASY', count: 3 }]);
  const pools = await buildPools('Physics', expanded);

  // poolKey's format, mirrored here rather than exported — see
  // generation.service.js.
  const untaggedPool = pools['::EASY'];
  const opticsPool = pools['Optics::EASY'];

  assert.deepEqual(
    untaggedPool.map((q) => q._id).sort(),
    ['untagged-1', 'untagged-2']
  );
  assert.deepEqual(
    opticsPool.map((q) => q._id),
    ['optics-1']
  );

  const allPoolIds = Object.values(pools).flatMap((pool) => pool.map((q) => q._id));
  assert.equal(new Set(allPoolIds).size, allPoolIds.length, 'the same question appeared in more than one topic\'s pool');
});
