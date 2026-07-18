import client from './client';

export const getAuditLogs = (limit = 100) =>
  client.get('/audit-logs/', { params: { limit } });
