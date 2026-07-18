import client from './client';

export const getAnnouncements = (limit = 10) =>
  client.get('/announcements/', { params: { limit } });

export const createAnnouncement = (data) => client.post('/announcements/', data);
