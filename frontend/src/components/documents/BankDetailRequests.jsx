import { useCallback, useEffect, useState } from 'react';
import { Check, X, Paperclip } from 'lucide-react';
import { usePopup } from '../../context/PopupContext';
import { errorText, dateLabel } from '../policies/shared';
import { openBlob } from './shared';
import { getBankDetailRequests, reviewBankDetailRequest, getBankDetailProof } from '../../api/bankDetails';
import useUrlFilters from '../../utils/useUrlFilters';

const STATUSES = [['pending', 'Waiting for review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']];
const BADGE = { pending: 'badge-pending', approved: 'badge-active', rejected: 'badge-rejected', cancelled: 'badge-info' };

/** One "current → requested" line; unchanged values are not shown. */
function Change({ label, from, to }) {
  if (!to) return null;
  return (
    <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
      <span className="doc-muted">{label}: </span>
      {from && from !== to && <span style={{ textDecoration: 'line-through', color: '#94a3b8', marginRight: 6 }}>{from}</span>}
      <strong>{to}</strong>
    </div>
  );
}

/** HR: employees' PAN / bank changes. Approving writes them onto the employee record. */
export default function BankDetailRequests() {
  const { showAlert, showConfirm, showPrompt, showToast } = usePopup();
  const [filters, setFilters] = useUrlFilters({ bank_status: 'pending' });
  const status = STATUSES.some(([id]) => id === filters.bank_status) ? filters.bank_status : 'pending';
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError('');
    getBankDetailRequests(status)
      .then((r) => setRows(r.data))
      .catch((err) => setError(errorText(err, 'Could not load the requests.')));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const decide = async (r, decision) => {
    let note = null;
    if (decision === 'rejected') {
      note = await showPrompt({ title: 'Reject change', message: `Tell ${r.employee_name} why (they will see this).` });
      if (!note?.trim()) return;
    } else {
      const ok = await showConfirm({
        title: 'Approve bank / PAN change?',
        message: `${r.employee_name}'s record will be updated and the next payroll will pay into the new account. Check the proof first.`,
        type: 'warning', confirmText: 'Approve',
      });
      if (!ok) return;
    }
    setBusy(r.id);
    try {
      await reviewBankDetailRequest(r.id, decision, note);
      showToast({ message: decision === 'approved' ? 'Approved and saved.' : 'Rejected.', type: 'success' });
      load();
    } catch (err) {
      showAlert({ title: 'Action failed', message: errorText(err, 'Please try again.'), type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="doc-filters">
        <select className="input-field" aria-label="Status" value={status} onChange={(e) => setFilters({ bank_status: e.target.value })}>
          {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      {error && <div className="doc-error" role="alert">{error}</div>}
      {!rows && !error && <p className="doc-muted">Loading...</p>}
      {rows && (
        <div className="section-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Requested change</th>
                <th>Proof</th>
                <th>Sent</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>{r.employee_name}</strong>
                    <p className="doc-muted">{r.employee_code}</p>
                  </td>
                  <td>
                    <Change label="PAN" from={r.current?.pan_number} to={r.pan_number} />
                    <Change label="Account" from={r.current?.bank_account_masked} to={r.bank_account_number} />
                    <Change label="IFSC" from={r.current?.bank_ifsc} to={r.bank_ifsc} />
                    <Change label="Bank" from={r.current?.bank_name} to={r.bank_name} />
                    {r.review_note && <p className="doc-muted">Note: {r.review_note}</p>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.has_proof ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openBlob(() => getBankDetailProof(r.id)).catch(() => {})}>
                        <Paperclip size={14} /> View
                      </button>
                    ) : <span className="doc-muted">None</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dateLabel(r.created_at)}</td>
                  <td><span className={`badge ${BADGE[r.status] || ''}`}>{r.status}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.status === 'pending' ? (
                      <div className="table-row-actions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-success btn-sm" disabled={busy === r.id} onClick={() => decide(r, 'approved')}>
                          <Check size={14} /> Approve
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" disabled={busy === r.id} onClick={() => decide(r, 'rejected')}>
                          <X size={14} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="doc-muted">{r.reviewed_by_name ? `by ${r.reviewed_by_name}` : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} className="doc-empty">{status === 'pending' ? 'Nothing waiting for review.' : 'No requests.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
