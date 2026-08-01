import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getLeaveTypes, getLeaveBalance, getMyRequests,
  getPendingRequests, requestLeave, approveReject, adjustBalance,
  createLeaveType, updateLeaveType, accrueMonthly, getLeaveHistory,
} from '../api/leave';
import { getEmployees } from '../api/employees';
import { CalendarDays, Plus, Check, X, Clock, Pencil, Layers, RefreshCw, SlidersHorizontal } from 'lucide-react';
import Modal from '../components/Modal';

export default function LeaveManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role_name === 'Admin';
  const canApprove = !!user?.permissions?.['leave:approve'];
  const canManageBalances = !!user?.permissions?.['settings:write'];
  const [tab, setTab] = useState(isAdmin ? 'approvals' : 'my-leave');
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [pending, setPending] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showRequest, setShowRequest] = useState(false);
  const [editBalance, setEditBalance] = useState(null);
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(null);
  const [showAdjustBalance, setShowAdjustBalance] = useState(false);
  const [accruing, setAccruing] = useState(false);
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '' });
  const [applyBtnHover, setApplyBtnHover] = useState(false);

  const now = new Date();
  const [history, setHistory] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    employee_id: '',
    status: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (tab === 'history' && (canApprove || isAdmin)) loadHistory();
  }, [tab, historyFilters]);

  const loadData = async () => {
    try {
      const [pendRes, typesRes] = await Promise.all([
        getPendingRequests().catch(() => ({ data: [] })),
        getLeaveTypes().catch(() => ({ data: [] })),
      ]);
      setPending(pendRes.data);
      setTypes(typesRes.data);
      if (!isAdmin) {
        const [balRes, myRes] = await Promise.all([
          getLeaveBalance().catch(() => ({ data: [] })),
          getMyRequests().catch(() => ({ data: [] })),
        ]);
        setBalances(balRes.data);
        setMyRequests(myRes.data);
      }
      if (canManageBalances || canApprove) {
        const eRes = await getEmployees(0, 500).catch(() => ({ data: [] }));
        setEmployees(eRes.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadHistory = async () => {
    try {
      const params = {
        year: historyFilters.year,
        month: historyFilters.month,
        employee_id: historyFilters.employee_id || undefined,
        status: historyFilters.status || undefined,
      };
      const res = await getLeaveHistory(params);
      setHistory(res.data);
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

  const toggleLeaveTypePaid = async (lt) => {
    try {
      await updateLeaveType(lt.id, { is_paid: !lt.is_paid });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update leave type');
    }
  };

  const handleAccrueMonthly = async () => {
    setAccruing(true);
    try {
      const res = await accrueMonthly();
      const r = res.data;
      if (r.already_run) {
        alert(`Already run for ${r.period} — no leave types were pending accrual.`);
      } else {
        alert(`Accrued ${r.leave_types_accrued.join(', ')} for ${r.employees_processed} employees (${r.period}).`);
      }
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to run monthly accrual');
    } finally {
      setAccruing(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <CalendarDays size={22} style={{ color: '#2563eb' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Leave Management</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              {isAdmin ? 'Review and manage employee leave approvals' : 'Track leave balances, apply for time off & monitor requests'}
            </p>
          </div>
        </div>
      </div>

      {/* Modern Dashboard Layout: Card on Left, Requests & Actions on Right */}
      <div className={isAdmin ? '' : 'leave-layout'} style={{ marginBottom: 24 }}>
        {/* Left Widget: Screenshot-styled Leave Card */}
        {!isAdmin && (
          <div
            className="leave-balance-card"
            style={{
              background: '#ffffff',
              borderRadius: 24,
              padding: '24px',
              border: '1px solid #e2e8f0',
              borderTop: '3px solid #2563eb',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {/* Header */}
            <div className="leave-balance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Leave Balances
              </h2>
              <button
                onClick={() => setShowRequest(true)}
                onMouseEnter={() => setApplyBtnHover(true)}
                onMouseLeave={() => setApplyBtnHover(false)}
                style={{
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 16px',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  cursor: 'pointer',
                  boxShadow: applyBtnHover ? '0 8px 20px rgba(37, 99, 235, 0.35)' : '0 4px 12px rgba(37, 99, 235, 0.25)',
                  transform: applyBtnHover ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'all 0.15s ease',
                }}
              >
                + Apply Leave
              </button>
            </div>

            {/* Leave Rows */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {balances.map((b, idx) => {
                const total = b.total_entitlement || 11;
                const used = Math.min(total, Math.max(0, total - Number(b.balance)));
                const usedInt = Math.round(used);
                const totalInt = Math.round(total);

                const colors = [
                  '#2563eb', // Blue
                  '#10b981', // Green
                  '#f97316', // Orange
                  '#8b5cf6', // Purple
                ];
                const activeColor = colors[idx % colors.length];

                return (
                  <div
                    key={b.id}
                    style={{
                      paddingTop: idx === 0 ? 0 : 16,
                      paddingBottom: 16,
                      borderBottom: idx === balances.length - 1 ? 'none' : '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0f172a' }}>
                        {b.leave_type_name || 'Leave'}
                      </span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b' }}>
                        {usedInt} / {totalInt} Used
                      </span>
                    </div>

                    {/* Segmented Block Progress Bar */}
                    <div className="leave-progress-segments" style={{ display: 'flex', gap: 5, width: '100%' }}>
                      {Array.from({ length: totalInt }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: 10,
                            borderRadius: 4,
                            backgroundColor: i < usedInt ? activeColor : '#f1f5f9',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {balances.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0' }}>
                  No leave balances configured yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Main Content Area: Tabs + Data Tables */}
        <div>
          {/* Modern Pill Tabs */}
          <div className="leave-tabs" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {!isAdmin && (
              <button
                onClick={() => setTab('my-leave')}
                style={{
                  padding: '9px 18px',
                  borderRadius: 12,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: tab === 'my-leave' ? 'none' : '1px solid #cbd5e1',
                  background: tab === 'my-leave' ? '#0f172a' : '#ffffff',
                  color: tab === 'my-leave' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: tab === 'my-leave' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
                }}
              >
                My Requests
              </button>
            )}
            {(canApprove || isAdmin) && (
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
            {(canApprove || isAdmin) && (
              <button
                onClick={() => setTab('history')}
                style={{
                  padding: '9px 18px',
                  borderRadius: 12,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: tab === 'history' ? 'none' : '1px solid #cbd5e1',
                  background: tab === 'history' ? '#0f172a' : '#ffffff',
                  color: tab === 'history' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: tab === 'history' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
                }}
              >
                History
              </button>
            )}
            {canManageBalances && (
              <button
                onClick={() => setTab('leave-types')}
                style={{
                  padding: '9px 18px',
                  borderRadius: 12,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  border: tab === 'leave-types' ? 'none' : '1px solid #cbd5e1',
                  background: tab === 'leave-types' ? '#0f172a' : '#ffffff',
                  color: tab === 'leave-types' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: tab === 'leave-types' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
                }}
              >
                Leave Types
              </button>
            )}
          </div>

      {/* My Requests */}
      {!isAdmin && tab === 'my-leave' && (
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ whiteSpace: 'nowrap' }}>From</th>
                <th style={{ whiteSpace: 'nowrap' }}>To</th>
                <th style={{ whiteSpace: 'nowrap' }}>Days</th>
                <th style={{ whiteSpace: 'nowrap' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.leave_type_name || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.start_date}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.end_date}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{(new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
        <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
          <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                <th style={{ whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ whiteSpace: 'nowrap' }}>From</th>
                <th style={{ whiteSpace: 'nowrap' }}>To</th>
                <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.employee_name || '—'}</td>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.leave_type_name || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.start_date}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.end_date}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><span className="badge badge-pending">{r.status}</span></td>
                  <td>
                    <div className="leave-row-actions" style={{ display: 'flex', gap: 6 }}>
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
          </div>
          {pending.length === 0 && (
            <div className="empty-state">
              <Clock size={48} />
              <p>No pending approvals</p>
            </div>
          )}
        </div>
      )}

      {/* History (Admin/Manager) */}
      {tab === 'history' && (canApprove || isAdmin) && (
        <div className="section-card" style={{ borderTop: '3px solid #64748b' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <select
              className="input-field"
              style={{ flex: '1 1 160px', minWidth: 0 }}
              value={historyFilters.employee_id}
              onChange={(e) => setHistoryFilters({ ...historyFilters, employee_id: e.target.value })}
            >
              <option value="">All Employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
            <select
              className="input-field"
              style={{ flex: '1 1 130px', minWidth: 0 }}
              value={historyFilters.month}
              onChange={(e) => setHistoryFilters({ ...historyFilters, month: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              style={{ flex: '1 1 100px', minWidth: 0 }}
              value={historyFilters.year}
              onChange={(e) => setHistoryFilters({ ...historyFilters, year: Number(e.target.value) })}
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const y = now.getFullYear() - 2 + i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <select
              className="input-field"
              style={{ flex: '1 1 130px', minWidth: 0 }}
              value={historyFilters.status}
              onChange={(e) => setHistoryFilters({ ...historyFilters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            {(() => {
              const totalDays = history
                .filter((r) => r.status === 'approved')
                .reduce((sum, r) => sum + ((new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1), 0);
              return (
                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{totalDays}</strong> approved leave day{totalDays === 1 ? '' : 's'} matching these filters
                </div>
              );
            })()}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Type</th>
                  <th style={{ whiteSpace: 'nowrap' }}>From</th>
                  <th style={{ whiteSpace: 'nowrap' }}>To</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Days</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Requested On</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.employee_name || '—'}</td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.leave_type_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.start_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.end_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{(new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {history.length === 0 && (
            <div className="empty-state">
              <CalendarDays size={48} />
              <p>No leave requests match these filters</p>
            </div>
          )}
        </div>
      )}

          {/* Leave Types (Admin) */}
          {tab === 'leave-types' && canManageBalances && (
            <div className="section-card" style={{ borderTop: '3px solid #7c3aed' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ marginBottom: 0 }}><Layers size={18} style={{ color: 'var(--accent-violet)' }} /> Leave Types</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAdjustBalance(true)}>
                    <SlidersHorizontal size={14} /> Adjust Employee Balance
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleAccrueMonthly} disabled={accruing}>
                    <RefreshCw size={14} /> {accruing ? 'Running...' : 'Run Monthly Accrual'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowLeaveTypeModal({ mode: 'add' })}>+ Add</button>
                </div>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Accrual Rate is how many days each employee earns per month for that leave type — raise it here to
                increase everyone's future entitlement, then "Run Monthly Accrual" to credit it to balances. Safe to
                click more than once; a type already accrued for the current month is skipped.
              </p>
              <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Name</th><th style={{ whiteSpace: 'nowrap' }}>Accrual Rate</th><th style={{ whiteSpace: 'nowrap' }}>Payroll Effect</th><th style={{ whiteSpace: 'nowrap' }}>Last Accrued</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
                <tbody>
                  {types.map((lt) => (
                    <tr key={lt.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{lt.name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{Number(lt.accrual_rate).toFixed(2)} days/month</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`badge ${lt.is_paid ? 'badge-active' : 'badge-rejected'}`}>
                          {lt.is_paid ? 'Paid' : 'Unpaid (Loss of Pay)'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{lt.last_accrued_period || '—'}</td>
                      <td>
                        <div className="leave-row-actions" style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setShowLeaveTypeModal({ mode: 'edit', leaveType: lt })}>
                            Edit
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleLeaveTypePaid(lt)}>
                            Mark as {lt.is_paid ? 'Unpaid' : 'Paid'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {types.length === 0 && <div className="empty-state"><p>No leave types configured</p></div>}
            </div>
          )}
        </div>
      </div>

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

      {/* Edit Balance Modal (Admin only) */}
      {editBalance && (
        <EditBalanceModal
          balance={editBalance}
          onClose={() => setEditBalance(null)}
          onSuccess={loadData}
        />
      )}

      {/* Add/Edit Leave Type Modal (Admin only) */}
      {showLeaveTypeModal && (
        <LeaveTypeModal
          leaveType={showLeaveTypeModal.mode === 'edit' ? showLeaveTypeModal.leaveType : null}
          onClose={() => setShowLeaveTypeModal(null)}
          onSuccess={loadData}
        />
      )}

      {/* Adjust Employee Balance Modal (Admin only) */}
      {showAdjustBalance && (
        <AdjustBalanceModal
          employees={employees}
          leaveTypes={types}
          onClose={() => setShowAdjustBalance(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

function LeaveTypeModal({ leaveType, onClose, onSuccess }) {
  const isEdit = !!leaveType;
  const [form, setForm] = useState({ name: leaveType?.name || '', accrual_rate: leaveType?.accrual_rate ?? '0' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await updateLeaveType(leaveType.id, form);
      } else {
        await createLeaveType(form);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save leave type');
    }
  };

  return (
    <Modal title={isEdit ? 'Edit Leave Type' : 'Add Leave Type'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Accrual Rate (days/month)</label>
          <input type="number" step="0.01" className="input-field" value={form.accrual_rate} onChange={(e) => setForm({ ...form, accrual_rate: e.target.value })} required />
        </div>
        {isEdit && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Changing this only sets the future monthly rate — run "Run Monthly Accrual" afterward to credit the new rate to balances.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{isEdit ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustBalanceModal({ employees, leaveTypes, onClose, onSuccess }) {
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', delta: '', reason: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await adjustBalance({ ...form, delta: Number(form.delta) });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to adjust balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Adjust Employee Leave Balance" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Employee</label>
          <select
            className="input-field"
            value={form.employee_id}
            onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            required
          >
            <option value="">Select employee...</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Leave Type</label>
          <select
            className="input-field"
            value={form.leave_type_id}
            onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
            required
          >
            <option value="">Select type...</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Days to Add (negative to deduct)</label>
          <input
            type="number"
            step="0.01"
            className="input-field"
            value={form.delta}
            onChange={(e) => setForm({ ...form, delta: e.target.value })}
            required
          />
        </div>
        <div className="input-group">
          <label className="input-label">Reason</label>
          <input
            className="input-field"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="e.g. Carry-forward from last year, one-off grant..."
            required
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Apply'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditBalanceModal({ balance, onClose, onSuccess }) {
  const [value, setValue] = useState(Number(balance.balance));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const delta = Number(value) - Number(balance.balance);
      await adjustBalance({
        employee_id: balance.employee_id,
        leave_type_id: balance.leave_type_id,
        year: balance.year,
        delta,
        reason: reason || 'Manual balance correction',
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit ${balance.leave_type_name || 'Leave'} Balance`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">New Balance (days)</label>
          <input
            type="number"
            step="0.01"
            className="input-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </div>
        <div className="input-group">
          <label className="input-label">Reason</label>
          <input
            className="input-field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Carry-forward, correction..."
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
