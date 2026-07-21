import { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import { ChevronRight } from 'lucide-react';

import logoImg from '../assets/logo.jpg';

const MOBILE_QUERY = '(max-width: 768px)';

export default function DashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileOpen((v) => !v);
    } else {
      setSidebarOpen((v) => !v);
    }
  };

  const showLabels = isMobile ? true : sidebarOpen;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {isMobile && (
        <div
          className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`}
          onClick={() => setMobileOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside
        className={`glass-card app-sidebar ${!isMobile && !sidebarOpen ? 'collapsed' : ''} ${isMobile && mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: isMobile ? undefined : (sidebarOpen ? 'var(--sidebar-width)' : '72px'),
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          transition: isMobile ? undefined : 'width var(--transition-slow)',
          borderRadius: 0,
          borderRight: '1px solid var(--border-color)',
          borderTop: 'none',
          borderBottom: 'none',
          borderLeft: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Logo Header */}
        <div
          style={{
            padding: '18px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid #f1f5f9',
            minHeight: 'var(--topbar-height)',
          }}
        >
          <img
            src={logoImg}
            alt="Meagle360 Logo"
            style={{
              width: showLabels ? 60 : 36,
              height: showLabels ? 60 : 36,
              borderRadius: '12px',
              objectFit: 'cover',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'width var(--transition-slow), height var(--transition-slow)',
            }}
          />
          {showLabels && (
            <div className="animate-fade-in">
              <div style={{ fontSize: '0.975rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>HRMS Portal</div>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb' }}>MEAGLE360</div>
            </div>
          )}
        </div>

        <Sidebar sidebarOpen={showLabels} permissions={user?.permissions} />

        {/* User Profile */}
        <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <Link to="/profile" className="sidebar-user-block">
            <div
              className="avatar"
              style={{
                width: 36,
                height: 36,
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
              <div style={{ flex: 1, minWidth: 0 }} className="animate-fade-in">
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

      {/* Toggle — sits outside <aside> so its half-overflow isn't clipped by the sidebar's overflow:hidden */}
      {!isMobile && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn-ghost"
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
      )}

      {/* Main Content */}
      <div
        className="app-main"
        style={{
          flex: 1,
          marginLeft: isMobile ? 0 : (sidebarOpen ? 'var(--sidebar-width)' : '72px'),
          transition: 'margin-left var(--transition-slow)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <TopBar onToggleSidebar={handleToggleSidebar} />
        <main className="app-content" style={{ flex: 1, padding: '24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
