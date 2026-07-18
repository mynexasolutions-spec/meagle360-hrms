import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getLeaveTypes, getLeaveBalance, getMyRequests,
  getPendingRequests, requestLeave, approveReject,
} from '../api/leave';
import { CalendarDays, Plus, Check, X, Clock } from 'lucide-react';
import Modal from '../components/Modal';

export default function LeaveManagement() {
  const { user } = useAuth();
  const canApprove = !!user?.permissions?.['leave:approve'];
  const [tab, setTab] = useState('my-leave');
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [pending, setPending] = useState([]);
  const [showRequest, setShowRequest] = useState(false);
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [typesRes, balRes, myRes, pendRes] = await Promise.all([
        getLeaveTypes(),
        getLeaveBalance().catch(() => ({ data: [] })),
        getMyRequests().catch(() => ({ data: [] })),
        getPendingRequests().catch(() => ({ data: [] })),
      ]);
      setTypes(typesRes.data);
      setBalances(balRes.data);
      setMyRequests(myRes.data);
      setPending(pendRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    try {
      await requestLeave(form);
      setShowRequest(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

  const handleApproval = async (id, status) => {
    try {
      await approveReject(id, status);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Leave Management</h1>
          <p>Track balances, request leave, and manage approvals</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowRequest(true)}>
          <Plus size={16} /> Request Leave
        </button>
      </div>

      {/* Balance Cards */}
      <div className="stats-grid stagger-children" style={{ marginBottom: 24 }}>
        {balances.map((b) => (
          <div key={b.id} className="glass-card" style={{ padding: 20 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              {b.leave_type_name || 'Leave'}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
              {Number(b.balance).toFixed(1)}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
              days remaining ({b.year})
            </div>
          </div>
        ))}
        {balances.length === 0 && (
          <div className="glass-card" style={{ padding: 20, gridColumn: '1 / -1' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No leave balances configured yet
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'my-leave' ? 'active' : ''}`} onClick={() => setTab('my-leave')}>
          My Requests
        </button>
        {canApprove && (
          <button className={`tab ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}>
            Approval Queue ({pending.length})
          </button>
        )}
      </div>

      {/* My Requests */}
      {tab === 'my-leave' && (
        <div className="section-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.leave_type_name || '—'}</td>
                  <td>{r.start_date}</td>
                  <td>{r.end_date}</td>
                  <td>{(new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {myRequests.length === 0 && (
            <div className="empty-state">
              <CalendarDays size={48} />
              <p>No leave requests yet</p>
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
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.leave_type_name || '—'}</td>
                  <td>{r.start_date}</td>
                  <td>{r.end_date}</td>
                  <td><span className="badge badge-pending">{r.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-success btn-sm" onClick={() => handleApproval(r.id, 'approved')}>
                        <Check size={14} /> Approve
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleApproval(r.id, 'rejected')}>
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

      {/* Request Modal */}
      {showRequest && (
        <Modal title="Request Leave" onClose={() => setShowRequest(false)}>
          <form onSubmit={handleRequest}>
            <div className="input-group">
              <label className="input-label">Leave Type</label>
              <select
                className="input-field"
                value={form.leave_type_id}
                onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
                required
              >
                <option value="">Select type...</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Start Date</label>
              <input
                type="date"
                className="input-field"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">End Date</label>
              <input
                type="date"
                className="input-field"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowRequest(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Submit</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
