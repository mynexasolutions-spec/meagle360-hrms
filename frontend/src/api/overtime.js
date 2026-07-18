import client from './client';

export const requestOvertime = (data) => client.post('/overtime/request', data);

export const getMyOvertimeRequests = () => client.get('/overtime/my-requests');

export const getPendingOvertimeRequests = () => client.get('/overtime/pending');

export const approveOvertime = (id, status) =>
  client.put(`/overtime/approve/${id}`, { status });
