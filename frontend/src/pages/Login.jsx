import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, getMe } from '../api/auth';
import { Lock, Mail, Eye, EyeOff, ArrowRight, Sparkles, Shield, Crown, User } from 'lucide-react';

import logoAsset from '../assets/logo.jpg';

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'sarah@meagle360.com', password: 'admin123', icon: Crown, color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Manager', email: 'michael@meagle360.com', password: 'manager123', icon: Shield, color: '#2563eb', bg: '#eff6ff' },
  { label: 'Employee', email: 'emily@meagle360.com', password: 'employee123', icon: User, color: '#059669', bg: '#ecfdf5' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      console.log('[Login] submitting for', email);
      const res = await login(email, password);
      console.log('[Login] login() succeeded, got token');
      const token = res.data.access_token;

      try {
        localStorage.setItem('hrms_token', token);
        console.log('[Login] token stored in localStorage');
      } catch (storageErr) {
        console.error('[Login] localStorage.setItem THREW:', storageErr);
        throw storageErr;
      }

      const meRes = await getMe();
      console.log('[Login] getMe() succeeded:', meRes.data);
      loginUser(token, meRes.data);
      navigate('/');
    } catch (err) {
      console.error('[Login] handleSubmit failed:', err);
      setError(err.response?.data?.detail || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="glass-card animate-fade-in"
      style={{
        width: '100%',
        maxWidth: 440,
        padding: '44px 40px',
        position: 'relative',
        zIndex: 1,
        background: '#ffffff',
        borderRadius: 28,
        border: '1px solid #e2e8f0',
        boxShadow: '0 20px 50px -12px rgba(15, 23, 42, 0.12)',
        overflow: 'hidden',
      }}
    >
      {/* Top accent strip */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: 'linear-gradient(90deg, #2563eb, #7c3aed, #2563eb)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 4s ease infinite',
        }}
      />

      {/* Brand Header with Preset Company Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 22px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <img src={logoAsset} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <h1
          style={{
            fontSize: '1.6rem', fontWeight: 800, marginBottom: 4,
            background: 'linear-gradient(135deg, #0f172a, #2563eb)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}
        >
          Welcome Back
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Sign in to your Meagle360 HRMS Portal
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-rose-light)',
            color: 'var(--accent-rose)',
            fontSize: '0.8125rem',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="input-group" style={{ marginBottom: 20 }}>
          <label className="input-label" htmlFor="email" style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}>Work Email</label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
            />
            <input
              id="email"
              type="email"
              className="input-field"
              style={{
                paddingLeft: 42,
                height: 48,
                borderRadius: 14,
                fontSize: '0.9rem',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
              }}
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: 24 }}>
          <label className="input-label" htmlFor="password" style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}>Password</label>
          <div style={{ position: 'relative' }}>
            <Lock
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
            />
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              className="input-field"
              style={{
                paddingLeft: 42,
                paddingRight: 44,
                height: 48,
                borderRadius: 14,
                fontSize: '0.9rem',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
              }}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
              }}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            width: '100%',
            height: 48,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: loading ? 'default' : 'pointer',
            boxShadow: btnHover && !loading ? '0 8px 22px rgba(37, 99, 235, 0.35)' : '0 4px 14px rgba(37, 99, 235, 0.25)',
            transform: btnHover && !loading ? 'translateY(-1px)' : 'translateY(0)',
            transition: 'all 0.15s ease',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
          {!loading && <ArrowRight size={18} />}
        </button>
      </form>

      <div
        style={{
          marginTop: 28,
          padding: '16px 18px',
          borderRadius: 16,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
          <Sparkles size={15} style={{ color: '#2563eb' }} /> Quick Demo Accounts
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemo(account)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0',
                background: email === account.email ? account.bg : '#ffffff',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = account.color; e.currentTarget.style.background = account.bg; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = email === account.email ? account.bg : '#ffffff'; }}
            >
              <div
                style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: account.bg, color: account.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <account.icon size={14} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{account.label}</div>
                <div className="truncate" style={{ fontSize: '0.6875rem', color: '#64748b' }}>{account.email}</div>
              </div>
              <span style={{ fontSize: '0.6875rem', color: account.color, fontWeight: 600, flexShrink: 0 }}>Use</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
