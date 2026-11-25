import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import logoMark from '../assets/logo-mark.png';

// Rendered inside SplitAuthLayout (right panel).
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');

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
    <>
      <div className="login-form-header">
        <div className="login-logo-card">
          <img src={logoMark} alt="Meagle360 Logo" />
        </div>
        <h2 className="login-welcome-title">
          {submitted && <CheckCircle2 size={24} className="login-title-check" />}
          {submitted ? 'Check your email' : 'Reset your password'}
        </h2>
        <p className="login-welcome-subtitle">
          {submitted
            ? `If an account exists for ${email}, a reset link has been sent.`
            : 'Enter your registered work email to receive password reset instructions.'}
        </p>
      </div>

      {error && <div className="login-error-alert">{error}</div>}

      {submitted ? (
        <div>
          {devResetUrl && (
            <div className="login-info-box">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Dev Mode Reset Link:</div>
              <a href={devResetUrl}>Click here to reset password directly</a>
            </div>
          )}

          <p className="login-helper-text">
            Didn't receive the email? Check your spam folder or try again with your registered work email.
          </p>

          <Link to="/login" className="login-submit-btn" style={{ textDecoration: 'none' }}>
            Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="login-field-group">
            <label className="login-field-label" htmlFor="email">
              Work Email Address
            </label>
            <div className="login-input-wrap">
              <Mail size={18} className="login-input-icon" />
              <input
                id="email"
                type="email"
                className="login-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? 'Sending link...' : 'Send Reset Link'}
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
