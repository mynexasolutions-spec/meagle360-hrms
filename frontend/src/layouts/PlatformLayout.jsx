import { Outlet, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../context/PlatformAuthContext';
import { ShieldCheck, LogOut } from 'lucide-react';

export default function PlatformLayout() {
  const { admin, logout } = usePlatformAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/platform/login');
  };

  const initials = (admin?.full_name || 'A')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header
        className="platform-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #1e1b4b 100%)',
          boxShadow: '0 4px 24px rgba(15, 23, 42, 0.25)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={20} color="white" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>Nexa Solutions</div>
            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: 500, letterSpacing: '0.02em' }}>PLATFORM CONSOLE</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="platform-admin-block" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 14, borderRight: '1px solid rgba(148, 163, 184, 0.25)' }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: '0.75rem', fontWeight: 700,
              }}
            >
              {initials}
            </div>
            <div className="platform-admin-text" style={{ lineHeight: 1.3, minWidth: 0 }}>
              <div className="truncate" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#f1f5f9', maxWidth: 180 }}>{admin?.full_name}</div>
              <div className="truncate" style={{ fontSize: '0.6875rem', color: '#94a3b8', maxWidth: 180 }}>{admin?.email}</div>
            </div>
            <span
              className="platform-admin-badge"
              style={{
                fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em',
                color: '#c4b5fd', background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: 'var(--radius-full)', padding: '3px 9px', marginLeft: 4,
                whiteSpace: 'nowrap',
              }}
            >
              SUPER ADMIN
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, borderRadius: 'var(--radius-md)',
              background: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#cbd5e1', cursor: 'pointer', transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)'; e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)'; }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="platform-main" style={{ maxWidth: 1380, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
