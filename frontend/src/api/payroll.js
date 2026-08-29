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
export const downloadPayslipPdf = (payslipId) =>
  client.get(`/payroll/payslips/${payslipId}/pdf`, { responseType: 'blob' });

// ── Payroll Policy ───────────────────────────────────────────
export const getPayrollPolicy = () => client.get('/payroll/policy');
export const updatePayrollPolicy = (data) => client.put('/payroll/policy', data);

// ── Tax Slabs ────────────────────────────────────────────────
export const getTaxSlabs = () => client.get('/payroll/tax-slabs');
export const createTaxSlab = (data) => client.post('/payroll/tax-slabs', data);
export const updateTaxSlab = (id, data) => client.put(`/payroll/tax-slabs/${id}`, data);
export const deleteTaxSlab = (id) => client.delete(`/payroll/tax-slabs/${id}`);

// ── Professional Tax Slabs ───────────────────────────────────
export const getPtSlabs = () => client.get('/payroll/pt-slabs');
export const createPtSlab = (data) => client.post('/payroll/pt-slabs', data);
export const updatePtSlab = (id, data) => client.put(`/payroll/pt-slabs/${id}`, data);
export const deletePtSlab = (id) => client.delete(`/payroll/pt-slabs/${id}`);

// ── Employee Loans ───────────────────────────────────────────
export const getEmployeeLoans = (employeeId) => client.get(`/payroll/loans/${employeeId}`);
export const createLoan = (data) => client.post('/payroll/loans', data);
export const closeLoan = (loanId) => client.post(`/payroll/loans/${loanId}/close`);

// ── Gratuity ─────────────────────────────────────────────────
export const getGratuityStatus = (employeeId) => client.get(`/payroll/gratuity/${employeeId}`);

// ── Full & Final Settlement ──────────────────────────────────
export const getAllFnf = () => client.get('/payroll/fnf');
export const getFnfForEmployee = (employeeId) => client.get(`/payroll/fnf/${employeeId}`);
export const initiateFnf = (employeeId, data) => client.post(`/payroll/fnf/${employeeId}/initiate`, data);
export const processFnf = (settlementId) => client.post(`/payroll/fnf/${settlementId}/process`);
