import client from './client';

export const getDashboardSummary = () => client.get('/dashboard/summary');

export const getAttendanceOverview = (days = 7) =>
  client.get('/dashboard/attendance-overview', { params: { days } });

export const getLeaveSummary = (year) =>
  client.get('/dashboard/leave-summary', { params: { year } });

export const getLiveStatus = () => client.get('/dashboard/live-status');

export const getOnLeaveToday = () => client.get('/dashboard/on-leave-today');

export const getLeaveInsight = (year) =>
  client.get('/dashboard/leave-insight', { params: { year } });
