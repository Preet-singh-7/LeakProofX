import { apiClient } from './client';

export async function getTimeline(paperId) {
  const { data } = await apiClient.get(`/tracking/${paperId}`);
  return data.logs;
}

export async function recordScan({ qrToken, toStep, location, deviceId, clientTimestamp }) {
  const { data } = await apiClient.post('/tracking/scan', { qrToken, toStep, location, deviceId, clientTimestamp });
  return data; // { paper, log }
}
