import { useState, useEffect } from 'react';
import { GitBranch, Plus, Clock, Users, Pencil, Trash2 } from 'lucide-react';
import client from '../api/client';
import Modal from '../components/Modal';

import { useAuth } from '../context/AuthContext';

export default function ShiftManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];
  const isManager = !!user?.permissions?.['attendance:approve'] || !!user?.permissions?.['employees:read'];
  const canManageShifts = isAdmin || isManager;
  const [shifts, setShifts] = useState([]);
  const [roster, setRoster] = useState([]);
  const [tab, setTab] = useState('shifts');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ shift_type: '', start_time: '', end_time: '' });
  const [editingShift, setEditingShift] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ employee_id: '', shift_id: '', effective_from: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    loadData();
    client.get('/employees/').then((r) => {
      let emps = r.data || [];
      // Filter direct reports if user is a manager, fallback to all employees if none linked as direct reports
      if (!isAdmin && user?.employee_id) {
        const direct = emps.filter((e) => e.manager_id === user.employee_id);
        emps = direct.length > 0 ? direct : emps;
      }
      setEmployees(emps);
    }).catch(() => {});
  }, [isAdmin, user?.employee_id]);

  const loadData = async () => {
    try {
      const [sRes, rRes] = await Promise.all([
        client.get('/shifts/'),
        client.get('/shifts/roster'),
      ]);
      setShifts(sRes.data);
      setRoster(rRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await client.post('/shifts/', form);
      setShowAdd(false);
      setForm({ shift_type: '', start_time: '', end_time: '' });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await client.put(`/shifts/${editingShift.id}`, form);
      setEditingShift(null);
      setForm({ shift_type: '', start_time: '', end_time: '' });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update shift');
    }
  };

  const handleDeleteShift = async (shift) => {
    if (!confirm(`Delete the "${shift.shift_type}" shift template?`)) return;
    try {
      await client.delete(`/shifts/${shift.id}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete shift');
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post('/shifts/assign', assignForm);
      setShowAssign(false);
      setAssignForm({ employee_id: '', shift_id: '', effective_from: new Date().toISOString().slice(0, 10) });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to assign shift');
    }
  };

  const formatTime = (t) => {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    return `${hr % 12 || 12}:${m} ${ampm}`;
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.13)',
            }}
          >
            <GitBranch size={22} style={{ color: '#7c3aed' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Shift Management</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Configure shift templates and manage employee work rosters</p>
          </div>
        </div>
        {canManageShifts && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowAssign(true)}
            >
              <Users size={16} style={{ color: '#2563eb' }} /> Assign Shift
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setForm({ shift_type: '', start_time: '', end_time: '' });
                setShowAdd(true);
              }}
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              <Plus size={18} /> New Shift Template
            </button>
          </div>
        )}
      </div>

      {/* Modern Pill Tabs */}
      <div className="pill-tabs" style={{ marginBottom: 24 }}>
        <button
          onClick={() => setTab('shifts')}
          style={{
            padding: '9px 18px',
            borderRadius: 12,
            fontSize: '0.85rem',
            fontWeight: 700,
            border: tab === 'shifts' ? 'none' : '1px solid #cbd5e1',
            background: tab === 'shifts' ? '#0f172a' : '#ffffff',
            color: tab === 'shifts' ? '#ffffff' : '#64748b',
            cursor: 'pointer',
            boxShadow: tab === 'shifts' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
          }}
        >
          Shift Templates ({shifts.length})
        </button>
        <button
          onClick={() => setTab('roster')}
          style={{
            padding: '9px 18px',
            borderRadius: 12,
            fontSize: '0.85rem',
            fontWeight: 700,
            border: tab === 'roster' ? 'none' : '1px solid #cbd5e1',
            background: tab === 'roster' ? '#0f172a' : '#ffffff',
            color: tab === 'roster' ? '#ffffff' : '#64748b',
            cursor: 'pointer',
            boxShadow: tab === 'roster' ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
          }}
        >
          Employee Roster ({roster.length})
        </button>
      </div>

      {/* Shifts Grid */}
      {tab === 'shifts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {shifts.map((s) => (
            <div
              key={s.id}
              className="shift-card"
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: '#f5f3ff',
                        color: '#7c3aed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Clock size={22} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{s.shift_type}</div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Shift Template</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        className="btn-icon btn-ghost"
                        title="Edit shift"
                        onClick={() => {
                          setEditingShift(s);
                          setForm({ shift_type: s.shift_type, start_time: s.start_time, end_time: s.end_time });
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button className="btn-icon btn-ghost" title="Delete shift" onClick={() => handleDeleteShift(s)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                  }}
                >
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase' }}>Start Time</div>
                    <div style={{ color: '#059669', fontWeight: 800, fontSize: '1rem', marginTop: 2 }}>{formatTime(s.start_time)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#64748b', fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase' }}>End Time</div>
                    <div style={{ color: '#dc2626', fontWeight: 800, fontSize: '1rem', marginTop: 2 }}>{formatTime(s.end_time)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {shifts.length === 0 && (
            <div
              className="empty-state"
              style={{
                gridColumn: '1 / -1',
                background: '#ffffff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
              }}
            >
              <GitBranch size={48} />
              <p>No shift templates configured</p>
            </div>
          )}
        </div>
      )}

      {tab === 'roster' && (
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <h3><Users size={18} style={{ color: 'var(--accent-blue)' }} /> Employee Roster</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Employee</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Shift</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Effective From</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{r.employee_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: '#eff6ff', color: '#2563eb' }}>
                        {r.shift_type || '—'}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{r.effective_from ? new Date(r.effective_from).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {roster.length === 0 && (
            <div className="empty-state">
              <Users size={48} />
              <p>No roster assignments found</p>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title="New Shift" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleCreate}>
            <div className="input-group">
              <label className="input-label">Shift Type</label>
              <input
                className="input-field"
                placeholder="e.g., Morning, Evening, Night"
                value={form.shift_type}
                onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Start Time</label>
              <input
                type="time"
                className="input-field"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">End Time</label>
              <input
                type="time"
                className="input-field"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {editingShift && (
        <Modal title="Edit Shift" onClose={() => setEditingShift(null)}>
          <form onSubmit={handleUpdate}>
            <div className="input-group">
              <label className="input-label">Shift Type</label>
              <input
                className="input-field"
                placeholder="e.g., Morning, Evening, Night"
                value={form.shift_type}
                onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Start Time</label>
              <input
                type="time"
                className="input-field"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">End Time</label>
              <input
                type="time"
                className="input-field"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingShift(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {showAssign && (
        <Modal title="Assign Shift to Employee" onClose={() => setShowAssign(false)}>
          <form onSubmit={handleAssignSubmit}>
            <div className="input-group">
              <label className="input-label">Select Employee</label>
              <select
                className="input-field"
                value={assignForm.employee_id}
                onChange={(e) => setAssignForm({ ...assignForm, employee_id: e.target.value })}
                required
              >
                <option value="">Choose employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_code})</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Select Shift</label>
              <select
                className="input-field"
                value={assignForm.shift_id}
                onChange={(e) => setAssignForm({ ...assignForm, shift_id: e.target.value })}
                required
              >
                <option value="">Choose shift template...</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.shift_type} ({formatTime(s.start_time)} - {formatTime(s.end_time)})</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Effective From Date</label>
              <input
                type="date"
                className="input-field"
                value={assignForm.effective_from}
                onChange={(e) => setAssignForm({ ...assignForm, effective_from: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAssign(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Assign</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
