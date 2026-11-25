import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import Modal from '../Modal';
import { createVacancy, deleteVacancy, updateVacancy } from '../../api/employees';
import { createJobOpening } from '../../api/ats';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';
import errorText from '../../utils/errorText';

export function VacancyCard({ vacancy, onOpen }) {
  return (
    <button type="button" data-item className="oe-card oe-vacant" onClick={() => onOpen(vacancy)} title="Manage this position">
      <div className="oe-person">
        <UserPlus size={20} />
        <div className="oe-text">
          <div className="oe-name">{vacancy.title}</div>
          <div className="oe-sub">{vacancy.job_id ? `Job: ${vacancy.job_title} (${vacancy.job_status})` : 'Vacant'}</div>
        </div>
      </div>
    </button>
  );
}

export function NewVacancyModal({ people, departments, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', department_id: '', manager_id: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createVacancy(form);
      await onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not add the position.'));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add vacant position" onClose={onClose} maxWidth={460}>
      <form onSubmit={save}>
        <div className="input-group">
          <label className="input-label" htmlFor="vac-title">Title</label>
          <input id="vac-title" className="input-field" maxLength={150} required value={form.title} onChange={set('title')} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="vac-dept">Department</label>
          <select id="vac-dept" className="input-field" required value={form.department_id} onChange={set('department_id')}>
            <option value="">Choose</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="vac-manager">Reports to</label>
          <select id="vac-manager" className="input-field" required value={form.manager_id} onChange={set('manager_id')}>
            <option value="">Choose</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.employee_code})</option>)}
          </select>
        </div>
        {error && <div role="alert" className="oe-error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>Add</button>
        </div>
      </form>
    </Modal>
  );
}

export function ManageVacancyModal({ vacancy, jobs, onClose, onSaved }) {
  const { user } = useAuth();
  const { showConfirm } = usePopup();
  const [jobId, setJobId] = useState(vacancy.job_id || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onSaved();
    } catch (err) {
      setError(errorText(err, 'Something went wrong. Try again.'));
      setBusy(false);
    }
  };

  const createJob = () => run(async () => {
    const job = await createJobOpening({ title: vacancy.title, department_id: vacancy.department_id, status: 'Draft' });
    await updateVacancy(vacancy.id, { job_id: job.data.id });
  });

  const remove = async () => {
    const ok = await showConfirm({
      title: 'Remove position', message: `Remove ${vacancy.title}? Do this when it is filled or no longer needed. The job opening is kept.`,
      type: 'warning', confirmText: 'Remove',
    });
    if (ok) run(() => deleteVacancy(vacancy.id));
  };

  return (
    <Modal title={vacancy.title} onClose={onClose} maxWidth={460}>
      <div className="input-group">
        <label className="input-label" htmlFor="vac-job">Linked ATS job</label>
        <select id="vac-job" className="input-field" value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">Not linked</option>
          {vacancy.job_id && !jobs.some((j) => j.id === vacancy.job_id) && (
            <option value={vacancy.job_id}>{vacancy.job_title} ({vacancy.job_status})</option>
          )}
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.status})</option>)}
        </select>
      </div>
      {error && <div role="alert" className="oe-error">{error}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>Remove</button>
        {!vacancy.job_id && user?.permissions?.['ats:job:manage'] && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={createJob}>Create draft job</button>
        )}
        <button
          type="button" className="btn btn-primary" disabled={busy || jobId === (vacancy.job_id || '')}
          onClick={() => run(() => updateVacancy(vacancy.id, { job_id: jobId || null }))}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
