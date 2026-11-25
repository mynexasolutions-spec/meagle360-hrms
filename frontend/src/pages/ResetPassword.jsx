import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react';
import logoMark from '../assets/logo-mark.png';

// Rendered inside SplitAuthLayout (right panel).
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
    <>
      <div className="login-form-header">
        <div className="login-logo-card">
          <img src={logoMark} alt="Meagle360 Logo" />
        </div>
        <h2 className="login-welcome-title">
          {done && <CheckCircle2 size={24} className="login-title-check" />}
          {done ? 'Password Updated!' : 'Set New Password'}
        </h2>
        <p className="login-welcome-subtitle">
          {done
            ? 'Your password has been changed successfully. You can now log in.'
            : 'Enter a strong password with at least 8 characters.'}
        </p>
      </div>

      {done ? (
        <Link to="/login" className="login-submit-btn" style={{ textDecoration: 'none' }}>
          Go to Sign In
        </Link>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error-alert">{error}</div>}

          <div className="login-field-group">
            <label className="login-field-label" htmlFor="password">
              New Password
            </label>
            <div className="login-input-wrap">
              <Lock size={18} className="login-input-icon" />
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                className="login-input has-toggle"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="login-pw-toggle"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-field-group password-group">
            <label className="login-field-label" htmlFor="confirm">
              Confirm New Password
            </label>
            <div className="login-input-wrap">
              <Lock size={18} className="login-input-icon" />
              <input
                id="confirm"
                type={showConfirmPw ? 'text' : 'password'}
                className="login-input has-toggle"
                placeholder="Re-enter your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="login-pw-toggle"
                onClick={() => setShowConfirmPw(!showConfirmPw)}
                aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
              >
                {showConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? 'Updating Password...' : 'Reset Password'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link to="/login" className="login-back-link">
              <ArrowLeft size={16} /> Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
