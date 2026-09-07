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
    } else if (
      error.response?.status === 402 &&
      error.response?.data?.error_code === 'plan_expired'
    ) {
      // Notify running app / AuthContext
      try {
        window.dispatchEvent(new CustomEvent('plan_expired', { detail: error.response.data }));
      } catch (e) {
        console.error('[API] Failed to dispatch plan_expired event:', e);
      }

      // Safe redirect to /subscriptions if not already on it or on login/platform
      const currentPath = window.location.pathname;
      if (
        !currentPath.startsWith('/subscriptions') &&
        !currentPath.startsWith('/login') &&
        !currentPath.startsWith('/platform')
      ) {
        window.location.href = '/subscriptions';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
