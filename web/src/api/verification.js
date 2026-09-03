import { apiClient } from './client';

export async function listVerificationEvidence({ paperId } = {}) {
  const { data } = await apiClient.get('/verification-evidence', { params: { paperId } });
  return data.evidence;
}

export async function getVerificationEvidence(id) {
  const { data } = await apiClient.get(`/verification-evidence/${id}`);
  return data.evidence;
}
