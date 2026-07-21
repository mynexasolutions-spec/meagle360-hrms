import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getExpenseCategories, submitExpenseClaim, getMyExpenseClaims,
  getPendingExpenseClaims, getAllExpenseClaims, approveRejectExpense, reimburseExpense,
} from '../api/expenses';
import { Receipt, Plus, Check, X, Clock, Wallet, CheckSquare } from 'lucide-react';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';

const EMPTY_FORM = { category_id: '', amount: '', expense_date: '', description: '', receipt_url: '' };

export default function ExpenseManagement() {
  const { user } = useAuth();
  const canSubmit = !!user?.permissions?.['expenses:write'];
  const canApprove = !!user?.permissions?.['expenses:approve'];
  const [tab, setTab] = useState('my-claims');
  const [categories, setCategories] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [pending, setPending] = useState([]);
  const [allClaims, setAllClaims] = useState([]);
  const [showSubmit, setShowSubmit] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitBtnHover, setSubmitBtnHover] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await submitExpenseClaim({
        ...form,
        category_id: form.category_id || null,
        amount: Number(form.amount),
      });
      setShowSubmit(false);
      setForm(EMPTY_FORM);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit expense claim');
    }
  };

  const handleApproval = async (id, status) => {
    try {
      await approveRejectExpense(id, status);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

  const handleReimburse = async (id) => {
    try {
      await reimburseExpense(id);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

  const totalPending = myClaims.filter((c) => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
  const totalReimbursed = myClaims.filter((c) => c.status === 'reimbursed').reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
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
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Submit claims, track approvals &amp; manage company reimbursements</p>
          </div>
        </div>
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

      {/* KPI Stats Cards */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <StatCard
          icon={Clock}
          label="Pending Claims (Mine)"
          value={`₹${totalPending.toFixed(2)}`}
          color="#d97706"
          bgColor="var(--accent-amber-light)"
        />
        <StatCard
          icon={Wallet}
          label="Reimbursed Total (Mine)"
          value={`₹${totalReimbursed.toFixed(2)}`}
          color="#059669"
          bgColor="var(--accent-emerald-light)"
        />
        {canApprove && (
          <StatCard
            icon={CheckSquare}
            label="Awaiting Approval Queue"
            value={`${pending.length} Claims`}
            color="#2563eb"
            bgColor="var(--accent-blue-light)"
          />
        )}
      </div>

      {/* Modern Pill Tabs */}
      <div className="pill-tabs" style={{ marginBottom: 20 }}>
        <button
          onClick={() => setTab('my-claims')}
          style={{
            padding: '9px 18px',
            borderRadius: 12,
            fontSize: '0.85rem',
            fontWeight: 700,
            border: tab === 'my-claims' ? 'none' : '1px solid #cbd5e1',
            background: tab === 'my-claims' ? '#0f172a' : '#ffffff',
            color: tab === 'my-claims' ? '#ffffff' : '#64748b',
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
              color: tab === 'approvals' ? '#ffffff' : '#64748b',
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
              color: tab === 'ledger' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              boxShadow: tab === 'ledger' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
            }}
          >
            All Claims
          </button>
        )}
      </div>

      {/* My Claims Table */}
      {tab === 'my-claims' && (
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <h3><Receipt size={18} style={{ color: 'var(--accent-blue)' }} /> My Expense Claims</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Description</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {myClaims.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.category_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{Number(c.amount).toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.expense_date}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.description || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {myClaims.length === 0 && (
            <div className="empty-state">
              <Receipt size={48} />
              <p>No expense claims yet</p>
            </div>
          )}
        </div>
      )}

      {/* Approval Queue */}
      {tab === 'approvals' && (
        <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
          <h3><Clock size={18} style={{ color: 'var(--accent-amber)' }} /> Pending Approvals</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.employee_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.category_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{Number(c.amount).toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.expense_date}</td>
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
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Category</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Amount</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allClaims.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.employee_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.category_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>₹{Number(c.amount).toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.expense_date}</td>
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
          {allClaims.length === 0 && (
            <div className="empty-state">
              <Receipt size={48} />
              <p>No expense claims yet</p>
            </div>
          )}
        </div>
      )}

      {/* Submit Modal */}
      {showSubmit && (
        <Modal title="Submit Expense" onClose={() => setShowSubmit(false)}>
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
              <label className="input-label">Receipt URL (optional)</label>
              <input
                className="input-field"
                value={form.receipt_url}
                onChange={(e) => setForm({ ...form, receipt_url: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSubmit(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Submit</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
