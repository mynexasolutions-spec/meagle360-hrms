import client from './client';

// Employee: own PAN / bank details and their latest change request.
export const getMyBankDetails = () => client.get('/bank-details/me');

// Fields left empty are not changed. proof: optional File (PDF/JPG/PNG, 2 MB).
export const requestBankDetailChange = ({ proof, ...fields }) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => { if (value) form.append(key, value); });
  if (proof) form.append('proof', proof);
  return client.post('/bank-details/me/requests', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const cancelBankDetailRequest = (id) => client.delete(`/bank-details/me/requests/${id}`);

export const lookupIfsc = (code) => client.get(`/bank-details/ifsc/${encodeURIComponent(code)}`);

// HR
export const getBankDetailRequests = (status = 'pending') => client.get('/bank-details/requests', { params: { status } });

export const reviewBankDetailRequest = (id, decision, note) =>
  client.post(`/bank-details/requests/${id}/review`, { decision, note });

export const getBankDetailProof = (id) => client.get(`/bank-details/requests/${id}/proof`, { responseType: 'blob' });
