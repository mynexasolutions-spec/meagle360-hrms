import client from './client';

// ── Settings, appraisal steps and salary hikes (Admin) ───────
export const getPmsConfig = () => client.get('/pms/config');
export const updatePmsConfig = (data) => client.put('/pms/config', data);
export const getSlabs = () => client.get('/pms/slabs');
export const createSlab = (data) => client.post('/pms/slabs', data);
export const deleteSlab = (id) => client.delete(`/pms/slabs/${id}`);
export const finalizeCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/finalize`);
export const releaseCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/release`);
export const closeCycle = (cycleId) => client.post(`/pms/cycles/${cycleId}/close`);
export const adjustParticipantScore = (cycleId, employeeId, data) =>
  client.put(`/pms/cycles/${cycleId}/participants/${employeeId}/adjust-score`, data);
export const getPayrollRevisions = (cycleId) =>
  client.get(`/pms/cycles/${cycleId}/payroll-revisions`);
export const approvePayrollRevision = (revisionId, data) =>
  client.post(`/pms/payroll-revisions/${revisionId}/approve`, data);
export const rejectPayrollRevision = (revisionId, reason) =>
  client.post(`/pms/payroll-revisions/${revisionId}/reject`, { reason });
export const applyPayrollRevision = (revisionId) =>
  client.post(`/pms/payroll-revisions/${revisionId}/apply`);

// ── Monthly reviews ──────────────────────────────────────────
export const getMyMonth = (month = null) =>
  client.get('/pms/monthly', { params: month ? { month } : {} });
export const getTeamMonth = (month, everyone = false) =>
  client.get('/pms/monthly/team', { params: { month, everyone } });
export const addMonthlyGoal = (data) => client.post('/pms/monthly/goals', data);
export const updateMonthlyGoal = (id, data) => client.put(`/pms/monthly/goals/${id}`, data);
export const deleteMonthlyGoal = (id) => client.delete(`/pms/monthly/goals/${id}`);
export const copyMonthlyGoals = (month) => client.post('/pms/monthly/goals/copy', { month });
export const recordMonthlyProgress = (id, data) =>
  client.post(`/pms/monthly/goals/${id}/progress`, data);
export const saveMonthlyNote = (month, note) => client.put('/pms/monthly/note', { month, note });
export const reviewMonth = (data) => client.post('/pms/monthly/review', data);

// ── Yearly appraisals (next steps are the calls above) ──
export const getMyAppraisals = () => client.get('/pms/appraisals/me');
export const getAppraisals = () => client.get('/pms/appraisals');
export const getAppraisal = (id) => client.get(`/pms/appraisals/${id}`);
export const createAppraisal = (data) => client.post('/pms/appraisals', data);
export const deleteAppraisal = (id) => client.delete(`/pms/appraisals/${id}`);
