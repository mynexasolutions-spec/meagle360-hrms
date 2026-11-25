// Holding any of these makes someone more than a plain employee: they get the
// full employee directory; everyone else gets My Team.
// Keep in sync with DIRECTORY_PERMISSIONS in backend/app/dependencies.py.
const DIRECTORY_PERMISSIONS = [
  'settings:write', 'employees:write', 'attendance:approve', 'leave:approve',
  'expenses:approve', 'payroll:read', 'payroll:write', 'shifts:read', 'shifts:write',
  'helpdesk:manage', 'projects:manage',
  'ats:job:manage', 'ats:applicants:view', 'ats:offer:manage', 'ats:settings:manage',
];

export function hasDirectoryAccess(permissions, roleName) {
  const perms = permissions || {};
  return roleName === 'Admin' || DIRECTORY_PERMISSIONS.some((p) => perms[p]);
}

// Who may open /employees and /employees/:id.
export function canViewEmployees(user) {
  return hasDirectoryAccess(user?.permissions, user?.role_name);
}
