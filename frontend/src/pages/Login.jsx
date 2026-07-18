import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, getMe } from '../api/auth';
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

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
      style={{ width: '100%', maxWidth: 420, padding: 40, position: 'relative', zIndex: 1 }}
    >
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--gradient-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 800,
            color: 'white',
            marginBottom: 16,
          }}
        >
          M
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Welcome Back</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Sign in to Meagle360 HRMS
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
        <div className="input-group">
          <label className="input-label" htmlFor="email">Email</label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              id="email"
              type="email"
              className="input-field"
              style={{ paddingLeft: 36 }}
              placeholder="you@company.com"
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
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
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
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '12px 20px' }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>

      <div
        style={{
          marginTop: 24,
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.1)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--text-secondary)' }}>Demo Credentials:</strong>
        <br />Admin: sarah@meagle360.com / admin123
        <br />Manager: michael@meagle360.com / manager123
        <br />Employee: emily@meagle360.com / employee123
      </div>
    </div>
  );
}
