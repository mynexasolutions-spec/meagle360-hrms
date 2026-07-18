import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import { ChevronRight } from 'lucide-react';

export default function DashboardLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside
        className="glass-card"
        style={{
          width: sidebarOpen ? 'var(--sidebar-width)' : '72px',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width var(--transition-slow)',
          borderRadius: 0,
          borderRight: '1px solid var(--border-color)',
          borderTop: 'none',
          borderBottom: 'none',
          borderLeft: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '20px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid var(--border-color)',
            minHeight: 'var(--topbar-height)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'var(--gradient-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '1.1rem',
              fontWeight: 800,
              color: 'white',
            }}
          >
            M
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in">
              <div style={{ fontSize: '0.9375rem', fontWeight: 700 }}>HRMS</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Meagle360</div>
            </div>
          )}
        </div>

        <Sidebar sidebarOpen={sidebarOpen} permissions={user?.permissions} />

        {/* User Profile */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: 'var(--radius-md)' }}>
            <div className="avatar" style={{ background: 'var(--gradient-primary)', fontSize: '0.8rem' }}>
              {user?.full_name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase() || 'U'}
            </div>
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0 }} className="animate-fade-in">
                <div className="truncate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {user?.full_name || 'User'}
                </div>
                <div className="truncate" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {user?.role_name || 'Employee'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn-ghost"
          style={{
            position: 'absolute',
            top: '20px',
            right: '-14px',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <ChevronRight
            size={14}
            style={{
              transform: sidebarOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--transition-base)',
            }}
          />
        </button>
      </aside>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          marginLeft: sidebarOpen ? 'var(--sidebar-width)' : '72px',
          transition: 'margin-left var(--transition-slow)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main style={{ flex: 1, padding: '24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
