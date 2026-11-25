import { useEffect, useState } from 'react';
import { CalendarClock, History } from 'lucide-react';
import {
  cancelScheduledJobChange, getJobChanges, getScheduledJobChanges,
} from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';

const TYPES = {
  assigned: { label: 'Designation set', color: '#0284c7' },
  promotion: { label: 'Promoted', color: '#059669' },
  demotion: { label: 'Demoted', color: '#dc2626' },
  role_change: { label: 'Role changed', color: '#7c3aed' },
  transfer: { label: 'Transferred', color: '#2563eb' },
  manager_change: { label: 'Manager changed', color: '#d97706' },
  joined: { label: 'Joined', color: '#64748b' },
};

const FIELDS = [['Designation', 'designation'], ['Department', 'department'], ['Manager', 'manager']];

const formatDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CareerTimeline({ employeeId, hireDate, refreshKey = 0 }) {
  const { user } = useAuth();
  const { showAlert, showConfirm } = usePopup();
  const isAdmin = !!user?.permissions?.['settings:write'];
  const [changes, setChanges] = useState(null);
  const [scheduled, setScheduled] = useState([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setFailed(false);
    setChanges(null);
    getJobChanges(employeeId)
      .then((res) => current && setChanges(res.data))
      .catch(() => current && setFailed(true));
    setScheduled([]);
    if (isAdmin) {
      getScheduledJobChanges(employeeId)
        .then((res) => current && setScheduled(res.data))
        .catch(() => current && setFailed(true));
    }
    return () => { current = false; };
  }, [employeeId, refreshKey, isAdmin]);

  const cancel = async (s) => {
    const pending = s.status === 'pending';
    const ok = !pending || await showConfirm({
      title: 'Cancel scheduled change', message: `Cancel the change planned for ${formatDate(s.effective_date)}?`,
      type: 'warning', confirmText: 'Cancel change', cancelText: 'Keep',
    });
    if (!ok) return;
    try {
      await cancelScheduledJobChange(employeeId, s.id);
      setScheduled((list) => list.filter((x) => x.id !== s.id));
    } catch {
      showAlert({ title: 'Could not cancel', message: 'It may already have been applied. Refresh the page.', type: 'error' });
    }
  };

  const rows = [
    ...(changes || []),
    ...(hireDate ? [{ id: 'joined', change_type: 'joined', effective_date: hireDate }] : []),
  ];

  return (
    <div className="section-card" style={{ gridColumn: '1 / -1', borderTop: '3px solid #0284c7' }}>
      <h3 style={{ marginBottom: 16 }}><History size={17} style={{ color: '#0284c7' }} /> Career Timeline</h3>
      {scheduled.map((s) => (
        <div key={s.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', marginBottom: 12, borderRadius: 10, border: `1px dashed ${s.status === 'failed' ? '#dc2626' : '#0284c7'}` }}>
          <CalendarClock size={16} />
          <div style={{ flex: 1, minWidth: 200, fontSize: '0.875rem' }}>
            <strong>{s.status === 'failed' ? 'Scheduled change failed' : 'Scheduled'}: {s.action}</strong> on {formatDate(s.effective_date)}
            {[s.designation, s.department, s.manager && `manager ${s.manager}`, s.salary_revised && 'salary revised'].filter(Boolean).map((t) => <span key={t}> · {t}</span>)}
            {s.error && <div style={{ color: 'var(--accent-rose)' }}>{s.error}</div>}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cancel(s)}>
            {s.status === 'failed' ? 'Dismiss' : 'Cancel'}
          </button>
        </div>
      ))}
      {failed && <p>Could not load the timeline. Refresh to try again.</p>}
      {!failed && !changes && <p>Loading...</p>}
      {changes && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r) => {
            const type = TYPES[r.change_type];
            return (
              <li key={r.id} style={{ borderLeft: `3px solid ${type.color}`, padding: '2px 0 2px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ color: type.color }}>{type.label}</strong>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{formatDate(r.effective_date)}</span>
                </div>
                {FIELDS.filter(([, f]) => r[`from_${f}`] !== r[`to_${f}`]).map(([label, f]) => (
                  <div key={f} style={{ fontSize: '0.875rem' }}>
                    {label}: {r[`from_${f}`] || 'None'} → <strong>{r[`to_${f}`] || 'None'}</strong>
                  </div>
                ))}
                {r.salary_revised && <div style={{ fontSize: '0.875rem' }}>Salary revised</div>}
                {r.reason && <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Reason: {r.reason}</div>}
                {r.actor_name && <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>By {r.actor_name}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
