import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');
  const [btnHover, setBtnHover] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await forgotPassword(email);
      setSubmitted(true);
      if (res.data?.dev_reset_url) {
        setDevResetUrl(res.data.dev_reset_url);
      }
    } catch (err) {
      console.error('[ForgotPassword] error:', err);
      setError(err.response?.data?.detail || 'Failed to request password reset. Please try again.');
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

      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: submitted ? '#ecfdf5' : '#eff6ff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: submitted
              ? '0 8px 22px rgba(16, 185, 129, 0.15)'
              : '0 8px 22px rgba(37, 99, 235, 0.12)',
            marginBottom: 16,
            border: `1px solid ${submitted ? '#a7f3d0' : '#bfdbfe'}`,
          }}
        >
          {submitted ? (
            <CheckCircle2 size={32} style={{ color: '#10b981' }} />
          ) : (
            <KeyRound size={30} style={{ color: '#2563eb' }} />
          )}
        </div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            marginBottom: 6,
            background: 'linear-gradient(135deg, #0f172a, #2563eb)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {submitted ? 'Check your email' : 'Reset your password'}
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5 }}>
          {submitted
            ? `If an account exists for ${email}, a reset link has been sent.`
            : 'Enter your registered work email to receive password reset instructions.'}
        </p>
      </div>

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

      {submitted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {devResetUrl && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                fontSize: '0.8125rem',
                color: '#1e40af',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Dev Mode Reset Link:</div>
              <a
                href={devResetUrl}
                style={{
                  color: '#2563eb',
                  wordBreak: 'break-all',
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                Click here to reset password directly
              </a>
            </div>
          )}

          <p style={{ fontSize: '0.8125rem', color: '#64748b', textAlign: 'center' }}>
            Didn't receive the email? Check your spam folder or try again with your registered work email.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            onClick={() => navigate('/login')}
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
              cursor: 'pointer',
              boxShadow: btnHover
                ? '0 8px 22px rgba(37, 99, 235, 0.35)'
                : '0 4px 14px rgba(37, 99, 235, 0.25)',
              transform: btnHover ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.15s ease',
            }}
          >
            Back to Sign In <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="input-group" style={{ marginBottom: 24 }}>
            <label
              className="input-label"
              htmlFor="email"
              style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#334155' }}
            >
              Work Email Address
            </label>
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
            {loading ? 'Sending link...' : 'Send Reset Link'}
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
