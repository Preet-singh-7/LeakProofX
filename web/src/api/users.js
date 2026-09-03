import { apiClient } from './client';

export async function listUsers() {
  const { data } = await apiClient.get('/users');
  return data.users;
}

export async function getUser(id) {
  const { data } = await apiClient.get(`/users/${id}`);
  return data.user;
}

export async function deactivateUser(id) {
  const { data } = await apiClient.post(`/users/${id}/deactivate`);
  return data.user;
}

export async function setIdProof(id, idProofImage) {
  const { data } = await apiClient.post(`/users/${id}/id-proof`, { idProofImage });
  return data.user;
}
