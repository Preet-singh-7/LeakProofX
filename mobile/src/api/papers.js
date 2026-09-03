import { apiClient } from './client';

/** POST /papers/:id/print — requires a live selfie (accountability evidence, see src/verification/ on the backend). */
export async function printPaper(paperId, { selfieImage, location, deviceId }) {
  const { data } = await apiClient.post(`/papers/${paperId}/print`, { selfieImage, location, deviceId });
  return data; // { title, examName, content }
}
