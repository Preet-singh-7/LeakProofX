const { env } = require('../config/env');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// 429 (rate limited) and 503 (upstream overloaded) are worth a couple of
// quick retries — everything else (4xx validation errors, auth failures,
// etc.) is retried zero times, since retrying those would just get the
// same answer slower.
const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Any failure in an LLM call — missing key, network error, timeout,
 * non-2xx response, or output that isn't valid/trustworthy JSON — comes
 * through as this. Callers (questions.service.js, generation.service.js)
 * let it propagate as a clear error rather than catching it to silently
 * fall back to untagged/unbalanced behavior. See docs/llm-integration.md's
 * fail-closed section.
 */
class LlmError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'LlmError';
    if (cause) this.cause = cause;
  }
}

/**
 * Calls the hosted Groq API (OpenAI-compatible Chat Completions format)
 * and returns a parsed JSON object.
 *
 * This is the one place that talks to the LLM provider — tagQuestion.js and
 * balanceTopics.js both go through here, and swapping this hosted, free-tier
 * API for a self-hosted/local model (or yet another hosted provider) later
 * means changing this one function's implementation, not either caller.
 * This has already happened twice during development — Anthropic first,
 * then Gemini (switched for demo-cost reasons), then here (switched after
 * Gemini's free-tier daily quota turned out too tight for this project's
 * real bulk-import volume) — each swap touched only this file.
 *
 * `response_format: { type: 'json_object' }` makes Groq return a bare JSON
 * body directly — no markdown fence, no prefill trick needed.
 *
 * A hard timeout (env.llm.timeoutMs, default 9s) *per attempt* means a
 * slow/hung API response fails fast and visibly instead of leaving a
 * request — and, in a live demo, the UI — hanging indefinitely. A
 * transient 429/503 gets up to MAX_ATTEMPTS tries total with a short
 * backoff between them before this gives up and throws — a real-world
 * blip shouldn't fail a whole bulk import over one hiccup, but a
 * persistent failure still fails loudly, same as ever.
 */
async function callLlmForJson({ system, prompt }) {
  if (!env.llm.apiKey) {
    throw new LlmError('LLM is not configured (GROQ_API_KEY is not set)');
  }

  let response;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.llm.timeoutMs);

    try {
      response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.llm.apiKey}`,
        },
        body: JSON.stringify({
          model: env.llm.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new LlmError(`LLM request timed out after ${env.llm.timeoutMs}ms`);
      }
      throw new LlmError(`LLM request failed: ${err.message}`, err);
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) break;
    if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
      const bodyText = await response.text().catch(() => '');
      throw new LlmError(`LLM API returned ${response.status}: ${bodyText.slice(0, 300)}`);
    }
    await sleep(env.llm.retryDelayMs * 2 ** (attempt - 1));
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new LlmError('LLM API response was not valid JSON', err);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new LlmError('LLM response did not contain the expected text content');
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new LlmError(`LLM did not return valid JSON: ${text.slice(0, 300)}`, err);
  }
}

module.exports = { callLlmForJson, LlmError };
