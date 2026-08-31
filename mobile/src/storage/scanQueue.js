import AsyncStorage from '@react-native-async-storage/async-storage';

// Plain AsyncStorage, not SecureStore: queued items are custody metadata
// (which paper, which step, where, when) — not secrets. See
// tokenStorage.js for why tokens specifically use SecureStore instead.
const QUEUE_KEY = 'leakproofx.scanQueue';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue() {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Adds a scan to the offline queue with status 'pending'. clientTimestamp is
 * captured here, at the moment the user actually performed the scan — this
 * is what's preserved through to the server even if sync happens hours
 * later (see api/tracking.js submitScan's clientTimestamp param, and
 * tracking.service.js on the backend which stores it as TrackingLog.timestamp
 * while syncedAt gets the server's real receive time).
 */
export async function enqueueScan({ qrToken, toStep, location, deviceId }) {
  const queue = await readQueue();
  const item = {
    id: generateId(),
    qrToken,
    toStep,
    location: location || null,
    deviceId: deviceId || null,
    clientTimestamp: new Date().toISOString(),
    status: 'pending', // 'pending' | 'syncing' | 'failed'
    lastError: null,
    attempts: 0,
  };
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getQueue() {
  return readQueue();
}

export async function removeFromQueue(id) {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.id !== id));
}

export async function updateQueueItem(id, patch) {
  const queue = await readQueue();
  const next = queue.map((item) => (item.id === id ? { ...item, ...patch } : item));
  await writeQueue(next);
}

export async function getPendingCount() {
  const queue = await readQueue();
  return queue.filter((item) => item.status !== 'syncing').length;
}
