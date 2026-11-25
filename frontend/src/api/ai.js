import client from './client';

export const sendAiChat = (message, history = [], context = {}) =>
  client.post('/ai/chat', { message, history, ...context });

// Saved how-to guides: no AI tokens, no daily limit.
export const getAiGuides = (page) => client.get('/ai/guides', { params: page ? { page } : {} });

export const getAiGuide = (id) => client.get(`/ai/guides/${id}`);

export const getAiDailyDigest = () => client.get('/ai/daily-digest');

export const getAiQuota = () => client.get('/ai/quota');

export const executeAiAction = (payload) =>
  client.post('/ai/execute-action', payload);

export const transcribeVoiceAudio = (audioBlob, filename = 'voice.webm') => {
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  return client.post('/ai/transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
