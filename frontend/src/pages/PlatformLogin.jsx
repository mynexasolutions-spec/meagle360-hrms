import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../context/PlatformAuthContext';
import { platformLogin, getPlatformMe } from '../api/platform';
import { Lock, Mail, Eye, EyeOff, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';

export default function PlatformLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin } = usePlatformAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      console.log('[PlatformLogin] submitting for', email);
      const res = await platformLogin(email, password);
      console.log('[PlatformLogin] platformLogin() succeeded, got token');
      const token = res.data.access_token;

      try {
        localStorage.setItem('hrms_platform_token', token);
        console.log('[PlatformLogin] token stored in localStorage');
      } catch (storageErr) {
        console.error('[PlatformLogin] localStorage.setItem THREW:', storageErr);
        throw storageErr;
      }

      const meRes = await getPlatformMe();
      console.log('[PlatformLogin] getPlatformMe() succeeded:', meRes.data);
      loginAdmin(token, meRes.data);
      navigate('/platform');
    } catch (err) {
      console.error('[PlatformLogin] handleSubmit failed:', err);
      setError(err.response?.data?.detail || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="glass-card animate-fade-in auth-card"
      style={{
        width: '100%',
        maxWidth: 420,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.3)',
          }}
        >
          <ShieldCheck size={28} color="white" />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Nexa Solutions</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Platform console — manage HRMS tenants
        </p>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
            fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em',
            color: '#7c3aed', background: 'var(--accent-violet-light)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: 'var(--radius-full)', padding: '4px 12px',
          }}
        >
          <KeyRound size={11} /> RESTRICTED — PLATFORM STAFF ONLY
        </span>
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
        <div className="input-group">
          <label className="input-label" htmlFor="email">Email</label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              id="email"
              type="email"
              className="input-field"
              style={{ paddingLeft: 36 }}
              placeholder="contact@nexa-solutions.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="password">Password</label>
          <div style={{ position: 'relative' }}>
            <Lock
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              className="input-field"
              style={{ paddingLeft: 36, paddingRight: 40 }}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px 20px',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '0.875rem',
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)', transition: 'transform 150ms ease',
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <a href="/login" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Looking for the company login instead?
        </a>
      </div>
    </div>
  );
}
