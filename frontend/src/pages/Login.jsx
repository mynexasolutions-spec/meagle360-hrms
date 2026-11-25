import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, getMe } from '../api/auth';
import { getMySubscription } from '../api/company';
import { Lock, Mail, Eye, EyeOff, CalendarCheck } from 'lucide-react';

import logoMark from '../assets/logo-mark.png';

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

      let subData = null;
      if (meRes.data?.role_name === 'Admin' || meRes.data?.permissions?.['settings:write']) {
        try {
          const subRes = await getMySubscription();
          subData = subRes.data;
        } catch (subErr) {
          console.warn('[Login] getMySubscription failed/403:', subErr);
        }
      }

      loginUser(token, meRes.data, subData);

      if (subData?.is_expired) {
        navigate('/subscriptions');
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('[Login] handleSubmit failed:', err);
      setError(err.response?.data?.detail || err.message || 'Login failed');
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
          <h2 className="login-welcome-title">Welcome Back</h2>
          <p className="login-welcome-subtitle">
            Sign in to your Meagle360 HRMS account
          </p>
        </div>

        {error && <div className="login-error-alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field-group">
            <label className="login-field-label" htmlFor="email">
              Work Email
            </label>
            <div className="login-input-wrap">
              <Mail size={18} className="login-input-icon" />
              <input
                id="email"
                type="email"
                className="login-input"
                placeholder="Enter your work email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-field-group password-group">
            <div className="login-field-label-row">
              <label className="login-field-label" htmlFor="password">
                Password
              </label>
              <Link to="/forgot-password" className="login-forgot-link">
                Forgot Password?
              </Link>
            </div>
            <div className="login-input-wrap">
              <Lock size={18} className="login-input-icon" />
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                className="login-input has-toggle"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <a
          href={
            'https://wa.me/917983072755?text=' +
            encodeURIComponent(
              'Hi Meagle360 Sales Team, I would like to request a free trial of Meagle360 HRMS.'
            )
          }
          target="_blank"
          rel="noopener noreferrer"
          className="login-sales-btn"
        >
          <CalendarCheck size={18} />
          Contact Sales Team for Free Trial
        </a>
    </>
  );
}
