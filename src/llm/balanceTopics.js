const { callLlmForJson, LlmError } = require('./client');
const { ApiError } = require('../middleware/errorHandler');

const SYSTEM_PROMPT = `You plan syllabus-balanced exam paper composition. Given how many questions are available per topic at a specific difficulty level, and a total number of questions needed at that difficulty, decide how many to draw from each topic so coverage is spread reasonably across the syllabus rather than concentrated in one topic — favor an even spread, but you may weight toward topics with more available questions if an exactly even split isn't possible. Never exceed a topic's available count. Respond with ONLY a single JSON object mapping topic name (verbatim, exactly as given in the input) to an integer count, whose values sum to exactly the requested total. No other text, no markdown fences, no explanation.`;

/**
 * Job B (see docs/llm-integration.md): decides the topic/difficulty mix
 * for a generated paper's blueprint row, using ONLY topic names and
 * question counts — never question text, never question IDs. Its output
 * is a distribution (how many from each topic); a separate, deterministic
 * step in generation.service.js does the actual random question
 * selection. The LLM never sees or picks a specific question.
 *
 * `availability` is a { [topic]: availableCount } map for this subject +
 * difficulty. If there's only one topic (or none) to balance across, this
 * skips the LLM entirely — there's nothing to decide, and it saves a call
 * (real latency/cost, and one less thing that can fail during a demo).
 */
async function balanceTopics({ subject, difficulty, totalCount, availability }) {
  const totalAvailable = Object.values(availability).reduce((sum, n) => sum + n, 0);
  if (totalAvailable < totalCount) {
    throw new ApiError(
      400,
      `Not enough ${difficulty} questions for subject "${subject}" across all topics — need ${totalCount}, have ${totalAvailable}`,
      undefined,
      'INSUFFICIENT_QUESTIONS'
    );
  }

  const topics = Object.keys(availability);
  if (topics.length === 0) return {};
  if (topics.length === 1) return { [topics[0]]: totalCount };

  const prompt = `Subject: ${subject}\nDifficulty: ${difficulty}\nTotal questions needed: ${totalCount}\nAvailable questions per topic: ${JSON.stringify(availability)}`;
  const result = await callLlmForJson({ system: SYSTEM_PROMPT, prompt });

  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new LlmError(`LLM balance response was not a plain object: ${JSON.stringify(result)}`);
  }

  let sum = 0;
  for (const [topic, count] of Object.entries(result)) {
    if (!(topic in availability)) {
      throw new LlmError(`LLM balance response referenced an unknown topic: "${topic}"`);
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new LlmError(`LLM balance response has an invalid count for topic "${topic}": ${JSON.stringify(count)}`);
    }
    if (count > availability[topic]) {
      throw new LlmError(
        `LLM balance response asked for ${count} from topic "${topic}" but only ${availability[topic]} are available`
      );
    }
    sum += count;
  }
  if (sum !== totalCount) {
    throw new LlmError(`LLM balance response summed to ${sum}, expected ${totalCount}`);
  }

  // Drop zero-count topics — nothing downstream needs an explicit "0".
  return Object.fromEntries(Object.entries(result).filter(([, count]) => count > 0));
}

module.exports = { balanceTopics };
