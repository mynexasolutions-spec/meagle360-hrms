import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMyMonth } from '../api/pms';
import MyMonth from '../components/pms/MyMonth';
import TeamMonth from '../components/pms/TeamMonth';
import ManagePms from '../components/pms/ManagePms';
import { errorText, monthLabel, shiftMonth } from '../components/pms/shared';
import './Performance.css';

export default function PerformanceManagement() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('me');
  const [month, setMonth] = useState(null); // null = let the server pick the current month
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    try {
      const res = await getMyMonth(month);
      if (id !== requestRef.current) return; // a newer month was picked meanwhile
      setData(res.data);
      setError('');
    } catch (err) {
      if (id === requestRef.current) setError(errorText(err, 'Could not load your performance page'));
    }
  }, [month]);

  useEffect(() => {
    if (!authLoading && user) load();
  }, [authLoading, user?.id, load]);

  if (!data) {
    return (
      <div className="pms">
        <div className="glass-card pms-empty">
          {error || 'Loading...'}
          {error && <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'me', label: 'My Performance', show: true },
    { id: 'team', label: 'Team Reviews', show: data.has_team || data.is_admin },
    { id: 'manage', label: 'Manage', show: data.is_admin },
  ].filter((t) => t.show);
  const shown = month || data.month;
  const ready = data.month === shown;

  return (
    <div className="pms">
      <div className="pms-head">
        <h1>Performance</h1>
        {tab !== 'manage' && (
          <div className="pms-month">
            {shown !== data.current_month && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(data.current_month)}>
                This month
              </button>
            )}
            <button
              type="button" className="btn btn-ghost btn-icon" aria-label="Previous month"
              disabled={!data.first_month || shown <= data.first_month}
              onClick={() => setMonth(shiftMonth(shown, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>{monthLabel(shown)}</strong>
            <button
              type="button" className="btn btn-ghost btn-icon" aria-label="Next month"
              disabled={shown >= data.last_month}
              onClick={() => setMonth(shiftMonth(shown, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`tab${tab === t.id ? ' active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="pms-alert" role="alert">{error}</div>}
      {tab === 'me' && ready && <MyMonth key={data.month} data={data} reload={load} />}
      {tab === 'team' && ready && (
        <TeamMonth key={data.month} month={data.month} isAdmin={data.is_admin} hasTeam={data.has_team} />
      )}
      {tab === 'manage' && <ManagePms current={data.current_month} first={data.first_month} onSettingsSaved={load} />}
    </div>
  );
}
