import { useState, useEffect } from 'react';
import { GitBranch, Plus, Clock, Users } from 'lucide-react';
import client from '../api/client';
import Modal from '../components/Modal';

export default function ShiftManagement() {
  const [shifts, setShifts] = useState([]);
  const [roster, setRoster] = useState([]);
  const [tab, setTab] = useState('shifts');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ shift_type: '', start_time: '', end_time: '' });

  useEffect(() => {
    loadData();
  }, []);

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

  const formatTime = (t) => {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    return `${hr % 12 || 12}:${m} ${ampm}`;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Shift Management</h1>
          <p>Manage shift templates and employee assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> New Shift
        </button>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'shifts' ? 'active' : ''}`} onClick={() => setTab('shifts')}>
          Shift Templates
        </button>
        <button className={`tab ${tab === 'roster' ? 'active' : ''}`} onClick={() => setTab('roster')}>
          Roster
        </button>
      </div>

      {tab === 'shifts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {shifts.map((s) => (
            <div key={s.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--accent-violet-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Clock size={18} style={{ color: 'var(--accent-violet)' }} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{s.shift_type}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>Start</div>
                  <div style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>{formatTime(s.start_time)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>End</div>
                  <div style={{ color: 'var(--accent-rose)', fontWeight: 600 }}>{formatTime(s.end_time)}</div>
                </div>
              </div>
            </div>
          ))}
          {shifts.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <GitBranch size={48} />
              <p>No shifts configured</p>
            </div>
          )}
        </div>
      )}

      {tab === 'roster' && (
        <div className="section-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Shift</th>
                <th>Effective From</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.employee_name || '—'}</td>
                  <td><span className="badge badge-info">{r.shift_type || '—'}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.effective_from}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {roster.length === 0 && (
            <div className="empty-state">
              <Users size={48} />
              <p>No shift assignments yet</p>
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
    </div>
  );
}
