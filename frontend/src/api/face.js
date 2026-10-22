import client from './client';

export const getFaceConfig = () => client.get('/face/config');
export const updateFaceConfig = (data) => client.put('/face/config', data);

export const uploadFaceProfile = (formData) =>
  client.post('/face/profile', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const deleteMyFaceProfile = () => client.delete('/face/profile/me');

export const getFaceProfiles = (params = {}) => client.get('/face/profiles', { params });
export const reviewFaceProfile = (id, data) => client.post(`/face/profiles/${id}/review`, data);

export const getFlaggedFaceAttendance = (params = {}) => client.get('/face/flagged', { params });
export const reviewFlaggedFaceAttendance = (id, data) => client.post(`/face/flagged/${id}/review`, data);
