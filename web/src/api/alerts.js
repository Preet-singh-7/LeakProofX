import { apiClient } from './client';

export async function listAlerts(filters = {}) {
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.severity) params.severity = filters.severity;
  if (filters.paperId) params.paperId = filters.paperId;
  const { data } = await apiClient.get('/alerts', { params });
  return data.alerts;
}

export async function getAlert(id) {
  const { data } = await apiClient.get(`/alerts/${id}`);
  return data.alert;
}

export async function acknowledgeAlert(id) {
  const { data } = await apiClient.post(`/alerts/${id}/acknowledge`);
  return data.alert;
}

export async function resolveAlert(id, resolution) {
  const { data } = await apiClient.post(`/alerts/${id}/resolve`, resolution ? { resolution } : {});
  return data.alert;
}
