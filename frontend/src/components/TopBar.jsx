import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPendingRequests } from '../api/leave';
import { getMyCompany } from '../api/company';
import { Menu, Search, Bell, HelpCircle, ChevronDown, LogOut, User } from 'lucide-react';

export default function TopBar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [company, setCompany] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const canApprove = !!user?.permissions?.['leave:approve'];

  useEffect(() => {
    if (canApprove) {
      getPendingRequests()
        .then((res) => setPendingCount(res.data.length))
        .catch(() => setPendingCount(0));
    }
    getMyCompany()
      .then((res) => setCompany(res.data))
      .catch(() => setCompany(null));
  }, [canApprove]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/employees?q=${encodeURIComponent(search.trim())}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <header
      className="glass-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        height: 'var(--topbar-height)',
        borderRadius: 0,
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <button className="btn-icon btn-ghost topbar-mobile-menu-btn" onClick={onToggleSidebar} title="Toggle sidebar">
        <Menu size={20} />
      </button>

      <form onSubmit={handleSearchSubmit} className="topbar-search topbar-search-form" style={{ flex: 1, maxWidth: 420 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="input-field"
          style={{ paddingLeft: 38, background: 'var(--bg-input)' }}
          placeholder="Search employees, documents, policies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <div style={{ flex: 1 }} />

      <button
        className="btn-icon btn-ghost topbar-icon-btn"
        style={{ position: 'relative' }}
        title="Notifications"
        onClick={() => canApprove && navigate('/leave')}
      >
        <Bell size={20} />
        {pendingCount > 0 && (
          <span
            className="topbar-notif-dot"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              background: 'var(--accent-rose)',
              color: 'white',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.625rem',
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              boxShadow: '0 0 0 2px var(--bg-secondary)',
            }}
          >
            {pendingCount}
          </span>
        )}
      </button>

      <button className="btn-icon btn-ghost topbar-help topbar-icon-btn" title="Help">
        <HelpCircle size={20} />
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`topbar-profile-trigger${menuOpen ? ' open' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          <div className="avatar" style={{ background: 'var(--gradient-primary)', fontSize: '0.8rem' }}>
            {initials}
          </div>
          <div className="topbar-profile-text" style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {company?.name || 'Company'}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{user?.role_name}</div>
          </div>
          <ChevronDown size={14} className="topbar-profile-text topbar-chevron" style={{ color: 'var(--text-muted)' }} />
        </button>

        {menuOpen && (
          <div
            className="glass-card animate-fade-in"
            style={{
              position: 'absolute',
              right: 0,
              top: '110%',
              minWidth: 220,
              padding: 6,
              zIndex: 100,
              boxShadow: '0 12px 32px -8px rgba(15, 23, 42, 0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 12px' }}>
              <div className="avatar" style={{ width: 38, height: 38, background: 'var(--gradient-primary)', fontSize: '0.85rem', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {user?.full_name || 'User'}
                </div>
                <div className="truncate" style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {user?.role_name || 'Employee'}
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border-color)', margin: '0 6px 6px' }} />
            <button
              className="topbar-menu-item"
              onClick={() => { setMenuOpen(false); navigate('/profile'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--text-primary)', fontFamily: 'inherit', fontWeight: 500 }}
            >
              <span className="topbar-menu-icon" style={{ background: 'var(--accent-blue-light)' }}>
                <User size={14} style={{ color: 'var(--accent-blue)' }} />
              </span>
              My Profile
            </button>
            <button
              className="topbar-menu-item danger"
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--accent-rose)', fontFamily: 'inherit', fontWeight: 500 }}
            >
              <span className="topbar-menu-icon" style={{ background: 'var(--accent-rose-light)' }}>
                <LogOut size={14} style={{ color: 'var(--accent-rose)' }} />
              </span>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
