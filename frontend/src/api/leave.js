import client from './client';

export const getLeaveTypes = () => client.get('/leave/types');

export const createLeaveType = (data) => client.post('/leave/types', data);

export const updateLeaveType = (id, data) => client.put(`/leave/types/${id}`, data);

export const requestLeave = (data) => client.post('/leave/request', data);

export const getMyRequests = () => client.get('/leave/my-requests');

export const getPendingRequests = () => client.get('/leave/pending');

export const approveReject = (id, status) =>
  client.put(`/leave/approve/${id}`, { status });

export const getLeaveBalance = (year) =>
  client.get('/leave/balance', { params: { year } });
