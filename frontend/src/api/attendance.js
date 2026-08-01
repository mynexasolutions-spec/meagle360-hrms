import client from './client';

export const clockIn = (data = {}) => client.post('/attendance/clock-in', data);

export const clockOut = (data = {}) => client.post('/attendance/clock-out', data);

export const getClockStatus = () => client.get('/attendance/status');

export const getAttendanceRecords = (params = {}) =>
  client.get('/attendance/records', { params });

export const getTimesheet = (params = {}) =>
  client.get('/attendance/timesheet', { params });

export const getEmployeeOverview = (params = {}) =>
  client.get('/attendance/employee-overview', { params });

export const getHolidays = () => client.get('/attendance/holidays');

export const createHoliday = (data) => client.post('/attendance/holidays', data);

export const updateHoliday = (id, data) => client.put(`/attendance/holidays/${id}`, data);

export const deleteHoliday = (id) => client.delete(`/attendance/holidays/${id}`);

// ── Regularization requests ──────────────────────────────
export const requestRegularization = (data) =>
  client.post('/attendance/regularization-requests', data);

export const getMyRegularizations = () =>
  client.get('/attendance/regularization-requests/my');

export const getPendingRegularizations = () =>
  client.get('/attendance/regularization-requests/pending');

export const getRegularizationHistory = (params = {}) =>
  client.get('/attendance/regularization-requests/history', { params });

export const approveRegularization = (id, status) =>
  client.put(`/attendance/regularization-requests/${id}/approve`, { status });
