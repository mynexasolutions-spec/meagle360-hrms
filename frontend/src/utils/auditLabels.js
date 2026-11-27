// Human-readable labels for audit log entries.
// Unknown codes fall back to a prettified version, so new actions never look raw.

const ACTION_LABELS = {
  'leave.approved': 'Leave approved',
  'leave.rejected': 'Leave rejected',
  'leave.cancelled': 'Leave cancelled',
  'leave.recorded_by_admin': 'Leave recorded by admin',
  'leave.updated_by_admin': 'Leave updated by admin',
  'leave.balance_adjusted': 'Leave balance adjusted',
  'leave.accrue_monthly': 'Monthly leave accrued',
  'employee.created': 'Employee added',
  'employee.updated': 'Employee updated',
  'employee.deleted': 'Employee deleted',
  'employee.invited': 'Employee invited',
  'employee.invite_resent': 'Invite resent',
  'employee.assigned': 'Designation set',
  'employee.promotion': 'Employee promoted',
  'employee.demotion': 'Employee demoted',
  'employee.role_change': 'Designation changed',
  'employee.transfer': 'Employee transferred',
  'employee.change_scheduled': 'Job change scheduled',
  'employee.schedule_cancelled': 'Scheduled change cancelled',
  'department.head_changed': 'Department head changed',
  'vacancy.created': 'Vacant position added',
  'vacancy.removed': 'Vacant position removed',
  'employee.manager_change': 'Manager changed',
  'employee.roles_updated': 'Roles updated',
  'expense.submitted': 'Expense submitted',
  'expense.reimbursed': 'Expense reimbursed',
  'expense_category.created': 'Expense category added',
  'expense_category.updated': 'Expense category updated',
  'bank_details.requested': 'Bank / PAN change requested',
  'bank_details.approved': 'Bank / PAN change approved',
  'bank_details.rejected': 'Bank / PAN change rejected',
  'bank_details.cancelled': 'Bank / PAN change withdrawn',
  'helpdesk.ticket_created': 'Ticket created',
  'helpdesk.replied': 'Ticket reply added',
  'helpdesk.status_open': 'Ticket reopened',
  'helpdesk.status_in_progress': 'Ticket in progress',
  'helpdesk.status_resolved': 'Ticket resolved',
  'helpdesk.status_closed': 'Ticket closed',
  'payroll.run_created': 'Payroll run created',
  'payroll.finalized': 'Payroll finalized',
  'payroll.adjustment_added': 'Payslip adjustment added',
  'payroll.fnf_initiated': 'Full & final started',
  'payroll.fnf_processed': 'Full & final processed',
  'policy.created': 'Policy added',
  'policy.updated': 'Policy edited',
  'policy.reset': 'Policy reset to default',
  'policy.published': 'Policy published',
  'policy.hidden': 'Policy hidden',
  'policy.shown': 'Policy shown again',
  'policy.deleted': 'Policy deleted',
  'document.created': 'Required document added',
  'document.updated': 'Required document edited',
  'document.archived': 'Required document archived',
  'document.restored': 'Required document restored',
  'document.uploaded': 'Document uploaded',
  'document.deleted': 'Document deleted',
  'document.verified': 'Document verified',
  'document.rejected': 'Document rejected',
  'announcement.created': 'Announcement posted',
  'ats.candidate_hired': 'Candidate hired',
  'ats.hiring_team.roles_updated': 'Hiring team updated',
  office_location_added: 'Office location added',
  office_location_updated: 'Office location updated',
  office_location_removed: 'Office location removed',
  face_photo_submitted: 'Face photo submitted',
  face_photo_approved: 'Face photo approved',
  face_photo_rejected: 'Face photo rejected',
  face_flag_approved: 'Face flag approved',
  face_flag_rejected: 'Face flag rejected',
  face_profile_deactivated: 'Face profile deactivated',
  face_verification_enabled: 'Face verification enabled',
  face_verification_disabled: 'Face verification disabled',
};

const ENTITY_LABELS = {
  leave_request: 'Leave request',
  leave_type: 'Leave type',
  leave_balance: 'Leave balance',
  employee: 'Employee',
  expense_claim: 'Expense claim',
  expense_category: 'Expense category',
  bank_detail_request: 'Bank / PAN change',
  helpdesk_ticket: 'Helpdesk ticket',
  payroll_run: 'Payroll run',
  payslip: 'Payslip',
  fnf_settlement: 'Full & final settlement',
  announcement: 'Announcement',
  company_policy: 'Company policy',
  required_document: 'Employee document',
  employee_document: 'Employee document',
  vacant_position: 'Vacant position',
  office_location: 'Office location',
  attendance_record: 'Attendance record',
  attendance_regularization: 'Attendance regularization',
  employee_face_profile: 'Face profile',
  employee_location_request: 'Location request',
  overtime_request: 'Overtime request',
};

const prettify = (code = '') => {
  const text = code.replace(/[._]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const actionLabel = (action) => ACTION_LABELS[action] || prettify(action);

export const entityLabel = (entityType) => ENTITY_LABELS[entityType] || prettify(entityType);

// Tone for the action chip: green / red / neutral.
export const actionTone = (action = '') => {
  if (/(approved|reimbursed|hired|created|added|enabled|resolved|finalized)/.test(action)) return 'success';
  if (/(rejected|deleted|removed|deactivated|disabled|cancelled)/.test(action)) return 'danger';
  return 'neutral';
}
