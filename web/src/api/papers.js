import { apiClient } from './client';

export async function listPapers() {
  const { data } = await apiClient.get('/papers');
  return data.papers;
}

export async function getPaper(id) {
  const { data } = await apiClient.get(`/papers/${id}`);
  return data.paper;
}

export async function getPaperQr(id) {
  const { data } = await apiClient.get(`/papers/${id}/qr`);
  return data; // { paperId, dataUrl }
}

export async function createPaper(input) {
  const { data } = await apiClient.post('/papers', input);
  return data.paper;
}

export async function generatePapers(input) {
  const { data } = await apiClient.post('/papers/generate', input);
  return data.papers;
}

export async function decryptPaper(id, { location, deviceId } = {}) {
  const { data } = await apiClient.post(`/papers/${id}/decrypt`, { location, deviceId });
  return data; // { title, examName, content }
}

export async function printPaper(id, { location, deviceId, selfieImage } = {}) {
  const { data } = await apiClient.post(`/papers/${id}/print`, { location, deviceId, selfieImage });
  return data;
}
