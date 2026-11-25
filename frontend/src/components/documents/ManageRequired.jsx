import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '../Modal';
import { usePopup } from '../../context/PopupContext';
import { getDepartments } from '../../api/employees';
import {
  archiveRequiredDocument, createRequiredDocument, getRequiredDocuments, updateRequiredDocument,
} from '../../api/documents';
import { errorText } from '../policies/shared';
import { DOCUMENTS_CHANGED, EMPLOYMENT_TYPES, NoRequiredDocuments } from './shared';

const COMMON = ['PAN Card', 'Aadhaar Card', 'Passport', 'Bank Passbook / Cancelled Cheque', 'Highest Degree',
  'Previous Relieving Letter', 'Last 3 Payslips', 'Passport Size Photo'];

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function CheckGroup({ label, options, selected, onChange }) {
  return (
    <fieldset className="doc-checks">
      <legend className="input-label">{label}</legend>
      {options.map(([value, text]) => (
        <label key={value}>
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(toggle(selected, value))} /> {text}
        </label>
      ))}
      <p className="doc-muted">{selected.length ? 'Only the ticked ones.' : 'Nothing ticked: everyone.'}</p>
    </fieldset>
  );
}

function Editor({ doc, departments, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: doc?.name || '', instructions: doc?.instructions || '', mandatory: doc?.mandatory ?? true,
    department_ids: doc?.department_ids || [], employment_types: doc?.employment_types || [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // A department deleted since is shown so it can be unticked.
  const known = departments.map((d) => [d.id, d.name]);
  const options = [
    ...known,
    ...(doc?.department_ids || []).filter((id) => !known.some(([k]) => k === id)).map((id) => [id, 'Deleted department']),
  ];

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await (doc ? updateRequiredDocument(doc.id, form) : createRequiredDocument(form));
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={doc ? 'Edit document' : 'Add document'} onClose={onClose}>
      <form onSubmit={save}>
        {error && <div className="doc-error" role="alert">{error}</div>}
        <div className="input-group">
          <label className="input-label" htmlFor="doc-name">Name</label>
          <input
            id="doc-name" className="input-field" list="doc-common" maxLength={100} required placeholder="e.g. PAN Card"
            value={form.name} onChange={(e) => set({ name: e.target.value })}
          />
          <datalist id="doc-common">{COMMON.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="doc-help">Instructions (optional)</label>
          <input
            id="doc-help" className="input-field" maxLength={300} placeholder="e.g. Both sides in one PDF"
            value={form.instructions} onChange={(e) => set({ instructions: e.target.value })}
          />
        </div>
        <label className="doc-check">
          <input type="checkbox" checked={form.mandatory} onChange={(e) => set({ mandatory: e.target.checked })} /> Mandatory
        </label>
        <CheckGroup
          label="Departments" options={options}
          selected={form.department_ids} onChange={(v) => set({ department_ids: v })}
        />
        <CheckGroup
          label="Employment types" options={EMPLOYMENT_TYPES}
          selected={form.employment_types} onChange={(v) => set({ employment_types: v })}
        />
        {form.department_ids.length > 0 && form.employment_types.length > 0 && (
          <p className="doc-muted">Asked only from people who match both.</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ManageRequired({ startAdding = false }) {
  const { showAlert, showConfirm } = usePopup();
  const [docs, setDocs] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(startAdding ? 'new' : null); // a document, or 'new'
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    return Promise.all([getRequiredDocuments(), getDepartments()])
      .then(([d, deps]) => { setDocs(d.data); setDepartments(deps.data); })
      .catch((err) => setError(errorText(err, 'Could not load the documents.')));
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = () => {
    load();
    window.dispatchEvent(new Event(DOCUMENTS_CHANGED));
  };

  const archive = async (doc) => {
    if (!doc.archived) {
      const ok = await showConfirm({
        title: 'Archive document',
        message: `Stop asking employees for "${doc.name}"? Files already uploaded are kept.`,
        type: 'warning',
        confirmText: 'Archive',
      });
      if (!ok) return;
    }
    try {
      await archiveRequiredDocument(doc.id, !doc.archived);
      changed();
    } catch (err) {
      showAlert({ title: 'Update Failed', message: errorText(err, 'Could not update.'), type: 'error' });
    }
  };

  const appliesTo = (doc) => {
    const parts = [];
    if (doc.department_ids.length) {
      parts.push(doc.department_ids.map((id) => departments.find((d) => d.id === id)?.name || 'Deleted department').join(', '));
    }
    if (doc.employment_types.length) {
      parts.push(EMPLOYMENT_TYPES.filter(([v]) => doc.employment_types.includes(v)).map(([, l]) => l).join(', '));
    }
    return parts.join(' + ') || 'Everyone';
  };

  return (
    <>
      {docs?.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Add document</button>
        </div>
      )}
      {error && (
        <div className="doc-error" role="alert">
          {error} <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {!docs && !error && <p className="doc-muted">Loading...</p>}
      {docs?.length === 0 && <NoRequiredDocuments onAdd={() => setEditing('new')} />}
      {docs?.length > 0 && (
        <div className="section-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Document</th><th>Asked from</th><th>Type</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {[...docs].sort((a, b) => a.archived - b.archived).map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <strong>{doc.name}</strong>
                    {doc.instructions && <p className="doc-muted">{doc.instructions}</p>}
                  </td>
                  <td>{appliesTo(doc)}</td>
                  <td>{doc.archived ? 'Archived' : doc.mandatory ? 'Mandatory' : 'Optional'}</td>
                  <td>
                    <div className="doc-actions" style={{ justifyContent: 'flex-end' }}>
                      {!doc.archived && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(doc)}>Edit</button>
                      )}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => archive(doc)}>
                        {doc.archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Editor
          doc={editing === 'new' ? null : editing} departments={departments}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }}
        />
      )}
    </>
  );
}
