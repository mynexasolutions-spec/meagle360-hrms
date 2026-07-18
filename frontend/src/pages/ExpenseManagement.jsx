import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getExpenseCategories, submitExpenseClaim, getMyExpenseClaims,
  getPendingExpenseClaims, getAllExpenseClaims, approveRejectExpense, reimburseExpense,
} from '../api/expenses';
import { Receipt, Plus, Check, X, Clock, Wallet } from 'lucide-react';
import Modal from '../components/Modal';

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
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Expense Management</h1>
          <p>Submit claims, track approvals, and manage reimbursements</p>
        </div>
        {canSubmit && (
          <button className="btn btn-primary" onClick={() => setShowSubmit(true)}>
            <Plus size={16} /> Submit Expense
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Pending (mine)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
            {totalPending.toFixed(2)}
          </div>
        </div>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Reimbursed (mine)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
            {totalReimbursed.toFixed(2)}
          </div>
        </div>
        {canApprove && (
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Awaiting Approval</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
              {pending.length}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'my-claims' ? 'active' : ''}`} onClick={() => setTab('my-claims')}>
          My Claims
        </button>
        {canApprove && (
          <button className={`tab ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>
            Approval Queue ({pending.length})
          </button>
        )}
        {canApprove && (
          <button className={`tab ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>
            All Claims
          </button>
        )}
      </div>

      {/* My Claims */}
      {tab === 'my-claims' && (
        <div className="section-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {myClaims.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.category_name || '—'}</td>
                  <td>{Number(c.amount).toFixed(2)}</td>
                  <td>{c.expense_date}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.description || '—'}</td>
                  <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="section-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.employee_name || '—'}</td>
                  <td>{c.category_name || '—'}</td>
                  <td>{Number(c.amount).toFixed(2)}</td>
                  <td>{c.expense_date}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
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
        <div className="section-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allClaims.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.employee_name || '—'}</td>
                  <td>{c.category_name || '—'}</td>
                  <td>{Number(c.amount).toFixed(2)}</td>
                  <td>{c.expense_date}</td>
                  <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                  <td>
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
