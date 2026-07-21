import axios from 'axios';

const API_BASE = 'http://localhost:8015/api';

// Separate axios instance + token from the tenant client: a platform admin
// and a tenant user can be logged in side by side without clobbering
// each other's session.
const platformClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

platformClient.interceptors.request.use((config) => {
  console.log(`[PLATFORM API] -> ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  try {
    const token = localStorage.getItem('hrms_platform_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (storageErr) {
    console.error('[PLATFORM API] localStorage.getItem failed:', storageErr);
  }
  return config;
});

platformClient.interceptors.response.use(
  (response) => {
    console.log(`[PLATFORM API] <- ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`[PLATFORM API] <- ERROR ${error.config?.url ?? '(unknown url)'}`, {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
      raw: error,
    });
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem('hrms_platform_token');
      } catch (storageErr) {
        console.error('[PLATFORM API] localStorage.removeItem failed:', storageErr);
      }
      window.location.href = '/platform/login';
    }
    return Promise.reject(error);
  }
);

export const platformLogin = (username, password) =>
  platformClient.post('/platform/auth/login', new URLSearchParams({ username, password }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

export const getPlatformMe = () => platformClient.get('/platform/auth/me');

export const listCompanies = () => platformClient.get('/platform/companies');

export const createCompany = (data) => platformClient.post('/platform/companies', data);

export const updateCompanyStatus = (companyId, status) =>
  platformClient.patch(`/platform/companies/${companyId}/status`, { status });

export const inviteCompanyAdmin = (companyId, data) =>
  platformClient.post(`/platform/companies/${companyId}/admin`, data);

export const listCompanyUsers = (companyId) =>
  platformClient.get(`/platform/companies/${companyId}/users`);

export const resendCompanyAdminInvite = (companyId, userAccountId) =>
  platformClient.post(`/platform/companies/${companyId}/users/${userAccountId}/resend-invite`);

export const updateCompany = (companyId, data) =>
  platformClient.patch(`/platform/companies/${companyId}`, data);

export const deleteCompany = (companyId) =>
  platformClient.delete(`/platform/companies/${companyId}`);
