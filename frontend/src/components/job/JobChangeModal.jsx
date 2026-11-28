import { useEffect, useState } from 'react';
import { ArrowLeftRight, TrendingDown, TrendingUp } from 'lucide-react';
import Modal from '../Modal';
import { createJobChange, getDesignations, getDirectory } from '../../api/employees';
import { usePopup } from '../../context/PopupContext';
import errorText from '../../utils/errorText';

const ACTIONS = [
  { key: 'promote', label: 'Promote', icon: TrendingUp, color: '#059669' },
  { key: 'demote', label: 'Demote', icon: TrendingDown, color: '#dc2626' },
  { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: '#2563eb' },
];

// Local date, not UTC: toISOString would give yesterday in India before 05:30.
const today = () => new Date().toLocaleDateString('en-CA');

function designationOptions(action, all, current) {
  const active = all.filter((d) => d.is_active && d.id !== current?.id);
  if (action === 'transfer') {
    if (!current) return active;
    return current.level ? active.filter((d) => d.level === current.level) : [];
  }
  if (!current?.level) return [];
  return active.filter((d) => d.level && (action === 'promote' ? d.level > current.level : d.level < current.level));
}

function emptyHint(action, current) {
  if (action === 'transfer') return '';
  if (!current) return 'No designation is set yet. Use Transfer to set the first one.';
  if (!current.level) return `Give ${current.title} a level first: Employee Directory > Organization > Designations.`;
  return `There is no ${action === 'promote' ? 'higher' : 'lower'} level designation than ${current.title}.`;
}

export default function JobChangeModal({ employee, departments, canReviseSalary, onClose, onSaved }) {
  const { showConfirm, showToast } = usePopup();
  const [action, setAction] = useState(employee.designation_id ? 'promote' : 'transfer');
  const [designations, setDesignations] = useState(null);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({
    designation_id: '',
    department_id: employee.department_id || '',
    manager_id: employee.manager_id || '',
    effective_date: today(),
    reason: '',
    reviseSalary: false,
    basic_pay: '',
    annual_ctc: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getDesignations(), getDirectory(0, 1000)])
      .then(([d, p]) => {
        setDesignations(d.data);
        setPeople(p.data.filter((e) => e.employment_status === 'active' && e.id !== employee.id));
      })
      .catch((e) => {
        setDesignations([]);
        setError(errorText(e, 'Could not load designations and employees.'));
      });
  }, [employee.id]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const current = (designations || []).find((d) => d.id === employee.designation_id);
  const options = designationOptions(action, designations || [], current);
  const isTransfer = action === 'transfer';
  const hint = designations && options.length === 0 ? emptyHint(action, current) : '';

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (action === 'demote') {
      const ok = await showConfirm({
        title: 'Confirm demotion',
        message: `Demote ${employee.full_name}? They will be told their role was updated. The reason stays visible to admins only.`,
        type: 'warning',
        confirmText: 'Demote',
      });
      if (!ok) return;
    }
    const body = { action, effective_date: form.effective_date, reason: form.reason };
    if (form.designation_id) body.designation_id = form.designation_id;
    if (form.department_id) body.department_id = form.department_id;
    if (form.manager_id !== (employee.manager_id || '')) body.manager_id = form.manager_id || null;
    if (!isTransfer && form.reviseSalary) {
      body.salary = { basic_pay: form.basic_pay, annual_ctc: form.annual_ctc || null };
    }
    setSaving(true);
    try {
      const res = await createJobChange(employee.id, body);
      showToast({
        type: 'success',
        message: res.data.scheduled
          ? `Scheduled for ${form.effective_date}.`
          : `${employee.full_name}'s job has been updated.`,
      });
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save the change.'));
      setSaving(false);
    }
  };

  return (
    <Modal sheet title={`Change Job: ${employee.full_name}`} onClose={onClose} maxWidth={560}>
      <form onSubmit={save}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {ACTIONS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              type="button"
              className="btn btn-secondary"
              aria-pressed={action === key}
              style={{ flex: 1, justifyContent: 'center', ...(action === key ? { borderColor: color, color } : {}) }}
              onClick={() => {
                setAction(key);
                setForm((f) => ({ ...f, designation_id: '' }));
                setError('');
              }}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="job-designation">
            New designation {current && `(now ${current.title}${current.level ? `, level ${current.level}` : ''})`}
          </label>
          <select
            id="job-designation" className="input-field" value={form.designation_id}
            onChange={set('designation_id')} required={!isTransfer} disabled={!options.length}
          >
            <option value="">{isTransfer ? 'No change' : 'Choose'}</option>
            {options.map((d) => (
              <option key={d.id} value={d.id}>{d.title}{d.level ? ` (level ${d.level})` : ''}</option>
            ))}
          </select>
          {hint && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 6 }}>{hint}</p>}
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="job-department">Department</label>
          <select id="job-department" className="input-field" value={form.department_id} onChange={set('department_id')}>
            {!employee.department_id && <option value="">No department</option>}
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="job-manager">Manager</label>
          <select id="job-manager" className="input-field" value={form.manager_id} onChange={set('manager_id')}>
            <option value="">No manager (top level)</option>
            {employee.manager_id && !people.some((p) => p.id === employee.manager_id) && (
              <option value={employee.manager_id}>{employee.manager_name}</option>
            )}
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.employee_code})</option>)}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="job-date">Effective date</label>
          <input
            id="job-date" type="date" className="input-field" required
            min={employee.date_of_hire} value={form.effective_date} onChange={set('effective_date')}
          />
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="job-reason">
            Reason {action === 'demote' ? '(required, admins only)' : '(optional, admins only)'}
          </label>
          <textarea
            id="job-reason" className="input-field" rows={2} maxLength={500}
            required={action === 'demote'} value={form.reason} onChange={set('reason')}
          />
        </div>

        {!isTransfer && canReviseSalary && (
          <div className="input-group">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.875rem' }}>
              <input
                type="checkbox" checked={form.reviseSalary}
                onChange={(e) => setForm((f) => ({ ...f, reviseSalary: e.target.checked }))}
              />
              Revise salary from the same date
            </label>
            {form.reviseSalary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 10 }}>
                <div>
                  <label className="input-label" htmlFor="job-basic">Monthly basic pay (₹)</label>
                  <input
                    id="job-basic" type="number" min="0.01" step="0.01" className="input-field" required
                    value={form.basic_pay} onChange={set('basic_pay')}
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="job-ctc">Annual CTC (₹, optional)</label>
                  <input
                    id="job-ctc" type="number" min="0.01" step="0.01" className="input-field"
                    value={form.annual_ctc} onChange={set('annual_ctc')}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {form.effective_date > today()
            ? 'This is scheduled: it applies automatically on that date, and the employee is notified then.'
            : 'The employee is notified.'}
          {' '}Login roles and permissions do not change.
        </p>
        {error && <div role="alert" style={{ color: 'var(--accent-rose)', fontSize: '0.875rem', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !designations || (!isTransfer && !options.length)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
