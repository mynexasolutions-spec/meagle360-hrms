import client from './client';

// ── Salary Components ──────────────────────────────────────
export const getSalaryComponents = () => client.get('/payroll/components');
export const createSalaryComponent = (data) => client.post('/payroll/components', data);
export const updateSalaryComponent = (id, data) => client.put(`/payroll/components/${id}`, data);
export const deleteSalaryComponent = (id) => client.delete(`/payroll/components/${id}`);

// ── Salary Structures ───────────────────────────────────────
export const getSalaryStructures = () => client.get('/payroll/structures');
export const createSalaryStructure = (data) => client.post('/payroll/structures', data);
export const updateSalaryStructure = (id, data) => client.put(`/payroll/structures/${id}`, data);
export const deleteSalaryStructure = (id) => client.delete(`/payroll/structures/${id}`);

// ── Employee Assignments ────────────────────────────────────
export const getAssignmentHistory = (employeeId) => client.get(`/payroll/assignments/${employeeId}`);
export const assignEmployee = (data) => client.post('/payroll/assignments', data);

// ── Payroll Runs ─────────────────────────────────────────────
export const getPayrollRuns = () => client.get('/payroll/runs');
export const createPayrollRun = (data) => client.post('/payroll/runs', data);
export const getRunPayslips = (runId) => client.get(`/payroll/runs/${runId}/payslips`);
export const finalizeRun = (runId) => client.post(`/payroll/runs/${runId}/finalize`);
export const deleteRun = (runId) => client.delete(`/payroll/runs/${runId}`);

// ── Adjustments ──────────────────────────────────────────────
export const addPayslipAdjustment = (payslipId, data) =>
  client.post(`/payroll/payslips/${payslipId}/adjustments`, data);

// ── Self-service ─────────────────────────────────────────────
export const getMyPayslips = () => client.get('/payroll/my-payslips');
