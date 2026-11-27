import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Award, LogOut, RotateCcw, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import { getOffboarding, startOffboarding, exitEmployeeNow, cancelOffboarding } from '../api/employees';

// Offboarding never deletes an employee: they serve notice until their last
// working day (LWD), then become an ex-employee. History is kept.

export const EXIT_TYPE_LABEL = {
  resignation: 'Resignation',
  termination: 'Termination',
  retirement: 'Retirement',
  absconding: 'Absconding',
  contract_end: 'Contract ended',
  other: 'Other',
};

const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nextDay(d) {
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  dt.setDate(dt.getDate() + 1);
  return dt.toLocaleDateString('en-CA'); // YYYY-MM-DD, so fmtDate can format it
}

function Warnings({ w }) {
  if (!w) return null;
  const items = [];
  if (w.direct_reports?.length) {
    items.push(`${w.direct_reports.length} direct report(s) need a new manager: ${w.direct_reports.map((r) => r.full_name).join(', ')}. Use Change Job on their profiles.`);
  }
  if (w.pending_leave_approvals) items.push(`${w.pending_leave_approvals} pending leave request(s) from their team.`);
  if (w.pending_expense_approvals) items.push(`${w.pending_expense_approvals} pending expense claim(s) from their team.`);
  if (w.open_ats_applications) items.push(`${w.open_ats_applications} open job application(s) are assigned to them as recruiter.`);
  if (!w.fnf_status) items.push('Full & final settlement has not been started (Payroll → F&F).');
  if (!items.length) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 10, background: '#ecfdf5', color: '#047857', fontSize: '0.8125rem', marginBottom: 14 }}>
        <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} /> Nothing pending. Ready to offboard.
      </div>
    );
  }
  return (
    <div style={{ padding: 12, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.8125rem', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 6 }}>
        <AlertTriangle size={15} /> Sort these out before the last day (they don&apos;t block the exit)
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  );
}

export default function OffboardModal({ employee, onClose, onChanged }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ exit_type: 'resignation', resignation_date: todayStr(), last_working_date: '', exit_reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await getOffboarding(employee.id);
      setInfo(res.data);
      if (res.data.offboarding_status) {
        setForm({
          exit_type: res.data.exit_type || 'resignation',
          resignation_date: res.data.resignation_date || '',
          last_working_date: res.data.last_working_date || '',
          exit_reason: res.data.exit_reason || '',
        });
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load offboarding details.');
    }
  };

  useEffect(() => { load(); }, [employee.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, after) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      setInfo(res.data);
      onChanged?.();
      after?.(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const save = (openStudio) => {
    if (!form.last_working_date) {
      setError('Last working day is required.');
      return;
    }
    const payload = {
      exit_type: form.exit_type,
      last_working_date: form.last_working_date,
      resignation_date: form.resignation_date || null,
      exit_reason: form.exit_reason || null,
    };
    run(() => startOffboarding(employee.id, payload), () => {
      if (openStudio) navigate(`/relieving-letter?employee_id=${employee.id}&offboarding=1`);
    });
  };

  const status = info?.offboarding_status;
  const exited = status === 'exited' || info?.employment_status === 'inactive';

  return (
    <Modal title={`Offboard ${employee.full_name}`} onClose={onClose} maxWidth={560}>
      {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
      {!info ? (
        <p style={{ fontSize: '0.875rem', color: '#475569' }}>Loading…</p>
      ) : exited ? (
        <div>
          <div style={{ padding: 12, borderRadius: 10, background: '#f1f5f9', fontSize: '0.875rem', color: '#334155', marginBottom: 14, lineHeight: 1.6 }}>
            <strong>Ex-employee</strong> since {fmtDate(info.date_of_exit)}
            {info.exit_type && <> · {EXIT_TYPE_LABEL[info.exit_type] || info.exit_type}</>}
            {info.exit_reason && <div>Reason: {info.exit_reason}</div>}
            <div style={{ fontSize: '0.8125rem', color: '#475569', marginTop: 4 }}>
              Login is disabled. Payslips, attendance and documents are kept.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="button" onClick={() => navigate(`/relieving-letter?employee_id=${employee.id}`)}>
              <Award size={15} /> Relieving Letter
            </button>
            <button
              className="btn btn-secondary" type="button" disabled={busy}
              onClick={() => window.confirm(`Undo the exit and make ${employee.full_name} an active employee again?`) && run(() => cancelOffboarding(employee.id))}
            >
              <RotateCcw size={15} /> Undo exit
            </button>
          </div>
        </div>
      ) : (
        <div>
          {status === 'notice' && (
            <div style={{ padding: 10, borderRadius: 10, background: '#eff6ff', color: '#1e40af', fontSize: '0.8125rem', marginBottom: 14 }}>
              Serving notice. Last working day <strong>{fmtDate(info.last_working_date)}</strong>.
              They will be moved to Ex-employees automatically on {fmtDate(nextDay(info.last_working_date))}.
            </div>
          )}
          <Warnings w={info.warnings} />

          <div className="input-group">
            <label className="input-label">Exit type</label>
            <select className="input-field" value={form.exit_type} onChange={(e) => setForm({ ...form, exit_type: e.target.value })}>
              {Object.entries(EXIT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Resignation / notice date</label>
              <input type="date" className="input-field" value={form.resignation_date || ''} onChange={(e) => setForm({ ...form, resignation_date: e.target.value })} />
            </div>
            <div className="input-group">
              <label className="input-label">Last working day *</label>
              <input type="date" className="input-field" value={form.last_working_date || ''} onChange={(e) => setForm({ ...form, last_working_date: e.target.value })} required />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Reason (internal)</label>
            <input className="input-field" maxLength={255} value={form.exit_reason || ''} onChange={(e) => setForm({ ...form, exit_reason: e.target.value })} placeholder="e.g. Higher studies" />
          </div>
          {form.last_working_date && form.last_working_date < todayStr() && (
            <p style={{ fontSize: '0.8125rem', color: '#b45309', margin: '0 0 12px' }}>
              The last working day is in the past, so {employee.full_name} will be moved to Ex-employees right away and lose login access.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => save(true)}>
              <Award size={15} /> Save &amp; open Relieving Letter
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => save(false)}>
              {status === 'notice' ? 'Update dates' : 'Save'}
            </button>
            {status === 'notice' && (
              <>
                <button
                  className="btn btn-secondary" type="button" disabled={busy} style={{ color: '#b91c1c' }}
                  onClick={() => window.confirm(`Exit ${employee.full_name} today? Their login will stop working.`) && run(() => exitEmployeeNow(employee.id))}
                >
                  <LogOut size={15} /> Exit now
                </button>
                <button
                  className="btn btn-ghost" type="button" disabled={busy}
                  onClick={() => window.confirm('Cancel this offboarding (resignation withdrawn)?') && run(() => cancelOffboarding(employee.id))}
                >
                  Cancel offboarding
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
