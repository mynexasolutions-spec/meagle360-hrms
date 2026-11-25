import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Plus, Upload } from 'lucide-react';
import Modal from '../Modal';
import { usePopup } from '../../context/PopupContext';
import {
  createPolicy, deletePolicy, getManagedPolicies, getPolicyReport, getPolicyVersions, publishPolicy,
  removePolicyPdf, reorderPolicies, resetPolicy, setPolicyHidden, updatePolicy, uploadPolicyPdf,
} from '../../api/policies';
import { PolicyText, announceChange, dateLabel, errorText, openPdf } from './shared';

const STATUS = {
  draft: { label: 'Draft', badge: 'badge-pending' },
  published: { label: 'Published', badge: 'badge-active' },
  hidden: { label: 'Hidden', badge: 'policy-badge-grey' },
};

function Editor({ policy, onClose, reload }) {
  const { showConfirm } = usePopup();
  const [saved, setSaved] = useState(policy); // null until a new policy is first saved
  const [form, setForm] = useState({
    title: policy?.title || '', body: policy?.body || '', requires_ack: policy?.requires_ack || false,
  });
  const [askAgain, setAskAgain] = useState(true);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dirty = !saved || ['title', 'body', 'requires_ack'].some((k) => form[k] !== saved[k]);

  const run = async (work, fallback) => {
    setBusy(true);
    setError('');
    try {
      return await work();
    } catch (err) {
      setError(errorText(err, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const store = async () => {
    const res = saved ? await updatePolicy(saved.id, form) : await createPolicy(form);
    setSaved(res.data);
    setForm({ title: res.data.title, body: res.data.body, requires_ack: res.data.requires_ack });
    await reload();
    announceChange();
    return res.data;
  };

  const save = () => run(store, 'Could not save the policy.');

  const publish = async () => {
    await run(async () => {
      const current = dirty ? await store() : saved;
      await publishPolicy(current.id, askAgain);
      await reload();
      announceChange();
      onClose();
    }, 'Could not publish the policy.');
  };

  const pickPdf = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('The PDF must be 2 MB or smaller.');
      return;
    }
    await run(async () => {
      const current = dirty ? await store() : saved;
      const res = await uploadPolicyPdf(current.id, file);
      setSaved(res.data);
      await reload();
    }, 'Could not upload the PDF.');
  };

  const removePdf = () => run(async () => {
    const res = await removePolicyPdf(saved.id);
    setSaved(res.data);
    await reload();
  }, 'Could not remove the PDF.');

  const reset = async () => {
    const ok = await showConfirm({
      title: 'Reset to default',
      message: 'Your draft text and PDF will be replaced by the default text. What employees see does not change until you publish.',
      type: 'warning', confirmText: 'Reset',
    });
    if (!ok) return;
    await run(async () => {
      const res = await resetPolicy(saved.id);
      setSaved(res.data);
      setForm((f) => ({ ...f, title: res.data.title, body: res.data.body }));
      await reload();
    }, 'Could not reset the policy.');
  };

  const close = async () => {
    const touched = saved ? dirty : form.title || form.body;
    if (touched) {
      const ok = await showConfirm({
        title: 'Unsaved changes', message: 'Close without saving?', type: 'warning', confirmText: 'Close',
      });
      if (!ok) return;
    }
    onClose();
  };

  const canPublish = form.title.trim() && (form.body.trim() || saved?.attachment_name)
    && (dirty || saved?.status !== 'published' || saved?.has_changes);

  return (
    <Modal title={saved ? 'Edit policy' : 'New policy'} onClose={close} maxWidth={860}>
      {saved?.is_default && (
        <div className="policy-notice">
          This started from a standard template. Please have HR or a lawyer check that it suits your company.
        </div>
      )}
      <div className="input-group">
        <label className="input-label" htmlFor="policy-title">Title</label>
        <input
          id="policy-title" className="input-field" maxLength={200}
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div className="input-group">
        <div className="policy-row">
          <label className="input-label" htmlFor="policy-body">Text</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(!preview)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {preview
          ? <div className="policy-preview"><PolicyText text={form.body} /></div>
          : (
            <textarea
              id="policy-body" className="input-field" rows={14} maxLength={100000}
              value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          )}
        <p className="policy-muted">Start a line with ## for a heading and - for a bullet.</p>
      </div>
      <div className="policy-row policy-pdf">
        {saved?.attachment_name ? (
          <>
            <span><FileText size={15} /> {saved.attachment_name}</span>
            <div className="policy-actions">
              <button
                type="button" className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => openPdf(saved.id, true).catch((err) => setError(errorText(err, 'Could not open the PDF.')))}
              >
                Open
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={removePdf}>Remove</button>
            </div>
          </>
        ) : (
          <>
            <span className="policy-muted">PDF (optional, up to 2 MB)</span>
            <label className={`btn btn-secondary btn-sm${busy || !form.title.trim() ? ' policy-disabled' : ''}`}>
              <Upload size={14} /> Attach PDF
              <input type="file" accept="application/pdf" hidden disabled={busy || !form.title.trim()} onChange={pickPdf} />
            </label>
          </>
        )}
      </div>
      <label className="policy-check">
        <input
          type="checkbox" checked={form.requires_ack}
          onChange={(e) => setForm({ ...form, requires_ack: e.target.checked })}
        />
        Employees must agree to this policy
      </label>
      {form.requires_ack && saved?.published_version > 0 && (
        <label className="policy-check">
          <input type="checkbox" checked={askAgain} onChange={(e) => setAskAgain(e.target.checked)} />
          Ask everyone to agree again when I publish (turn off for small fixes)
        </label>
      )}
      {error && <div className="policy-error" role="alert">{error}</div>}
      <div className="policy-row policy-footer">
        {saved?.is_default
          ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>Reset to default</button>
          : <span />}
        <div className="policy-actions">
          <button type="button" className="btn btn-secondary" disabled={busy || !dirty || !form.title.trim()} onClick={save}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !canPublish} onClick={publish}>
            {busy ? 'Please wait...' : 'Publish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function useLoaded(fetcher) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stale = false;
    fetcher()
      .then((r) => { if (!stale) setRows(r.data); })
      .catch((err) => { if (!stale) setError(errorText(err, 'Could not load this.')); });
    return () => { stale = true; };
    // Loaded once per opened modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [rows, error];
}

function Report({ policy, onClose }) {
  const [rows, error] = useLoaded(() => getPolicyReport(policy.id));
  const [show, setShow] = useState('all');
  const visible = (rows || []).filter((r) => show === 'all' || r.agreed === (show === 'agreed'));
  return (
    <Modal title={`Who agreed: ${policy.title}`} onClose={onClose} maxWidth={720}>
      {error && <div className="policy-error" role="alert">{error}</div>}
      {!rows && !error && <p className="policy-muted">Loading...</p>}
      {rows && (
        <>
          <div className="policy-row">
            <strong>{rows.filter((r) => r.agreed).length} of {rows.length} agreed</strong>
            <select
              className="input-field" aria-label="Show" style={{ maxWidth: 170 }}
              value={show} onChange={(e) => setShow(e.target.value)}
            >
              <option value="all">Everyone</option>
              <option value="agreed">Agreed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Status</th><th>Version</th><th>Date</th></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.employee_id}>
                    <td>{r.employee_name} ({r.employee_code})</td>
                    <td>
                      <span className={`badge ${r.agreed ? 'badge-active' : 'badge-pending'}`}>
                        {r.agreed ? 'Agreed' : 'Pending'}
                      </span>
                    </td>
                    <td>{r.version ?? '-'}</td>
                    <td>{r.acknowledged_at ? dateLabel(r.acknowledged_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function History({ policy, onClose }) {
  const [rows, error] = useLoaded(() => getPolicyVersions(policy.id));
  return (
    <Modal title={`History: ${policy.title}`} onClose={onClose} maxWidth={720}>
      {error && <div className="policy-error" role="alert">{error}</div>}
      {!rows && !error && <p className="policy-muted">Loading...</p>}
      {rows?.map((v) => (
        <details key={v.version} className="policy-version">
          <summary>
            Version {v.version} · {dateLabel(v.published_at)}{v.published_by ? ` · ${v.published_by}` : ''}
          </summary>
          <h3>{v.title}</h3>
          <PolicyText text={v.body} />
        </details>
      ))}
    </Modal>
  );
}

export default function ManagePolicies() {
  const { showConfirm } = usePopup();
  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null); // { type, policy }

  const load = useCallback(async () => {
    try {
      const res = await getManagedPolicies();
      setPolicies(res.data);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load the policies.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (work, fallback) => {
    setBusy(true);
    try {
      await work();
      await load();
      announceChange();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const move = (index, by) => {
    const ids = policies.map((p) => p.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    return act(() => reorderPolicies(ids), 'Could not change the order.');
  };

  const toggleHidden = async (p) => {
    const hide = p.status !== 'hidden';
    if (hide && p.status === 'published') {
      const ok = await showConfirm({
        title: 'Hide policy', message: `Employees will no longer see "${p.title}".`,
        type: 'warning', confirmText: 'Hide',
      });
      if (!ok) return;
    }
    act(() => setPolicyHidden(p.id, hide), 'Could not change the policy.');
  };

  const remove = async (p) => {
    const ok = await showConfirm({
      title: 'Delete policy', message: `Delete "${p.title}"? Employees will no longer see it. This cannot be undone.`,
      type: 'danger', confirmText: 'Delete',
    });
    if (ok) act(() => deletePolicy(p.id), 'Could not delete the policy.');
  };

  if (!policies) {
    return (
      <div className="glass-card policy-empty" role={error ? 'alert' : undefined}>
        <p>{error || 'Loading...'}</p>
        {error && <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}
      </div>
    );
  }

  const close = () => setModal(null);
  return (
    <>
      <div className="policy-row policy-manage-head">
        <p className="policy-muted">Employees see your changes only after you publish them.</p>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'edit', policy: null })}>
          <Plus size={16} /> New policy
        </button>
      </div>
      {error && <div className="policy-error" role="alert">{error}</div>}
      <div className="glass-card policy-manage">
        {policies.map((p, i) => (
          <div key={p.id} className="policy-item">
            <div className="policy-order">
              <button
                type="button" className="btn-icon btn-ghost" aria-label={`Move ${p.title} up`}
                disabled={busy || i === 0} onClick={() => move(i, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button" className="btn-icon btn-ghost" aria-label={`Move ${p.title} down`}
                disabled={busy || i === policies.length - 1} onClick={() => move(i, 1)}
              >
                <ArrowDown size={15} />
              </button>
            </div>
            <div className="policy-item-main">
              <strong>{p.title}</strong>
              <div className="policy-tags">
                <span className={`badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span>
                {p.has_changes && <span className="badge badge-info">Unpublished changes</span>}
                {p.published_version > 0 && <span className="policy-muted">Version {p.published_version}</span>}
                {p.requires_ack && p.status === 'published' && (
                  <span className="policy-muted">{p.agreed_count} of {p.employee_count} agreed</span>
                )}
              </div>
            </div>
            <div className="policy-actions">
              {p.requires_ack && p.published_version > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'report', policy: p })}>
                  Report
                </button>
              )}
              {p.published_version > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'history', policy: p })}>
                  History
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => toggleHidden(p)}>
                {p.status === 'hidden' ? 'Show' : 'Hide'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(p)}>Delete</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'edit', policy: p })}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
      {modal?.type === 'edit' && <Editor policy={modal.policy} onClose={close} reload={load} />}
      {modal?.type === 'report' && <Report policy={modal.policy} onClose={close} />}
      {modal?.type === 'history' && <History policy={modal.policy} onClose={close} />}
    </>
  );
}
