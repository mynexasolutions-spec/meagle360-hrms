import client from './client';

export const getEmployees = (skip = 0, limit = 100) =>
  client.get(`/employees/?skip=${skip}&limit=${limit}`);

export const getDirectory = (skip = 0, limit = 100) =>
  client.get(`/employees/directory?skip=${skip}&limit=${limit}`);

export const getMyTeam = () => client.get('/employees/my-team');

export const findColleagues = (q) => client.get('/employees/colleagues', { params: { q } });

export const getEmployee = (id) => client.get(`/employees/${id}`);

export const createEmployee = (data) => client.post('/employees/', data);

export const inviteEmployee = (data) => client.post('/employees/invite', data);

export const resendInvite = (id) => client.post(`/employees/${id}/resend-invite`);

export const updateEmployeeRoles = (id, additionalRoleIds) =>
  client.put(`/employees/${id}/roles`, { additional_role_ids: additionalRoleIds });

export const updateEmployee = (id, data) => client.put(`/employees/${id}`, data);

export const deleteEmployee = (id) => client.delete(`/employees/${id}`);

export const getRoles = () => client.get('/roles/');

export const getOrgChart = () => client.get('/employees/org-chart');

export const getDepartments = () => client.get('/departments/');

export const getDepartmentTree = () => client.get('/departments/tree');

export const createDepartment = (data) => client.post('/departments/', data);

export const updateDepartment = (id, data) => client.put(`/departments/${id}`, data);

export const deleteDepartment = (id) => client.delete(`/departments/${id}`);

export const getSites = () => client.get('/sites/');

export const createSite = (data) => client.post('/sites/', data);

export const updateSite = (id, data) => client.put(`/sites/${id}`, data);

export const deleteSite = (id) => client.delete(`/sites/${id}`);

export const getDesignations = () => client.get('/designations/');

export const createDesignation = (data) => client.post('/designations/', data);

export const updateDesignation = (id, data) => client.put(`/designations/${id}`, data);

export const deleteDesignation = (id) => client.delete(`/designations/${id}`);

export const getJobChanges = (id) => client.get(`/employees/${id}/job-changes`);

export const createJobChange = (id, data) => client.post(`/employees/${id}/job-changes`, data);

export const createOfferLetter = (data) => client.post('/employees/offer-letters', data);

export const downloadOfferLetterPdf = (offerId) =>
  client.get(`/employees/offer-letters/${offerId}/pdf`, { responseType: 'blob' });

export const createRelievingLetter = (data) => client.post('/employees/relieving-letters', data);

export const downloadRelievingLetterPdf = (relievingId) =>
  client.get(`/employees/relieving-letters/${relievingId}/pdf`, { responseType: 'blob' });

export const getOrganization = () => client.get('/organization');

export const publishOrganization = (moves) => client.post('/organization/publish', { moves });

export const getScheduledJobChanges = (id) => client.get(`/employees/${id}/job-changes/scheduled`);

export const cancelScheduledJobChange = (id, changeId) =>
  client.delete(`/employees/${id}/job-changes/scheduled/${changeId}`);

export const createVacancy = (data) => client.post('/organization/vacancies', data);

export const updateVacancy = (id, data) => client.put(`/organization/vacancies/${id}`, data);

export const deleteVacancy = (id) => client.delete(`/organization/vacancies/${id}`);
