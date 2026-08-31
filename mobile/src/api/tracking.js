import { apiClient } from './client';

/** Direct online submit — used by the sync job and for an immediate online scan alike. */
export async function submitScan({ qrToken, toStep, location, deviceId, clientTimestamp }) {
  const { data } = await apiClient.post('/tracking/scan', { qrToken, toStep, location, deviceId, clientTimestamp });
  return data; // { paper, log }
}
