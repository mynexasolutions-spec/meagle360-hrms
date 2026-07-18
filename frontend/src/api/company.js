import client from './client';

export const getMyCompany = () => client.get('/companies/me');

export const updateMyCompany = (data) => client.put('/companies/me', data);
