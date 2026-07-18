import client from './client';

export const getEmployees = (skip = 0, limit = 100) =>
  client.get(`/employees/?skip=${skip}&limit=${limit}`);

export const getDirectory = (skip = 0, limit = 100) =>
  client.get(`/employees/directory?skip=${skip}&limit=${limit}`);

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

export const getSites = () => client.get('/sites/');

export const createSite = (data) => client.post('/sites/', data);

export const updateSite = (id, data) => client.put(`/sites/${id}`, data);

export const deleteSite = (id) => client.delete(`/sites/${id}`);

export const getEmployeeDocuments = (employeeId) =>
  client.get(`/employees/${employeeId}/documents`);

export const addEmployeeDocument = (employeeId, data) =>
  client.post(`/employees/${employeeId}/documents`, data);
