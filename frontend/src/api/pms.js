import client from './client';

// ── Config, Parameters & Slabs (Admin) ───────────────────────
export const getPmsConfig = () => client.get('/pms/config');
export const updatePmsConfig = (data) => client.put('/pms/config', data);

export const getParameters = (includeInactive = false) =>
  client.get('/pms/parameters', { params: { include_inactive: includeInactive } });
export const createParameter = (data) => client.post('/pms/parameters', data);
export const updateParameter = (id, data) => client.put(`/pms/parameters/${id}`, data);

export const getSlabs = () => client.get('/pms/slabs');
export const createSlab = (data) => client.post('/pms/slabs', data);
export const updateSlab = (id, data) => client.put(`/pms/slabs/${id}`, data);
export const deleteSlab = (id) => client.delete(`/pms/slabs/${id}`);

// ── Cycles ───────────────────────────────────────────────────
export const getCycles = () => client.get('/pms/cycles');
export const createCycle = (data) => client.post('/pms/cycles', data);
export const deleteCycle = (cycleId) => client.delete(`/pms/cycles/${cycleId}`);
export const launchCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/launch`);
export const advanceCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/advance`);
export const finalizeCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/finalize`);
export const releaseCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/release`);
export const closeCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/close`);

export const getCycleParticipants = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/participants`);
export const getCycleCompletion = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/completion`);
export const computeCycleScores = (cycleId) =>
  client.post(`/pms/cycles/${cycleId}/scores/compute`);
export const getCycleScores = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/scores`);
export const setParticipantReviewer = (cycleId, employeeId, reviewerId) =>
  client.put(`/pms/cycles/${cycleId}/participants/${employeeId}/reviewer`, {
    reviewer_id: reviewerId,
  });

// ── Goals & KPI Templates ────────────────────────────────────
export const getGoals = (cycleId, employeeId = null) =>
  client.get(`/pms/cycles/${cycleId}/goals`, {
    params: employeeId ? { employee_id: employeeId } : {},
  });
export const createGoal = (cycleId, data) =>
  client.post(`/pms/cycles/${cycleId}/goals`, data);
export const updateGoal = (goalId, data) =>
  client.put(`/pms/goals/${goalId}`, data);
export const deleteGoal = (goalId) =>
  client.delete(`/pms/goals/${goalId}`);
export const submitGoals = (cycleId) =>
  client.post(`/pms/cycles/${cycleId}/goals/submit`);
export const approveGoals = (cycleId, employeeId) =>
  client.post(`/pms/cycles/${cycleId}/goals/approve`, { employee_id: employeeId });
export const returnGoals = (cycleId, employeeId, reason) =>
  client.post(`/pms/cycles/${cycleId}/goals/return`, {
    employee_id: employeeId,
    reason,
  });
export const recordGoalProgress = (goalId, data) =>
  client.post(`/pms/goals/${goalId}/progress`, data);

export const getKpiTemplates = () => client.get('/pms/kpi-templates');
export const createKpiTemplate = (data) => client.post('/pms/kpi-templates', data);
export const deleteKpiTemplate = (id) => client.delete(`/pms/kpi-templates/${id}`);
export const applyKpiTemplate = (cycleId, templateId, employeeId = null) =>
  client.post(`/pms/cycles/${cycleId}/goals/apply-template`, {
    template_id: templateId,
    employee_id: employeeId,
  });

// ── Rater Tasks & Submissions ────────────────────────────────
export const getMyTasks = () => client.get('/pms/my-tasks');
export const getTaskDetail = (assignmentId) =>
  client.get(`/pms/assignments/${assignmentId}`);
export const submitTaskRatings = (assignmentId, ratings) =>
  client.post(`/pms/assignments/${assignmentId}/submit`, { ratings });

// ── Results, Adjustments, History & Audit ────────────────────
export const getMyResult = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/results/me`);
export const getTeamResults = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/results/team`);
export const getCompanyResults = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/results/company`);
export const adjustParticipantScore = (cycleId, employeeId, data) =>
  client.put(`/pms/cycles/${cycleId}/participants/${employeeId}/adjust-score`, data);

export const getMyHistory = () => client.get('/pms/history/me');
export const getEmployeeHistory = (employeeId) =>
  client.get(`/pms/history/${employeeId}`);
export const getPmsAuditLogs = (cycleId = null) =>
  client.get('/pms/audit-logs', { params: cycleId ? { cycle_id: cycleId } : {} });

// ── Payroll Revisions (Admin) ────────────────────────────────
export const getPayrollRevisions = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/payroll-revisions`);
export const approvePayrollRevision = (revisionId, data) =>
  client.post(`/pms/payroll-revisions/${revisionId}/approve`, data);
export const rejectPayrollRevision = (revisionId, reason) =>
  client.post(`/pms/payroll-revisions/${revisionId}/reject`, { reason });
export const applyPayrollRevision = (revisionId) =>
  client.post(`/pms/payroll-revisions/${revisionId}/apply`);
