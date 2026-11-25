import client from './client';

export const getPendingDocumentCount = () => client.get('/documents/pending-count');

export const getRequiredDocuments = () => client.get('/documents/required');

export const createRequiredDocument = (data) => client.post('/documents/required', data);

export const updateRequiredDocument = (id, data) => client.put(`/documents/required/${id}`, data);

export const archiveRequiredDocument = (id, archived) =>
  client.post(`/documents/required/${id}/archive`, { archived });

export const getDocumentOverview = () => client.get('/documents/overview');

export const getDocumentChecklist = (employeeId) => client.get(`/documents/employees/${employeeId}`);

export const uploadDocument = (employeeId, documentId, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/documents/employees/${employeeId}/${documentId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getDocumentFile = (fileId) => client.get(`/documents/files/${fileId}`, { responseType: 'blob' });

export const reviewDocument = (fileId, decision, note = '') =>
  client.post(`/documents/files/${fileId}/review`, { decision, note });

// Other documents on an employee's file
export const getOtherDocuments = (employeeId) => client.get(`/employees/${employeeId}/documents`);

export const uploadOtherDocument = (employeeId, name, file) => {
  const form = new FormData();
  form.append('name', name);
  form.append('file', file);
  return client.post(`/employees/${employeeId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getOtherDocumentFile = (employeeId, id) =>
  client.get(`/employees/${employeeId}/documents/${id}/file`, { responseType: 'blob' });

export const deleteOtherDocument = (employeeId, id) => client.delete(`/employees/${employeeId}/documents/${id}`);
