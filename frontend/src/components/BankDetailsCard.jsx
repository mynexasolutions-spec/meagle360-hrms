import { useEffect, useState } from 'react';
import { Landmark, Pencil, Clock, CheckCircle2, XCircle, Paperclip } from 'lucide-react';
import Modal from './Modal';
import { usePopup } from '../context/PopupContext';
import { MAX_BYTES, openBlob } from './documents/shared';
import { errorText } from './policies/shared';
import {
  getMyBankDetails, requestBankDetailChange, cancelBankDetailRequest, lookupIfsc, getBankDetailProof,
} from '../api/bankDetails';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const EMPTY = { pan_number: '', bank_account_number: '', confirm_account: '', bank_ifsc: '', bank_name: '', proof: null };

const clean = (v) => v.replace(/\s+/g, '').toUpperCase();

function Row({ label, value }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#3d4a5e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{value || '—'}</div>
    </div>
  );
}

/** My Profile: PAN and bank account. Changes go to HR before payroll uses them. */
export default function BankDetailsCard() {
  const { showAlert, showConfirm, showToast } = usePopup();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [branch, setBranch] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => getMyBankDetails().then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data) return null;
  const { current, latest_request: latest } = data;
  const pending = latest?.status === 'pending' ? latest : null;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const openForm = () => {
    setForm({ ...EMPTY, pan_number: current.pan_number || '', bank_ifsc: current.bank_ifsc || '', bank_name: current.bank_name || '' });
    setBranch('');
    setEditing(true);
  };

  const handleIfsc = async () => {
    const code = clean(form.bank_ifsc);
    setForm((f) => ({ ...f, bank_ifsc: code }));
    setBranch('');
    if (!IFSC_RE.test(code)) return;
    setLookingUp(true);
    try {
      const { data: bank } = await lookupIfsc(code);
      setForm((f) => ({ ...f, bank_name: bank.bank || f.bank_name }));
      setBranch([bank.branch, bank.city].filter(Boolean).join(', '));
    } catch (err) {
      setBranch(err.response?.status === 404 ? 'No bank branch has this IFSC code.' : '');
    } finally {
      setLookingUp(false);
    }
  };

  const handleProof = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && (!PROOF_TYPES.includes(file.type) || file.size > MAX_BYTES)) {
      showAlert({ title: 'Unsupported file', message: 'Attach a PDF, JPG or PNG of up to 2 MB.', type: 'error' });
      e.target.value = '';
      return;
    }
    setForm({ ...form, proof: file });
  };

  // Only what actually changed is sent. Bank fields always go together.
  const buildChanges = () => {
    const pan = clean(form.pan_number);
    const account = form.bank_account_number.replace(/\s+/g, '');
    const ifsc = clean(form.bank_ifsc);
    const bankName = form.bank_name.trim();
    const changes = {};
    if (pan && pan !== current.pan_number) {
      if (!PAN_RE.test(pan)) throw new Error('PAN must look like ABCDE1234F.');
      changes.pan_number = pan;
    }
    const bankTouched = account || (ifsc && ifsc !== current.bank_ifsc) || (bankName && bankName !== current.bank_name);
    if (bankTouched) {
      if (!account) throw new Error('Enter your account number to change bank details.');
      if (!ACCOUNT_RE.test(account)) throw new Error('Account number must be 9 to 18 digits.');
      if (account !== form.confirm_account.replace(/\s+/g, '')) throw new Error('The two account numbers do not match.');
      if (!IFSC_RE.test(ifsc)) throw new Error('IFSC must be 11 characters, like SBIN0001234.');
      if (!bankName) throw new Error('Enter the bank name.');
      Object.assign(changes, { bank_account_number: account, bank_ifsc: ifsc, bank_name: bankName });
    }
    return changes;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let changes;
    try {
      changes = buildChanges();
    } catch (err) {
      showAlert({ title: 'Check your details', message: err.message, type: 'error' });
      return;
    }
    if (!Object.keys(changes).length) {
      showAlert({ title: 'Nothing to change', message: 'These are already your details.', type: 'info' });
      return;
    }
    setSaving(true);
    try {
      await requestBankDetailChange({ ...changes, proof: form.proof });
      setEditing(false);
      showToast({ message: 'Sent to HR for approval.', type: 'success' });
      load();
    } catch (err) {
      showAlert({ title: 'Could not send', message: errorText(err, 'Please try again.'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    const ok = await showConfirm({ title: 'Withdraw this change?', message: 'HR will no longer see it.', type: 'warning', confirmText: 'Withdraw' });
    if (!ok) return;
    try {
      await cancelBankDetailRequest(pending.id);
      load();
    } catch (err) {
      showAlert({ title: 'Could not withdraw', message: errorText(err, 'Please try again.'), type: 'error' });
    }
  };

  return (
    <div className="section-card" style={{ marginBottom: 24, borderTop: '3px solid #059669' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Landmark size={20} style={{ color: '#059669' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>Bank &amp; Tax Details</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: '#3d4a5e' }}>Your salary is paid into this account. HR approves every change.</p>
          </div>
        </div>
        {!pending && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={openForm}>
            <Pencil size={14} /> {current.pan_number || current.bank_account_masked ? 'Request change' : 'Add details'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <Row label="PAN" value={current.pan_number} />
        <Row label="Bank Name" value={current.bank_name} />
        <Row label="Account No." value={current.bank_account_masked} />
        <Row label="IFSC" value={current.bank_ifsc} />
      </div>

      {pending && (
        <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: '#92400e', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock size={15} />
            <span>
              <strong>Waiting for HR:</strong>{' '}
              {[pending.pan_number && `PAN ${pending.pan_number}`,
                pending.bank_account_masked && `${pending.bank_name} ${pending.bank_account_masked}`].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            {pending.has_proof && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openBlob(() => getBankDetailProof(pending.id)).catch(() => {})}>
                <Paperclip size={14} /> Proof
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>Withdraw</button>
          </span>
        </div>
      )}
      {latest?.status === 'approved' && (
        <p style={{ marginTop: 12, fontSize: '0.8125rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} /> Your last change was approved{latest.reviewed_by_name ? ` by ${latest.reviewed_by_name}` : ''}. Payslips from the next payroll use it.
        </p>
      )}
      {latest?.status === 'rejected' && (
        <p style={{ marginTop: 12, fontSize: '0.8125rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
          <XCircle size={14} /> Your last change was rejected: {latest.review_note}
        </p>
      )}

      {editing && (
        <Modal title="Bank & Tax Details" onClose={() => setEditing(false)}>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label" htmlFor="bd-pan">PAN</label>
              <input id="bd-pan" className="input-field" maxLength={10} placeholder="ABCDE1234F" autoComplete="off"
                value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value.toUpperCase() })} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
              To change your bank account, fill in all bank fields. Leave them as they are to change only your PAN.
            </p>
            <div className="input-group">
              <label className="input-label" htmlFor="bd-acc">Account Number</label>
              <input id="bd-acc" className="input-field" inputMode="numeric" maxLength={22} autoComplete="off"
                placeholder={current.bank_account_masked ? `Current: ${current.bank_account_masked}` : ''}
                value={form.bank_account_number} onChange={set('bank_account_number')} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="bd-acc2">Confirm Account Number</label>
              <input id="bd-acc2" className="input-field" inputMode="numeric" maxLength={22} autoComplete="off"
                value={form.confirm_account} onChange={set('confirm_account')} onPaste={(e) => e.preventDefault()} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="bd-ifsc">IFSC</label>
              <input id="bd-ifsc" className="input-field" maxLength={11} placeholder="SBIN0001234" autoComplete="off"
                value={form.bank_ifsc} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })} onBlur={handleIfsc} />
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {lookingUp ? 'Looking up branch…' : branch || 'The bank name fills in from the IFSC.'}
              </small>
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="bd-bank">Bank Name</label>
              <input id="bd-bank" className="input-field" maxLength={150} value={form.bank_name} onChange={set('bank_name')} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="bd-proof">Proof (recommended)</label>
              <input id="bd-proof" type="file" className="input-field" accept="application/pdf,image/jpeg,image/png" onChange={handleProof} />
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {form.proof ? `Selected: ${form.proof.name}` : 'Cancelled cheque, passbook page or PAN card. PDF, JPG or PNG, up to 2 MB.'}
              </small>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send to HR'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
