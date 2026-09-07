import { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import { ChevronRight, X } from 'lucide-react';

import BottomNav from '../components/BottomNav';
import logoImg from '../assets/logo.jpg';

const MOBILE_QUERY = '(max-width: 768px)';

export default function DashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleToggleSidebar = () => {
    setMobileOpen((v) => !v);
  };

  const showLabels = sidebarOpen || mobileOpen;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      {/* Mobile Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`glass-card app-sidebar ${!sidebarOpen ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          borderRight: '1px solid var(--border-color)',
          borderTop: 'none',
          borderBottom: 'none',
          borderLeft: 'none',
          overflow: 'hidden',
          transition: 'width var(--transition-slow), transform var(--transition-slow)',
        }}
      >
        {/* Logo Header */}
        <div
          style={{
            padding: '18px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f1f5f9',
            minHeight: 'var(--topbar-height)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <img
              src={logoImg}
              alt="Meagle360 Logo"
              style={{
                width: showLabels ? 48 : 36,
                height: showLabels ? 48 : 36,
                borderRadius: '12px',
                objectFit: 'cover',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                transition: 'width var(--transition-slow), height var(--transition-slow)',
              }}
            />
            {showLabels && (
              <div className="sidebar-brand-text animate-fade-in" style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.975rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>HRMS Portal</div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>MEAGLE360</div>
              </div>
            )}
          </div>
          {mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              className="btn-ghost"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b',
                background: '#f1f5f9',
              }}
              title="Close menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <Sidebar sidebarOpen={showLabels} permissions={user?.permissions} roleName={user?.role_name} />

        {/* User Profile */}
        <div style={{ padding: '16px 14px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <Link to="/profile" className="sidebar-user-block">
            <div
              className="avatar"
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
            >
              {user?.full_name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase() || 'U'}
            </div>
            {showLabels && (
              <div style={{ flex: 1, minWidth: 0 }} className="sidebar-user-text animate-fade-in">
                <div className="truncate" style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#0f172a' }}>
                  {user?.full_name || 'User'}
                </div>
                <div className="truncate" style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#64748b' }}>
                  {user?.role_name || 'Employee'}
                </div>
              </div>
            )}
          </Link>
        </div>

      </aside>

      {/* Desktop Collapse Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="btn-ghost sidebar-desktop-toggle"
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        style={{
          position: 'fixed',
          top: '20px',
          left: `calc(${sidebarOpen ? 'var(--sidebar-width)' : '72px'} - 14px)`,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'left var(--transition-slow)',
          zIndex: 101,
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
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

      {/* Main Content Area */}
      <div className={`app-main ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
        <TopBar onToggleSidebar={handleToggleSidebar} />
        <main className="app-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Idea A) */}
      <BottomNav />
    </div>
  );
}
