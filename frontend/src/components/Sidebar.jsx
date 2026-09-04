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
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

function isItemVisible(item, permissions, roleName, isPlanExpired) {
  if (isPlanExpired) {
    return item.path === '/subscriptions';
  }
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
  const { isPlanExpired } = useAuth();

  const visibleItems = NAV_CONFIG.filter((item) =>
    isItemVisible(item, permissions, roleName, isPlanExpired)
  );

  return (
    <nav style={{ flex: 1, padding: '20px 12px', overflowY: 'auto' }}>
      {isPlanExpired && sidebarOpen && (
        <div
          style={{
            margin: '0 4px 16px 4px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
          <span>Plan Expired — Locked</span>
        </div>
      )}
      {visibleItems.map((item) => (
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


