import { useState } from 'react';
import Modal from '../Modal';

export function errorText(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
}

export function shiftMonth(key, by) {
  const [y, m] = key.split('-').map(Number);
  const n = y * 12 + (m - 1) + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(key, style = 'long') {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });
}

export function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short',
    ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

export const score = (v) => (v == null ? '-' : Number(v).toFixed(1));

export const RATINGS = {
  1: 'Needs improvement',
  2: 'Developing',
  3: 'Meets expectations',
  4: 'Exceeds expectations',
  5: 'Outstanding',
};

/** One goal with its progress bar. `children` holds the action buttons. */
export function GoalRow({ goal, children }) {
  const pct = goal.achievement_pct == null ? null : Math.round(goal.achievement_pct);
  return (
    <div className="pms-goal">
      <div className="pms-goal-top">
        <span className="pms-goal-title">{goal.title}</span>
        <span className="pms-muted">
          {goal.actual_value == null
            ? `Target ${goal.target_value} ${goal.unit || ''}`
            : `${goal.actual_value} of ${goal.target_value} ${goal.unit || ''}`}
          {goal.direction === 'lower_better' && ' (lower is better)'}
        </span>
        <strong>{pct == null ? 'No update' : `${pct}%`}</strong>
      </div>
      <div className="pms-bar"><span style={{ width: `${Math.min(pct || 0, 100)}%` }} /></div>
      <div className="pms-goal-foot">
        <span className="pms-muted">
          {[goal.set_by_manager && 'Set by manager', goal.note].filter(Boolean).join(' · ')}
        </span>
        <div className="pms-actions">{children}</div>
      </div>
    </div>
  );
}

/** Small modal form that keeps itself open and shows the error if saving fails. */
export function FormModal({ title, onClose, onSave, saveLabel = 'Save', disabled = false, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave();
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save, please try again'));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose} maxWidth={480} compact>
      <form onSubmit={submit}>
        {children}
        {error && <div className="pms-alert" role="alert">{error}</div>}
        <div className="pms-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || disabled}>
            {busy ? 'Saving...' : saveLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function GoalModal({ goal, onClose, onSave }) {
  const [form, setForm] = useState({
    title: goal?.title || '',
    target_value: goal?.target_value ?? 100,
    unit: goal ? goal.unit || '' : '%',
    direction: goal?.direction || 'higher_better',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <FormModal
      title={goal ? 'Edit goal' : 'Add goal'} onClose={onClose}
      onSave={() => onSave({
        ...form, target_value: Number(form.target_value), unit: form.unit.trim() || null,
      })}
    >
      <div className="input-group">
        <label className="input-label" htmlFor="goal-title">What is the goal for the month?</label>
        <input
          id="goal-title" className="input-field" required maxLength={255} autoFocus
          placeholder="e.g. Close 10 sales" value={form.title} onChange={set('title')}
        />
      </div>
      <div className="pms-two">
        <div className="input-group">
          <label className="input-label" htmlFor="goal-target">Target</label>
          <input
            id="goal-target" className="input-field" type="number" required min="0.01" step="0.01"
            value={form.target_value} onChange={set('target_value')}
          />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="goal-unit">Unit</label>
          <input
            id="goal-unit" className="input-field" maxLength={30} placeholder="%, sales, hours"
            value={form.unit} onChange={set('unit')}
          />
        </div>
      </div>
      <label className="pms-check">
        <input
          type="checkbox" checked={form.direction === 'lower_better'}
          onChange={(e) => setForm({ ...form, direction: e.target.checked ? 'lower_better' : 'higher_better' })}
        />
        A lower number is better (like complaints or delays)
      </label>
    </FormModal>
  );
}

export function ProgressModal({ goal, onClose, onSave }) {
  const [value, setValue] = useState(goal.actual_value ?? '');
  const [note, setNote] = useState('');
  return (
    <FormModal
      title="Update progress" onClose={onClose}
      onSave={() => onSave({ actual_value: Number(value), note: note.trim() || null })}
    >
      <p className="pms-muted">{goal.title}</p>
      <div className="input-group">
        <label className="input-label" htmlFor="progress-value">
          Done so far (target {goal.target_value} {goal.unit || ''})
        </label>
        <input
          id="progress-value" className="input-field" type="number" required min="0" step="0.01" autoFocus
          value={value} onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="input-group">
        <label className="input-label" htmlFor="progress-note">Note (optional)</label>
        <input
          id="progress-note" className="input-field" maxLength={1000}
          value={note} onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormModal>
  );
}
