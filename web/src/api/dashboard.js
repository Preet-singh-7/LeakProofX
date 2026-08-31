import { apiClient } from './client';

export async function getSummary() {
  const { data } = await apiClient.get('/dashboard/summary');
  return data; // { papersByStatus, openAlertCount, auditLogCount }
}
