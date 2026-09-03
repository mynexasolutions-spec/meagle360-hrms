import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  FileText,
  BarChart3,
  Settings,
  UserCircle,
  GitBranch,
  Receipt,
  Wallet,
  Crown,
} from 'lucide-react';

// permission: a permission key the user must have, or an array (any-of).
// hideIfPermission: a permission key (or array) which, if present, hides this item.
// hideIfAdmin: if true, hides this item for Admin users.
// Items with no `permission` are visible to everyone.
const NAV_CONFIG = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/employees', label: 'Employee Directory', icon: Users, permission: 'settings:write' },
  { path: '/attendance', label: 'Attendance', icon: Clock, permission: 'attendance:read' },
  { path: '/leave', label: 'Leave', icon: CalendarDays, permission: 'leave:read' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'expenses:read' },
  { path: '/payroll', label: 'Payroll', icon: Wallet, permission: 'payroll:read' },
  { path: '/my-payslips', label: 'My Payslips', icon: Wallet, hideIfPermission: 'payroll:read', hideIfAdmin: true },
  { path: '/shifts', label: 'Shifts', icon: GitBranch, permission: 'shifts:read' },
  { path: '/documents', label: 'Documents', icon: FileText, hideIfAdmin: true, hideIfPermission: 'settings:write' },
  { path: '/reports', label: 'Reports & Analytics', icon: BarChart3, permission: ['leave:approve', 'settings:write'] },
  { path: '/settings', label: 'Settings', icon: Settings, permission: 'settings:write' },
  { path: '/profile', label: 'My Profile', icon: UserCircle },
  { path: '/subscriptions', label: 'Subscriptions', icon: Crown, permission: 'settings:write' },
];

function isItemVisible(item, permissions, roleName) {
  const perms = permissions || {};
  const isAdmin = roleName === 'Admin' || !!perms['settings:write'];
  if (item.hideIfAdmin && isAdmin) return false;
  if (item.hideIfPermission) {
    const hideList = Array.isArray(item.hideIfPermission) ? item.hideIfPermission : [item.hideIfPermission];
    if (hideList.some((p) => perms[p])) return false;
  }
  if (!item.permission) return true;
  const list = Array.isArray(item.permission) ? item.permission : [item.permission];
  return list.some((p) => perms[p]);
}

export default function Sidebar({ sidebarOpen, permissions, roleName }) {
  return (
    <nav style={{ flex: 1, padding: '20px 12px', overflowY: 'auto' }}>
      {NAV_CONFIG.filter((item) => isItemVisible(item, permissions, roleName)).map((item) => (
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


