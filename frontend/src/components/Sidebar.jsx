import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  Award,
  ChevronDown,
  UserCheck,
  Briefcase,
  Settings2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';
import botAvatarVideo from '../assets/meagle-bot-bust-transparent.webm';

function MeagleAiLogoIcon({ size = 19 }) {
  const box = size + 5;
  return (
    <span
      aria-label="Meagle 360 AI"
      style={{
        width: box,
        height: box,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-block',
        background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)',
        border: '1px solid #c7d2fe',
        boxShadow: '0 1px 3px rgba(79, 70, 229, 0.25)',
      }}
    >
      <video
        src={`${botAvatarVideo}#t=0.5`}
        muted
        playsInline
        preload="auto"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 18%',
          transform: 'scale(1.35)',
          transformOrigin: 'center 25%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
}

// Option 2 (Zoho People Style Grouping):
// 1. Quick Access (Direct links)
// 2. My Space (Self-Service)
// 3. Team & HR Ops (Management)
// 4. Administration (System & Billing)
const NAV_GROUPS = [
  {
    type: 'direct',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'my-space',
    type: 'group',
    label: 'My Space',
    icon: UserCheck,
    items: [
      { path: '/profile', label: 'My Profile', icon: UserCircle },
      { path: '/attendance', label: 'Attendance', icon: Clock },
      { path: '/leave', label: 'Leave', icon: CalendarDays },
      { path: '/my-payslips', label: 'My Payslips', icon: Wallet, hideIfAdmin: true, hideIfPermission: 'settings:write' },
      { path: '/expenses', label: 'Expenses', icon: Receipt },
      { path: '/documents', label: 'Documents', icon: FileText, hideIfAdmin: true, hideIfPermission: 'settings:write' },
      { path: '/helpdesk', label: 'Helpdesk', icon: LifeBuoy },
    ],
  },
  {
    id: 'hr-ops',
    type: 'group',
    label: 'Team & HR Ops',
    icon: Briefcase,
    items: [
      { path: '/employees', label: 'Employee Directory', icon: Users, permission: ['employees:read', 'settings:write'] },
      { path: '/shifts', label: 'Shifts', icon: GitBranch, permission: ['shifts:read', 'attendance:approve', 'settings:write'] },
      { path: '/payroll', label: 'Payroll', icon: Wallet, permission: ['payroll:read', 'settings:write'] },
      {
        path: '/performance',
        label: 'Performance (PMS)',
        icon: Award,
        permission: ['leave:approve', 'attendance:approve', 'shifts:read', 'payroll:read', 'employees:read', 'settings:write'],
      },
      { path: '/reports', label: 'Reports & Analytics', icon: BarChart3, permission: ['leave:approve', 'settings:write'] },
    ],
  },
  {
    id: 'administration',
    type: 'group',
    label: 'Administration',
    icon: Settings2,
    items: [
      { path: '/settings', label: 'Settings', icon: Settings, permission: 'settings:write' },
      { path: '/subscriptions', label: 'Subscriptions', icon: Crown, permission: 'settings:write' },
    ],
  },
  {
    type: 'direct',
    isBottomAi: true,
    items: [
      {
        path: '/ai-assistant',
        label: 'Meagle 360 AI',
        subtitle: 'Early Access Preview',
        icon: MeagleAiLogoIcon,
        badge: 'AI',
      },
    ],
  },
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
  const location = useLocation();
  const [showAiModal, setShowAiModal] = useState(false);

  // Default state (Hybrid approach):
  // 'My Space' is open by default for quick daily actions (attendance, leave, payslips).
  // 'Team & HR Ops' and 'Administration' are closed by default to avoid clutter,
  // but will auto-expand whenever the active route is inside them.
  const [openGroups, setOpenGroups] = useState({
    'my-space': true,
    'hr-ops': false,
    'administration': false,
  });

  // Automatically ensure the group containing the active page is open
  useEffect(() => {
    NAV_GROUPS.forEach((group) => {
      if (group.type === 'group' && group.items) {
        const matches = group.items.some((item) => {
          if (item.path === '/') return location.pathname === '/';
          return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        });
        if (matches) {
          setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
        }
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const renderLinkItem = (item) => {
    if (item.disabled) {
      return (
        <button
          key={item.path || item.label}
          type="button"
          onClick={() => setShowAiModal(true)}
          className="sidebar-link sidebar-link-disabled"
          title="AI Assistant is coming soon — ask questions about attendance, leave, and your team in natural language."
        >
          <item.icon size={18} />
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
        title={!sidebarOpen ? `${item.label}${item.subtitle ? ` (${item.subtitle})` : ''}` : undefined}
        className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
      >
        <item.icon size={18} />
        {sidebarOpen && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: 0, gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
              <span className="truncate">{item.label}</span>
              {item.subtitle && (
                <span
                  className="truncate"
                  style={{
                    fontSize: '0.675rem',
                    fontWeight: 600,
                    color: '#6366f1',
                    letterSpacing: '0.01em',
                    marginTop: '2px',
                  }}
                >
                  {item.subtitle}
                </span>
              )}
            </div>
            {item.badge && <span className="sidebar-badge-soon">{item.badge}</span>}
          </div>
        )}
      </NavLink>
    );
  };

  return (
    <>
      <nav style={{ flex: 1, padding: '16px 10px', overflowY: 'auto' }}>
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

        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter((item) =>
            isItemVisible(item, permissions, roleName, isPlanExpired)
          );

          if (visibleItems.length === 0) return null;

          // Direct links (Dashboard at top, Meagle 360 AI at bottom)
          if (group.type === 'direct') {
            return (
              <div
                key={`direct-${gIdx}`}
                style={{
                  marginBottom: group.isBottomAi ? 0 : '6px',
                  marginTop: group.isBottomAi ? '16px' : 0,
                  paddingTop: group.isBottomAi ? '10px' : 0,
                  borderTop: group.isBottomAi ? '1px solid #f1f5f9' : 'none',
                }}
              >
                {visibleItems.map((item) => renderLinkItem(item))}
              </div>
            );
          }

          // Collapsible dropdown group (My Space, Team & HR Ops, Administration)
          const isOpen = openGroups[group.id] ?? true;
          const hasActiveChild = visibleItems.some((item) => {
            if (item.path === '/') return location.pathname === '/';
            return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          });

          return (
            <div className="sidebar-group" key={group.id}>
              {sidebarOpen ? (
                <>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`sidebar-group-header ${isOpen ? 'open' : ''} ${hasActiveChild ? 'has-active' : ''}`}
                    aria-expanded={isOpen}
                    title={`Toggle ${group.label}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <group.icon size={15} style={{ flexShrink: 0, opacity: 0.9 }} />
                      <span className="truncate">{group.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {hasActiveChild && !isOpen && <span className="sidebar-active-dot" />}
                      <ChevronDown size={14} className="group-chevron" />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="sidebar-group-items">
                      {visibleItems.map((item) => renderLinkItem(item))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="sidebar-group-divider" />
                  <div className="sidebar-group-items">
                    {visibleItems.map((item) => renderLinkItem(item))}
                  </div>
                </>
              )}
            </div>
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
