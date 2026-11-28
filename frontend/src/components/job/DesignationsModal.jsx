import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import { createDesignation, deleteDesignation, getDesignations, updateDesignation } from '../../api/employees';
import { usePopup } from '../../context/PopupContext';
import errorText from '../../utils/errorText';

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

const bySeniority = (a, b) => (b.level || 0) - (a.level || 0) || a.title.localeCompare(b.title);

function LevelSelect({ value, onChange, label, allowEmpty }) {
  return (
    <select className="input-field" style={{ width: 120 }} value={value || ''} onChange={onChange} aria-label={label}>
      {allowEmpty && <option value="">No level</option>}
      {LEVELS.map((l) => <option key={l} value={l}>Level {l}</option>)}
    </select>
  );
}

export default function DesignationsModal({ onClose }) {
  const { showConfirm } = usePopup();
  const [rows, setRows] = useState(null);
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('1');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => setRows((await getDesignations()).data.sort(bySeniority));

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e, 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    run(() => {});
  }, []);

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await createDesignation({ title, level: Number(level) });
      setTitle('');
    });
  };

  const remove = async (d) => {
    const ok = await showConfirm({
      title: 'Delete designation', message: `Delete ${d.title}?`, type: 'warning', confirmText: 'Delete',
    });
    if (ok) run(() => deleteDesignation(d.id));
  };

  return (
    <Modal sheet title="Designations" onClose={onClose} maxWidth={560}>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 14 }}>
        A higher level is more senior. Promote only offers higher levels, and Demote only lower ones.
      </p>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input-field" style={{ flex: 1, minWidth: 160 }} placeholder="e.g. Senior Engineer"
          aria-label="Title" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} required
        />
        <LevelSelect value={level} onChange={(e) => setLevel(e.target.value)} label="Level" />
        <button className="btn btn-primary" disabled={busy}><Plus size={16} /> Add</button>
      </form>
      {error && <div role="alert" style={{ color: 'var(--accent-rose)', fontSize: '0.875rem', marginBottom: 10 }}>{error}</div>}
      {!rows && !error && <p>Loading...</p>}
      {rows?.length === 0 && <p>No designations yet. Add the first one above.</p>}
      {rows?.map((d) => (
        <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ flex: 1, opacity: d.is_active ? 1 : 0.5 }}>{d.title}{!d.is_active && ' (not in use)'}</span>
          <LevelSelect
            value={d.level} allowEmpty={!d.level} label={`Level of ${d.title}`}
            onChange={(e) => e.target.value && run(() => updateDesignation(d.id, { level: Number(e.target.value) }))}
          />
          <button type="button" className="btn-icon btn-ghost" disabled={busy} onClick={() => remove(d)} aria-label={`Delete ${d.title}`}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </Modal>
  );
}
