import client from './client';

export const login = (username, password) =>
  client.post('/auth/login', new URLSearchParams({ username, password }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

export const register = (data) => client.post('/auth/register', data);

export const getMe = () => client.get('/auth/me');

export const setPassword = (token, new_password) =>
  client.post('/auth/set-password', { token, new_password });
