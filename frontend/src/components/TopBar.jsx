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
      <button className="btn-icon btn-ghost" onClick={onToggleSidebar} title="Toggle sidebar">
        <Menu size={20} />
      </button>

      <form onSubmit={handleSearchSubmit} style={{ flex: 1, maxWidth: 420, position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="input-field"
          style={{ paddingLeft: 36, background: 'var(--bg-input)' }}
          placeholder="Search employees, documents, policies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <div style={{ flex: 1 }} />

      <button
        className="btn-icon btn-ghost"
        style={{ position: 'relative' }}
        title="Notifications"
        onClick={() => canApprove && navigate('/leave')}
      >
        <Bell size={20} />
        {pendingCount > 0 && (
          <span
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
            }}
          >
            {pendingCount}
          </span>
        )}
      </button>

      <button className="btn-icon btn-ghost" title="Help">
        <HelpCircle size={20} />
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="avatar" style={{ background: 'var(--gradient-primary)', fontSize: '0.8rem' }}>
            {initials}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {company?.name || 'Company'}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{user?.role_name}</div>
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        </button>

        {menuOpen && (
          <div
            className="glass-card animate-fade-in"
            style={{
              position: 'absolute',
              right: 0,
              top: '110%',
              minWidth: 180,
              padding: 6,
              zIndex: 100,
            }}
          >
            <button
              onClick={() => { setMenuOpen(false); navigate('/profile'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <User size={15} /> My Profile
            </button>
            <button
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--accent-rose)', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-rose-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
