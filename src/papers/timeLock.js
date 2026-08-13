const { env } = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

const MINUTE_MS = 60 * 1000;

/**
 * Generic window check used by decrypt/print endpoints: content must not be
 * reachable long before or long after the scheduled exam time, independent
 * of whatever custody state or role checks also apply.
 */
function assertWithinAccessWindow(examTime, now = new Date()) {
  const preMs = env.timeLock.allowedPreWindowMinutes * MINUTE_MS;
  const postMs = env.timeLock.allowedPostWindowMinutes * MINUTE_MS;
  const earliest = new Date(examTime.getTime() - preMs);
  const latest = new Date(examTime.getTime() + postMs);

  if (now < earliest) {
    throw new ApiError(403, `Too early: access opens at ${earliest.toISOString()}`);
  }
  if (now > latest) {
    throw new ApiError(403, `Too late: access window closed at ${latest.toISOString()}`);
  }
}

/**
 * Strict check for the CUSTODY: HANDOVER_TO_EXAM_HALL -> OPENED_FOR_EXAM
 * transition specifically — no early opening even within the pre-window
 * that governs decrypt/print access generally.
 */
function assertExamTimeReached(examTime, now = new Date()) {
  if (now < examTime) {
    throw new ApiError(403, `Cannot open before scheduled exam time (${examTime.toISOString()})`);
  }
}

module.exports = { assertWithinAccessWindow, assertExamTimeReached };
