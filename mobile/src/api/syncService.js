import { submitScan } from './tracking';
import { getQueue, removeFromQueue, updateQueueItem } from '../storage/scanQueue';
import { extractErrorMessage } from './client';

/**
 * Attempts to submit every pending queued scan, in the order they were
 * recorded (custody transitions are sequential, so submitting out of order
 * would itself produce spurious SKIP_STEP rejections).
 *
 * A scan the server actually rejects (409 — e.g. someone else already
 * advanced this paper's custody while we were offline) is removed from the
 * queue rather than retried forever: retrying an unwinnable request is
 * pointless, and the rejection is already captured server-side (TrackingLog
 * + AuditLog + anomaly evaluation) — that's the point of Phase 1/2's
 * "log rejected attempts too" design. A scan that fails because there's
 * simply no connection (no `error.response` at all) stays in the queue for
 * the next sync attempt.
 */
export async function runSync() {
  const queue = await getQueue();
  const pending = queue.filter((item) => item.status !== 'syncing');

  const results = { succeeded: [], rejected: [], stillPending: [] };

  for (const item of pending) {
    await updateQueueItem(item.id, { status: 'syncing' });
    try {
      await submitScan({
        qrToken: item.qrToken,
        toStep: item.toStep,
        location: item.location,
        deviceId: item.deviceId,
        clientTimestamp: item.clientTimestamp,
      });
      await removeFromQueue(item.id);
      results.succeeded.push(item);
    } catch (err) {
      const isServerRejection = Boolean(err.response);
      if (isServerRejection) {
        await removeFromQueue(item.id);
        results.rejected.push({ ...item, error: extractErrorMessage(err) });
      } else {
        await updateQueueItem(item.id, {
          status: 'pending',
          lastError: extractErrorMessage(err),
          attempts: (item.attempts || 0) + 1,
        });
        results.stillPending.push(item);
      }
    }
  }

  return results;
}
