import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  CalendarDays,
  FileText,
  BarChart3,
  Settings,
  UserCircle,
  GitBranch,
  Receipt,
  Wallet,
} from 'lucide-react';

// permission: a permission key the user must have, or an array (any-of).
// Items with no `permission` are visible to everyone.
const NAV_CONFIG = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/employees', label: 'Employee Directory', icon: Users, permission: 'employees:read' },
  { path: '/org-chart', label: 'Organization', icon: Building2, permission: 'employees:read' },
  { path: '/attendance', label: 'Attendance', icon: Clock, permission: 'attendance:read' },
  { path: '/leave', label: 'Leave', icon: CalendarDays, permission: 'leave:read' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'expenses:read' },
  { path: '/payroll', label: 'Payroll', icon: Wallet, permission: 'payroll:read' },
  { path: '/my-payslips', label: 'My Payslips', icon: Wallet },
  { path: '/shifts', label: 'Shifts', icon: GitBranch, permission: 'shifts:read' },
  { path: '/documents', label: 'Documents', icon: FileText, permission: 'employees:read' },
  { path: '/reports', label: 'Reports & Analytics', icon: BarChart3, permission: ['leave:approve', 'settings:write'] },
  { path: '/settings', label: 'Settings', icon: Settings, permission: 'settings:write' },
  { path: '/profile', label: 'My Profile', icon: UserCircle },
];

function hasPermission(permissions, required) {
  if (!required) return true;
  const perms = permissions || {};
  const list = Array.isArray(required) ? required : [required];
  return list.some((p) => perms[p]);
}

export default function Sidebar({ sidebarOpen, permissions }) {
  const linkStyle = ({ isActive }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
    background: isActive ? 'var(--accent-blue-light)' : 'transparent',
    marginBottom: '4px',
    transition: 'all var(--transition-fast)',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: isActive ? 600 : 400,
  });

  return (
    <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
      {NAV_CONFIG.filter((item) => hasPermission(permissions, item.permission)).map((item) => (
        <NavLink key={item.path} to={item.path} end={item.path === '/'} style={linkStyle}>
          <item.icon size={20} style={{ flexShrink: 0 }} />
          {sidebarOpen && <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
