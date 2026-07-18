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

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        className="glass-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderRadius: 0,
          borderLeft: 'none',
          borderRight: 'none',
          borderTop: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'var(--gradient-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700 }}>Nexa Solutions</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Platform Console</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {admin?.full_name} ({admin?.email})
          </span>
          <button onClick={handleLogout} className="btn-icon btn-ghost" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
