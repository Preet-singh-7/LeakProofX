import { apiClient } from './client';

export async function listQuestions(filter = {}) {
  const { data } = await apiClient.get('/questions', { params: filter });
  return data.questions;
}

export async function createQuestion(input) {
  const { data } = await apiClient.post('/questions', input);
  return data.question;
}

export async function updateQuestion(id, input) {
  const { data } = await apiClient.patch(`/questions/${id}`, input);
  return data.question;
}

export async function deleteQuestion(id) {
  await apiClient.delete(`/questions/${id}`);
}
