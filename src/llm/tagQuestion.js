const { callLlmForJson, LlmError } = require('./client');
const { QUESTION_DIFFICULTY_VALUES } = require('../config/constants');

const SYSTEM_PROMPT = `You classify exam questions for a school/college question bank. Given a question's text and subject, infer:
- topic: a short, specific 1-4 word label within the subject (e.g. "Thermodynamics", "Cell Division") — never leave this generic like "General" unless the question truly doesn't fit any specific topic.
- difficulty: one of EASY, MEDIUM, HARD.
- marks: a reasonable integer point value (typically 1-10) based on the question's apparent complexity and expected answer length.
Respond with ONLY a single JSON object in the form {"topic": "...", "difficulty": "EASY|MEDIUM|HARD", "marks": <integer>} — no other text, no markdown fences, no explanation.`;

/**
 * Job A (see docs/llm-integration.md): fills in whichever of
 * topic/difficulty/marks a question is missing, using only that one
 * question's own text — nothing about any other question, any paper, or
 * any schedule. Only ever called for bank content that hasn't been
 * selected into a paper yet (see questions.service.js).
 *
 * Anything already provided is kept as-is and never sent for re-inference
 * — the LLM only fills real gaps.
 */
async function tagQuestion({ text, subject, topic, difficulty, marks }) {
  const needsTopic = !topic;
  const needsDifficulty = !difficulty;
  const needsMarks = marks === undefined || marks === null;

  if (!needsTopic && !needsDifficulty && !needsMarks) {
    return { topic, difficulty, marks };
  }

  const prompt = [
    `Subject: ${subject}`,
    `Question: ${text}`,
    topic ? `Topic is already set to "${topic}" — keep it as-is in your response.` : null,
    difficulty ? `Difficulty is already set to "${difficulty}" — keep it as-is in your response.` : null,
    marks !== undefined && marks !== null ? `Marks is already set to ${marks} — keep it as-is in your response.` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callLlmForJson({ system: SYSTEM_PROMPT, prompt });

  const resolvedTopic = topic || result.topic;
  const resolvedDifficulty = difficulty || result.difficulty;
  const resolvedMarks = marks ?? result.marks;

  if (typeof resolvedTopic !== 'string' || !resolvedTopic.trim()) {
    throw new LlmError(`LLM tagging response has an invalid topic: ${JSON.stringify(result.topic)}`);
  }
  if (!QUESTION_DIFFICULTY_VALUES.includes(resolvedDifficulty)) {
    throw new LlmError(`LLM tagging response has an invalid difficulty: ${JSON.stringify(result.difficulty)}`);
  }
  if (!Number.isInteger(resolvedMarks) || resolvedMarks < 1) {
    throw new LlmError(`LLM tagging response has an invalid marks value: ${JSON.stringify(result.marks)}`);
  }

  return { topic: resolvedTopic.trim(), difficulty: resolvedDifficulty, marks: resolvedMarks };
}

module.exports = { tagQuestion };
