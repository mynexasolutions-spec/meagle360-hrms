import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';
import {
  getExpenseCategories, submitExpenseClaim, getMyExpenseClaims,
  getPendingExpenseClaims, getAllExpenseClaims, approveRejectExpense, reimburseExpense, getExpenseReceipt,
} from '../api/expenses';
import { Receipt, Plus, Check, X, Clock, Wallet, CheckSquare, Paperclip, Tags } from 'lucide-react';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import ExpenseCategoriesModal from '../components/ExpenseCategoriesModal';
import { openBlob, MAX_BYTES as MAX_RECEIPT_BYTES } from '../components/documents/shared';
import useUrlFilters from '../utils/useUrlFilters';
import EmployeeLink from '../components/EmployeeLink';

const EMPTY_FORM = { category_id: '', amount: '', expense_date: '', description: '', receipt: null };
const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function ExpenseManagement() {
  const { user } = useAuth();
  const { showAlert, showToast } = usePopup();
  const canSubmit = !!user?.permissions?.['expenses:write'];
  const canApprove = !!user?.permissions?.['expenses:approve'];
  const canManageCategories = !!user?.permissions?.['settings:write'];
  const [showCategories, setShowCategories] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useUrlFilters({ tab: 'my-claims', status: '' });
  const allowedTabs = ['my-claims', ...(canApprove ? ['approvals', 'ledger'] : [])];
  const tab = allowedTabs.includes(filters.tab) ? filters.tab : 'my-claims';
  const setTab = (next) => setFilters({ tab: next, status: '' });
  const matchesStatus = (c) => !filters.status || c.status === filters.status;
  // Clicking the active card again clears it.
  const myClaimsCard = (status) => {
    const active = tab === 'my-claims' && filters.status === status;
    return { active, onClick: () => setFilters({ tab: 'my-claims', status: active ? '' : status }) };
  };
  const [categories, setCategories] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [pending, setPending] = useState([]);
  const [allClaims, setAllClaims] = useState([]);
  const [showSubmit, setShowSubmit] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitBtnHover, setSubmitBtnHover] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user?.id, canApprove]);

  const loadData = async () => {
    try {
      const [catRes, myRes, pendRes, allRes] = await Promise.all([
        getExpenseCategories().catch(() => ({ data: [] })),
        getMyExpenseClaims().catch(() => ({ data: [] })),
        canApprove ? getPendingExpenseClaims().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        canApprove ? getAllExpenseClaims().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setCategories(catRes.data);
      setMyClaims(myRes.data);
      setPending(pendRes.data);
      setAllClaims(allRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReceiptChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && !RECEIPT_TYPES.includes(file.type)) {
      showAlert({ title: 'Unsupported file', message: 'Only PDF, JPG and PNG receipts are accepted.', type: 'error' });
      e.target.value = '';
      return;
    }
    if (file && file.size > MAX_RECEIPT_BYTES) {
      showAlert({ title: 'File too large', message: 'The receipt must be 2 MB or smaller.', type: 'error' });
      e.target.value = '';
      return;
    }
    setForm({ ...form, receipt: file });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitExpenseClaim(form);
      setShowSubmit(false);
      setForm(EMPTY_FORM);
      loadData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      showAlert({
        title: 'Submission Failed',
        message: typeof detail === 'string' ? detail : 'Failed to submit expense claim',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const viewReceipt = async (claim) => {
    try {
      await openBlob(() => getExpenseReceipt(claim.id));
    } catch (err) {
      showAlert({ title: 'Could not open receipt', message: 'Please try again.', type: 'error' });
    }
  };

  // Uploaded file, or a link from before uploads existed.
  const receiptCell = (c) => {
    if (c.has_receipt) {
      return (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => viewReceipt(c)} title={c.receipt_filename || 'Receipt'}>
          <Paperclip size={14} /> View
        </button>
      );
    }
    if (/^https?:\/\//i.test(c.receipt_url || '')) {
      return <a href={c.receipt_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Paperclip size={14} /> Link</a>;
    }
    return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  };

  const handleApproval = async (id, status) => {
    try {
      await approveRejectExpense(id, status);
      loadData();
    } catch (err) {
      showAlert({
        title: 'Action Failed',
        message: err.response?.data?.detail || 'Failed to complete expense action',
        type: 'error',
      });
    }
  };

  const handleReimburse = async (id) => {
    try {
      await reimburseExpense(id);
      loadData();
    } catch (err) {
      showAlert({
        title: 'Action Failed',
        message: err.response?.data?.detail || 'Failed to complete expense action',
        type: 'error',
      });
    }
  };

  // Mobile card equivalent of a table row.
  const renderCard = (c, { showEmployee = false, actions = null } = {}) => (
    <div className="expense-card" key={c.id}>
      <div className="expense-card-top">
        <div style={{ minWidth: 0 }}>
          {showEmployee && <div className="expense-card-emp"><EmployeeLink id={c.employee_id}>{c.employee_name || '—'}</EmployeeLink></div>}
          <div className="expense-card-cat">{c.category_name || 'Uncategorised'}</div>
        </div>
        <span className={`badge badge-${c.status}`}>{c.status}</span>
      </div>
      <div className="expense-card-amount">₹{Number(c.amount).toFixed(2)}</div>
      <div className="expense-card-meta">
        <span>{c.expense_date}</span>
        {(c.has_receipt || /^https?:\/\//i.test(c.receipt_url || '')) && <span>{receiptCell(c)}</span>}
      </div>
      {c.description && <div className="expense-card-desc">{c.description}</div>}
      {actions && <div className="expense-card-actions">{actions}</div>}
    </div>
  );

  const totalPending = myClaims.filter((c) => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
  const totalReimbursed = myClaims.filter((c) => c.status === 'reimbursed').reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="animate-fade-in" style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header expense-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <Receipt size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Expense Management</h1>
            <p style={{ color: '#3d4a5e', fontSize: '0.875rem' }}>Submit claims, track approvals &amp; manage company reimbursements</p>
          </div>
        </div>
        <div className="expense-header-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {canManageCategories && (
          <button className="btn btn-secondary" onClick={() => setShowCategories(true)}>
            <Tags size={16} /> Categories
          </button>
        )}
        {canSubmit && (
          <button
            onClick={() => setShowSubmit(true)}
            onMouseEnter={() => setSubmitBtnHover(true)}
            onMouseLeave={() => setSubmitBtnHover(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: submitBtnHover ? '0 8px 20px rgba(37, 99, 235, 0.35)' : '0 4px 14px rgba(37, 99, 235, 0.25)',
              transform: submitBtnHover ? 'translateY(-1px)' : 'translateY(0)',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={18} /> Submit Expense
          </button>
        )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="stats-grid expense-stats" style={{ marginBottom: 28 }}>
        <StatCard
          icon={Clock}
          label="Pending Claims (Mine)"
          value={`₹${totalPending.toFixed(2)}`}
          {...myClaimsCard('pending')}
          color="#d97706"
          bgColor="var(--accent-amber-light)"
        />
        <StatCard
          icon={Wallet}
          label="Reimbursed Total (Mine)"
          value={`₹${totalReimbursed.toFixed(2)}`}
          {...myClaimsCard('reimbursed')}
          color="#059669"
          bgColor="var(--accent-emerald-light)"
        />
        {canApprove && (
          <StatCard
            icon={CheckSquare}
            label="Awaiting Approval Queue"
            value={`${pending.length} Claims`}
            active={tab === 'approvals'}
            onClick={() => setTab('approvals')}
            color="#2563eb"
            bgColor="var(--accent-blue-light)"
          />
        )}
      </div>

      {/* Modern Pill Tabs */}
      <div className="pill-tabs expense-tabs" style={{ marginBottom: 20 }}>
        <button
          onClick={() => setTab('my-claims')}
          style={{
            padding: '9px 18px',
            borderRadius: 12,
            fontSize: '0.85rem',
            fontWeight: 700,
            border: tab === 'my-claims' ? 'none' : '1px solid #cbd5e1',
            background: tab === 'my-claims' ? '#0f172a' : '#ffffff',
            color: tab === 'my-claims' ? '#ffffff' : '#475569',
            cursor: 'pointer',
            boxShadow: tab === 'my-claims' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
          }}
        >
          My Claims
        </button>
        {canApprove && (
          <button
            onClick={() => setTab('approvals')}
            style={{
              padding: '9px 18px',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 700,
              border: tab === 'approvals' ? 'none' : '1px solid #cbd5e1',
              background: tab === 'approvals' ? '#0f172a' : '#ffffff',
              color: tab === 'approvals' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              boxShadow: tab === 'approvals' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
            }}
          >
            Approval Queue ({pending.length})
          </button>
        )}
        {canApprove && (
          <button
            onClick={() => setTab('ledger')}
            style={{
              padding: '9px 18px',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 700,
              border: tab === 'ledger' ? 'none' : '1px solid #cbd5e1',
              background: tab === 'ledger' ? '#0f172a' : '#ffffff',
              color: tab === 'ledger' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              boxShadow: tab === 'ledger' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
            }}
          >
            All Claims
          </button>
        )}
        {tab !== 'approvals' && (
          <select
            className="input-field expense-status-filter" aria-label="Filter by status"
            style={{ maxWidth: 170, marginLeft: 'auto' }}
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value })}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="reimbursed">Reimbursed</option>
          </select>
        )}
      </div>

      {/* My Claims Table */}
      {tab === 'my-claims' && (
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <h3><Receipt size={18} style={{ color: 'var(--accent-blue)' }} /> My Expense Claims</h3>
          <div className="expense-table-view" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Description</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Receipt</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {myClaims.filter(matchesStatus).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.category_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{Number(c.amount).toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.expense_date}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.description || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{receiptCell(c)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="expense-cards">
            {myClaims.filter(matchesStatus).map((c) => renderCard(c))}
          </div>
          {myClaims.filter(matchesStatus).length === 0 && (
            <div className="empty-state">
              <Receipt size={48} />
              <p>{filters.status ? 'No claims match this filter' : 'No expense claims yet'}</p>
            </div>
          )}
        </div>
      )}

      {/* Approval Queue */}
      {tab === 'approvals' && (
        <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
          <h3><Clock size={18} style={{ color: 'var(--accent-amber)' }} /> Pending Approvals</h3>
          <div className="expense-table-view" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Description</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Receipt</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}><EmployeeLink id={c.employee_id}>{c.employee_name || '—'}</EmployeeLink></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.category_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{Number(c.amount).toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.expense_date}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.description || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{receiptCell(c)}</td>
                    <td>
                      <div className="table-row-actions">
                        <button className="btn btn-success btn-sm" onClick={() => handleApproval(c.id, 'approved')}>
                          <Check size={14} /> Approve
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleApproval(c.id, 'rejected')}>
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="expense-cards">
            {pending.map((c) => renderCard(c, { showEmployee: true, actions: (
              <>
                <button className="btn btn-success btn-sm" onClick={() => handleApproval(c.id, 'approved')}><Check size={14} /> Approve</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleApproval(c.id, 'rejected')}><X size={14} /> Reject</button>
              </>
            ) }))}
          </div>
          {pending.length === 0 && (
            <div className="empty-state">
              <Clock size={48} />
              <p>No pending approvals</p>
            </div>
          )}
        </div>
      )}

      {/* Ledger */}
      {tab === 'ledger' && (
        <div className="section-card" style={{ borderTop: '3px solid #7c3aed' }}>
          <h3><Wallet size={18} style={{ color: 'var(--accent-violet)' }} /> All Claims</h3>
          <div className="expense-table-view" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Receipt</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allClaims.filter(matchesStatus).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}><EmployeeLink id={c.employee_id}>{c.employee_name || '—'}</EmployeeLink></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.category_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{Number(c.amount).toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.expense_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{receiptCell(c)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.status === 'approved' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleReimburse(c.id)}>
                          <Wallet size={14} /> Mark Reimbursed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="expense-cards">
            {allClaims.filter(matchesStatus).map((c) => renderCard(c, { showEmployee: true, actions: c.status === 'approved' ? (
              <button className="btn btn-secondary btn-sm" onClick={() => handleReimburse(c.id)}><Wallet size={14} /> Mark Reimbursed</button>
            ) : null }))}
          </div>
          {allClaims.filter(matchesStatus).length === 0 && (
            <div className="empty-state">
              <Receipt size={48} />
              <p>{filters.status ? 'No claims match this filter' : 'No expense claims yet'}</p>
            </div>
          )}
        </div>
      )}

      {/* Submit Modal */}
      {showSubmit && (
        <Modal sheet title="Submit Expense" onClose={() => setShowSubmit(false)}>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Category</label>
              <select
                className="input-field"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="input-field"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Expense Date</label>
              <input
                type="date"
                className="input-field"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Description</label>
              <input
                className="input-field"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="expense-receipt">Receipt (optional)</label>
              <input
                id="expense-receipt"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="input-field"
                onChange={handleReceiptChange}
              />
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                {form.receipt ? `Selected: ${form.receipt.name}` : 'PDF, JPG or PNG, up to 2 MB'}
              </small>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSubmit(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showCategories && (
        <ExpenseCategoriesModal
          onClose={() => setShowCategories(false)}
          onChanged={() => getExpenseCategories().then((res) => setCategories(res.data)).catch(() => {})}
        />
      )}
    </div>
  );
}
