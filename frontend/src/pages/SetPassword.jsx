import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setPassword } from '../api/auth';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, ShieldCheck, Check } from 'lucide-react';

export default function SetPassword() {
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

  const passwordsMatch = confirm.length > 0 && password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Missing or invalid invite link');
      return;
    }
    setLoading(true);
    try {
      await setPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not set password — the link may have expired');
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

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: done ? 'var(--accent-emerald-light, #d1fae5)' : '#eff6ff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: done ? '0 8px 22px rgba(16, 185, 129, 0.18)' : '0 8px 22px rgba(37, 99, 235, 0.15)',
            marginBottom: 16,
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
            fontSize: '1.6rem', fontWeight: 800, marginBottom: 4,
            background: 'linear-gradient(135deg, #0f172a, #2563eb)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}
        >
          {done ? 'All set!' : 'Set your password'}
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          {done ? 'Your account is ready to use.' : 'Finish setting up your Meagle360 HRMS account'}
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
            justifyContent: 'center',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            fontWeight: 700,
            fontSize: '0.95rem',
            boxShadow: btnHover ? '0 8px 22px rgba(37, 99, 235, 0.35)' : '0 4px 14px rgba(37, 99, 235, 0.25)',
            transform: btnHover ? 'translateY(-1px)' : 'translateY(0)',
            transition: 'all 0.15s ease',
          }}
          onClick={() => navigate('/login')}
        >
          Go to Login <ArrowRight size={16} />
        </button>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--accent-rose-light)', color: 'var(--accent-rose)', fontSize: '0.8125rem', marginBottom: 16 }}>
              {error}
            </div>
          )}
          <div className="input-group" style={{ marginBottom: 20 }}>
            <label className="input-label" htmlFor="password" style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                className="input-field"
                style={{
                  paddingLeft: 42, paddingRight: 44, height: 48, borderRadius: 14,
                  fontSize: '0.9rem', border: '1px solid #cbd5e1', background: '#f8fafc',
                }}
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="confirm" style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                id="confirm"
                type={showConfirmPw ? 'text' : 'password'}
                className="input-field"
                style={{
                  paddingLeft: 42, paddingRight: 44, height: 48, borderRadius: 14,
                  fontSize: '0.9rem',
                  border: `1px solid ${passwordsMatch ? 'var(--accent-emerald, #10b981)' : '#cbd5e1'}`,
                  background: '#f8fafc',
                }}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw(!showConfirmPw)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordsMatch && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: '0.75rem', color: 'var(--accent-emerald, #10b981)', fontWeight: 600 }}>
                <Check size={13} /> Passwords match
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              width: '100%', height: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, borderRadius: 14, border: 'none', marginTop: 24,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#ffffff',
              fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'default' : 'pointer',
              boxShadow: btnHover && !loading ? '0 8px 22px rgba(37, 99, 235, 0.35)' : '0 4px 14px rgba(37, 99, 235, 0.25)',
              transform: btnHover && !loading ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? 'Saving...' : 'Set Password'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>
      )}
    </div>
  );
}
