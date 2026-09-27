import { useState } from 'react';
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
  LifeBuoy,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';

// permission: a permission key the user must have, or an array (any-of).
// hideIfPermission: a permission key (or array) which, if present, hides this item.
// hideIfAdmin: if true, hides this item for Admin users.
// Items with no `permission` are visible to everyone.
const NAV_CONFIG = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/employees', label: 'Employee Directory', icon: Users, permission: ['employees:read', 'settings:write'] },
  { path: '/attendance', label: 'Attendance', icon: Clock },
  { path: '/leave', label: 'Leave', icon: CalendarDays },
  { path: '/expenses', label: 'Expenses', icon: Receipt },
  { path: '/payroll', label: 'Payroll', icon: Wallet, permission: ['payroll:read', 'settings:write'] },
  { path: '/my-payslips', label: 'My Payslips', icon: Wallet, hideIfAdmin: true, hideIfPermission: 'settings:write' },
  { path: '/shifts', label: 'Shifts', icon: GitBranch, permission: ['shifts:read', 'attendance:approve', 'settings:write'] },
  { path: '/documents', label: 'Documents', icon: FileText, hideIfAdmin: true, hideIfPermission: 'settings:write' },
  { path: '/reports', label: 'Reports & Analytics', icon: BarChart3, permission: ['leave:approve', 'settings:write'] },
  {
    path: '#ai-assistant',
    label: 'AI Assistant',
    icon: Sparkles,
    badge: 'Soon',
    disabled: true,
  },
  { path: '/helpdesk', label: 'Helpdesk', icon: LifeBuoy },
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
  if (isAdmin) return true;
  if (!item.permission) return true;
  const list = Array.isArray(item.permission) ? item.permission : [item.permission];
  return list.some((p) => perms[p]);
}

export default function Sidebar({ sidebarOpen, permissions, roleName }) {
  const { isPlanExpired } = useAuth();
  const [showAiModal, setShowAiModal] = useState(false);

  const visibleItems = NAV_CONFIG.filter((item) =>
    isItemVisible(item, permissions, roleName, isPlanExpired)
  );

  return (
    <>
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
        {visibleItems.map((item) => {
          if (item.disabled) {
            return (
              <button
                key={item.path || item.label}
                type="button"
                onClick={() => setShowAiModal(true)}
                className="sidebar-link sidebar-link-disabled"
                title="AI Assistant is coming soon — ask questions about attendance, leave, and your team in natural language."
              >
                <item.icon size={19} />
                {sidebarOpen && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, gap: '8px' }}>
                    <span className="truncate">{item.label}</span>
                    {item.badge && <span className="sidebar-badge-soon">{item.badge}</span>}
                  </div>
                )}
              </button>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <item.icon size={19} />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {showAiModal && (
        <Modal
          title="AI Assistant"
          onClose={() => setShowAiModal(false)}
          closeOnOverlay={true}
        >
          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <Sparkles size={20} style={{ color: '#6366f1', flexShrink: 0 }} />
              <span
                className="sidebar-badge-soon"
                style={{ marginLeft: 0 }}
              >
                Coming Soon
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-secondary, #4b5563)', lineHeight: 1.6 }}>
              AI Assistant is coming soon — ask questions about attendance, leave, and your team in natural language.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowAiModal(false)}
                style={{ padding: '8px 20px', fontSize: '0.875rem' }}
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}


