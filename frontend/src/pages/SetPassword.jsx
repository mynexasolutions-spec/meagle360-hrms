import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setPassword } from '../api/auth';
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPasswordInput] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

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
    <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 40, position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>
          {done ? 'All set!' : 'Set your password'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {done ? 'Your account is ready to use.' : 'Finish setting up your Meagle360 HRMS admin account'}
        </p>
      </div>

      {done ? (
        <div style={{ textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--accent-emerald, #10b981)" style={{ marginBottom: 12 }} />
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate('/login')}
          >
            Go to Login <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--accent-rose-light)', color: 'var(--accent-rose)', fontSize: '0.8125rem', marginBottom: 16 }}>
              {error}
            </div>
          )}
          <div className="input-group">
            <label className="input-label" htmlFor="password">New Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="password"
                type="password"
                className="input-field"
                style={{ paddingLeft: 36 }}
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="confirm">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="confirm"
                type="password"
                className="input-field"
                style={{ paddingLeft: 36 }}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {loading ? 'Saving...' : 'Set Password'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>
      )}
    </div>
  );
}
