import client from './client';

export const getPolicies = () => client.get('/policies/');

export const getPendingPolicyCount = () => client.get('/policies/pending-count');

export const acknowledgePolicy = (id, version) => client.post(`/policies/${id}/acknowledge`, { version });

export const getManagedPolicies = () => client.get('/policies/manage');

export const createPolicy = (data) => client.post('/policies/manage', data);

export const updatePolicy = (id, data) => client.put(`/policies/manage/${id}`, data);

export const deletePolicy = (id) => client.delete(`/policies/manage/${id}`);

export const publishPolicy = (id, askAgain) =>
  client.post(`/policies/manage/${id}/publish`, { ask_again: askAgain });

export const setPolicyHidden = (id, hidden) => client.post(`/policies/manage/${id}/visibility`, { hidden });

export const resetPolicy = (id) => client.post(`/policies/manage/${id}/reset`);

export const reorderPolicies = (ids) => client.put('/policies/manage/order', { ids });

export const getPolicyVersions = (id) => client.get(`/policies/manage/${id}/versions`);

export const getPolicyReport = (id) => client.get(`/policies/manage/${id}/report`);

export const uploadPolicyPdf = (id, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/policies/manage/${id}/attachment`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const removePolicyPdf = (id) => client.delete(`/policies/manage/${id}/attachment`);

/** `draft` fetches the admin's working copy instead of the published file. */
export const getPolicyPdf = (id, draft = false) =>
  client.get(`/policies/${draft ? 'manage/' : ''}${id}/attachment`, { responseType: 'blob' });
