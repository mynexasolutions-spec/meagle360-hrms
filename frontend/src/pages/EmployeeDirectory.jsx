import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDirectory, inviteEmployee, getDepartments, getRoles, getSites } from '../api/employees';
import { Users, Search, Plus, Copy } from 'lucide-react';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

const ACCOUNT_STATUS_LABEL = {
  active: 'Active',
  invited: 'Invited',
  no_login: 'No Login',
};

const ACCOUNT_STATUS_COLOR = {
  active: 'badge-active',
  invited: 'badge-probation',
  no_login: 'badge-inactive',
};

const AVATAR_COLORS = [
  'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
];

const EMPTY_FORM = {
  email: '',
  full_name: '',
  employee_code: '',
  role_id: '',
  department_id: '',
  manager_id: '',
  site_id: '',
  date_of_hire: '',
};

export default function EmployeeDirectory() {
  const { user } = useAuth();
  const canInvite = !!user?.permissions?.['employees:write'];
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmployees();
    getDepartments().then((res) => setDepartments(res.data)).catch(() => {});
    getSites().then((res) => setSites(res.data)).catch(() => {});
    if (canInvite) {
      getRoles().then((res) => setRoles(res.data)).catch(() => {});
    }
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await getDirectory();
      setEmployees(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_code.toLowerCase().includes(search.toLowerCase()) ||
      (e.department_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const openInvite = () => {
    setForm(EMPTY_FORM);
    setInviteResult(null);
    setError('');
    setShowInvite(true);
  };

  const closeInvite = () => {
    setShowInvite(false);
    if (inviteResult) loadEmployees();
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
    setInviting(true);
    try {
      const payload = {
        ...form,
        department_id: form.department_id || null,
        manager_id: form.manager_id || null,
        site_id: form.site_id || null,
      };
      const res = await inviteEmployee(payload);
      setInviteResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to invite employee');
    } finally {
      setInviting(false);
    }
  };

  const setupLink = inviteResult
    ? `${window.location.origin}/set-password?token=${inviteResult.invite_token}`
    : '';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Employee Directory</h1>
          <p>{employees.length} employees in your organization</p>
        </div>
        {canInvite && (
          <button className="btn btn-primary" onClick={openInvite}>
            <Plus size={16} /> Invite Employee
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20, position: 'relative', maxWidth: 400 }}>
        <Search
          size={16}
          style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-muted)',
          }}
        />
        <input
          className="input-field"
          style={{ paddingLeft: 36 }}
          placeholder="Search by name, code, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="section-card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Code</th>
              <th>Department</th>
              <th>Site</th>
              <th>Role</th>
              <th>Hire Date</th>
              <th>Status</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp, i) => (
              <tr key={emp.id}>
                <td>
                  <Link
                    to={`/employees/${emp.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}
                  >
                    {emp.photo_url ? (
                      <img
                        src={emp.photo_url}
                        alt={emp.full_name}
                        className="avatar"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="avatar"
                        style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                      >
                        {emp.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontWeight: 500 }}>{emp.full_name}</span>
                  </Link>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{emp.employee_code}</td>
                <td>
                  {emp.department_name && (
                    <span className="badge badge-info">{emp.department_name}</span>
                  )}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{emp.site_name || '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {(emp.role_names || []).join(', ') || '—'}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{emp.date_of_hire}</td>
                <td>
                  <span className={`badge badge-${emp.employment_status}`}>
                    {emp.employment_status}
                  </span>
                </td>
                <td>
                  <span className={`badge ${ACCOUNT_STATUS_COLOR[emp.account_status] || 'badge-inactive'}`}>
                    {ACCOUNT_STATUS_LABEL[emp.account_status] || emp.account_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Users size={48} />
            <p>No employees found</p>
          </div>
        )}
      </div>

      {/* Invite Employee Modal */}
      {showInvite && (
        <Modal title="Invite Employee" onClose={closeInvite}>
          {!inviteResult ? (
            <form onSubmit={handleInvite}>
              {error && (
                <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input
                  className="input-field"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Employee Code</label>
                <input
                  className="input-field"
                  value={form.employee_code}
                  onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select
                  className="input-field"
                  value={form.role_id}
                  onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                  required
                >
                  <option value="" disabled>Select a role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Department</label>
                <select
                  className="input-field"
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Site</label>
                <select
                  className="input-field"
                  value={form.site_id}
                  onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                >
                  <option value="">No site</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Manager</label>
                <select
                  className="input-field"
                  value={form.manager_id}
                  onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                >
                  <option value="">No manager</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Date of Hire</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date_of_hire}
                  onChange={(e) => setForm({ ...form, date_of_hire: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={inviting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                {inviting ? 'Sending...' : 'Create & Generate Invite'}
              </button>
            </form>
          ) : (
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Account created for <strong>{inviteResult.email}</strong>. In production this
                link is emailed automatically — for now, share it manually. It expires in 48 hours.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                }}
              >
                <span style={{ flex: 1 }}>{setupLink}</span>
                <button
                  type="button"
                  className="btn-icon btn-ghost"
                  onClick={() => navigator.clipboard.writeText(setupLink)}
                  title="Copy link"
                >
                  <Copy size={14} />
                </button>
              </div>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={closeInvite}>
                Done
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
