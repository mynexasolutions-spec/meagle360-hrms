import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8015/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
client.interceptors.request.use((config) => {
  console.log(`[API] -> ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  try {
    const token = localStorage.getItem('hrms_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (storageErr) {
    console.error('[API] localStorage.getItem failed:', storageErr);
  }
  return config;
});

// Handle 401 — redirect to login
client.interceptors.response.use(
  (response) => {
    console.log(`[API] <- ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`[API] <- ERROR ${error.config?.url ?? '(unknown url)'}`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
      raw: error,
    });
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem('hrms_token');
      } catch (storageErr) {
        console.error('[API] localStorage.removeItem failed:', storageErr);
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
