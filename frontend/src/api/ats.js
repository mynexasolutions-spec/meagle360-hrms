import client from './client';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// ── Protected ATS Job Openings Endpoints ────────────────

export const getJobOpenings = (params) => client.get('/ats/jobs', { params });

export const getJobOpening = (id) => client.get(`/ats/jobs/${id}`);

export const createJobOpening = (data) => client.post('/ats/jobs', data);

export const updateJobOpening = (id, data) => client.put(`/ats/jobs/${id}`, data);

export const deleteJobOpening = (id) => client.delete(`/ats/jobs/${id}`);

export const getAtsDropdowns = () => client.get('/ats/departments-and-designations');

// ── Public Careers Portal Endpoints (No Login Required) ──

export const getPublicCareers = (tenantSubdomain) => {
  const params = tenantSubdomain ? { tenant: tenantSubdomain } : {};
  return axios.get(`${API_BASE}/ats/public/careers`, {
    params,
    headers: tenantSubdomain ? { 'X-Tenant-Subdomain': tenantSubdomain } : {},
  });
};

export const submitPublicApplication = (formData, tenantSubdomain) => {
  const params = tenantSubdomain ? { tenant: tenantSubdomain } : {};
  return axios.post(`${API_BASE}/ats/public/apply`, formData, {
    params,
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(tenantSubdomain ? { 'X-Tenant-Subdomain': tenantSubdomain } : {}),
    },
  });
};


// ── Phase 2: Applicants & Application Detail Endpoints ────

export const getAtsStages = () => client.get('/ats/stages');

export const getApplicants = (params) => client.get('/ats/applicants', { params });

export const getApplicationDetail = (id) => client.get(`/ats/applications/${id}`);

export const getResumeBlob = (id) =>
  client.get(`/ats/applications/${id}/resume-blob`, {
    responseType: 'blob',
  });

export const changeApplicationStage = (id, data) =>
  client.post(`/ats/applications/${id}/change-stage`, data);

export const addApplicationNote = (id, data) =>
  client.post(`/ats/applications/${id}/notes`, data);

export const bulkShortlistApplications = (data) =>
  client.post('/ats/applications/bulk-shortlist', data);


// ── Phase 3: Interviews & ATS Settings Endpoints ──────────

export const getRoundTemplates = () => client.get('/ats/settings/round-templates');

export const createRoundTemplate = (data) => client.post('/ats/settings/round-templates', data);

export const toggleRoundTemplate = (id, isActive) =>
  client.put(`/ats/settings/round-templates/${id}/toggle`, null, {
    params: { is_active: isActive },
  });

export const getRejectionReasons = () => client.get('/ats/settings/rejection-reasons');

export const createRejectionReason = (reason) => {
  const fd = new FormData();
  fd.append('reason', reason);
  return client.post('/ats/settings/rejection-reasons', fd);
};

export const getEligibleInterviewers = () => client.get('/ats/interviewers');

export const createInterview = (data) => client.post('/ats/interviews', data);

export const assignInterviewer = (interviewId, data) =>
  client.post(`/ats/interviews/${interviewId}/assign`, data);

export const setInterviewSlot = (interviewId, data) =>
  client.post(`/ats/interviews/${interviewId}/slot`, data);

export const submitInterviewFeedback = (interviewId, data) =>
  client.post(`/ats/interviews/${interviewId}/feedback`, data);

export const getAdminInterviews = (params) => client.get('/ats/interviews', { params });

export const getMyInterviews = () => client.get('/ats/my-interviews');


// ── Phase 4: Offer and Hired Endpoints ───────────────────

export const createOffer = (applicationId, data) =>
  client.post(`/ats/applications/${applicationId}/offers`, data);

export const getOffers = (applicationId) =>
  client.get(`/ats/applications/${applicationId}/offers`);

export const updateOfferStatus = (offerId, data) =>
  client.put(`/ats/offers/${offerId}/status`, data);

export const getOfferPrintData = (offerId) =>
  client.get(`/ats/offers/${offerId}/print-data`);

export const convertToEmployee = (applicationId, data) =>
  client.post(`/ats/applications/${applicationId}/convert-to-employee`, data);


// ── Careers Page Settings ────────────────────────────────

export const getCareersSettings = () =>
  client.get('/ats/careers-settings');

export const updateCareersSettings = (data) =>
  client.put('/ats/careers-settings', data);


// ── Hiring Team & Role Assignment ────────────────────────

export const getHiringTeam = () =>
  client.get('/ats/hiring-team');

export const updateHiringTeamRoles = (employeeId, data) =>
  client.put(`/ats/hiring-team/${employeeId}/roles`, data);



