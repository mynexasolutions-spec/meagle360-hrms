import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPasswordInput] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!token) {
      setError('Missing or invalid reset token. Please request a new link.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not reset password — the link may have expired or is invalid.');
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
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 5,
          background: 'linear-gradient(90deg, #2563eb, #7c3aed, #2563eb)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 4s ease infinite',
        }}
      />

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: done ? '#d1fae5' : '#eff6ff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: done
              ? '0 8px 22px rgba(16, 185, 129, 0.18)'
              : '0 8px 22px rgba(37, 99, 235, 0.15)',
            marginBottom: 16,
            border: `1px solid ${done ? '#a7f3d0' : '#bfdbfe'}`,
          }}
        >
          {done ? (
            <CheckCircle2 size={32} style={{ color: '#10b981' }} />
          ) : (
            <ShieldCheck size={30} style={{ color: '#2563eb' }} />
          )}
        </div>
        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            marginBottom: 4,
            background: 'linear-gradient(135deg, #0f172a, #2563eb)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {done ? 'Password Updated!' : 'Set New Password'}
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          {done
            ? 'Your password has been changed successfully. You can now log in.'
            : 'Enter a strong password with at least 8 characters.'}
        </p>
      </div>

      {done ? (
        <button
          className="btn btn-primary"
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => setBtnHover(false)}
          style={{
            width: '100%',
            height: 48,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.95rem',
            boxShadow: btnHover
              ? '0 8px 22px rgba(37, 99, 235, 0.35)'
              : '0 4px 14px rgba(37, 99, 235, 0.25)',
            transform: btnHover ? 'translateY(-1px)' : 'translateY(0)',
            transition: 'all 0.15s ease',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/login')}
        >
          Go to Sign In <ArrowRight size={16} />
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md, 10px)',
                background: 'var(--accent-rose-light, #ffe4e6)',
                color: 'var(--accent-rose, #e11d48)',
                fontSize: '0.8125rem',
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <div className="input-group" style={{ marginBottom: 18 }}>
            <label
              className="input-label"
              htmlFor="password"
              style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}
            >
              New Password
            </label>
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
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                minLength={8}
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

          <div className="input-group" style={{ marginBottom: 24 }}>
            <label
              className="input-label"
              htmlFor="confirm"
              style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}
            >
              Confirm New Password
            </label>
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
                id="confirm"
                type={showConfirmPw ? 'text' : 'password'}
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
                placeholder="Re-enter your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw(!showConfirmPw)}
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
                {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
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
              boxShadow:
                btnHover && !loading
                  ? '0 8px 22px rgba(37, 99, 235, 0.35)'
                  : '0 4px 14px rgba(37, 99, 235, 0.25)',
              transform: btnHover && !loading ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? 'Updating Password...' : 'Reset Password'}
            {!loading && <ArrowRight size={18} />}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link
              to="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: '#64748b',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#2563eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b';
              }}
            >
              <ArrowLeft size={16} /> Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
