import client from './client';

export const clockIn = (data = {}) => client.post('/attendance/clock-in', data);

export const clockOut = () => client.post('/attendance/clock-out');

export const getAttendanceRecords = (params = {}) =>
  client.get('/attendance/records', { params });

export const getTimesheet = (params = {}) =>
  client.get('/attendance/timesheet', { params });

export const getEmployeeOverview = (params = {}) =>
  client.get('/attendance/employee-overview', { params });

export const getHolidays = () => client.get('/attendance/holidays');

export const createHoliday = (data) => client.post('/attendance/holidays', data);

// ── Regularization requests ──────────────────────────────
export const requestRegularization = (data) =>
  client.post('/attendance/regularization-requests', data);

export const getMyRegularizations = () =>
  client.get('/attendance/regularization-requests/my');

export const getPendingRegularizations = () =>
  client.get('/attendance/regularization-requests/pending');

export const approveRegularization = (id, status) =>
  client.put(`/attendance/regularization-requests/${id}/approve`, { status });
