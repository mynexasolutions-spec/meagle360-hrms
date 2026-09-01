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
  CheckSquare,
} from 'lucide-react';

// permission: a permission key the user must have, or an array (any-of).
// Items with no `permission` are visible to everyone.
const NAV_CONFIG = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/employees', label: 'Employee Directory', icon: Users, permission: 'employees:read' },
  { path: '/attendance', label: 'Attendance', icon: Clock, permission: 'attendance:read' },
  { path: '/leave', label: 'Leave', icon: CalendarDays, permission: 'leave:read' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'expenses:read' },
  { path: '/payroll', label: 'Payroll', icon: Wallet, permission: 'payroll:read' },
  { path: '/my-payslips', label: 'My Payslips', icon: Wallet },
  { path: '/action-tracker', label: 'Action Tracker', icon: CheckSquare },
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
  return (
    <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
      {NAV_CONFIG.filter((item) => hasPermission(permissions, item.permission)).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        >
          <item.icon size={19} />
          {sidebarOpen && <span>{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
