import { useEffect, useState } from 'react';
import { Plus, UserPlus, Ban, CheckCircle2, Copy, Users, Pencil, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import {
  listCompanies, createCompany, updateCompanyStatus, inviteCompanyAdmin,
  listCompanyUsers, updateCompany, deleteCompany,
} from '../api/platform';

const STATUS_BADGE = {
  active: 'badge-active',
  pending_setup: 'badge-pending',
  suspended: 'badge-rejected',
  cancelled: 'badge-inactive',
};

export default function PlatformDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', country: '', plan_tier: 'standard', seat_limit: '' });
  const [creating, setCreating] = useState(false);

  const [inviteFor, setInviteFor] = useState(null); // company object
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', employee_code: 'EMP001' });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  const [usersFor, setUsersFor] = useState(null); // company object
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [editFor, setEditFor] = useState(null); // company object
  const [editForm, setEditForm] = useState({ name: '', country: '', plan_tier: 'standard', seat_limit: '' });
  const [editing, setEditing] = useState(false);

  const [deleteFor, setDeleteFor] = useState(null); // company object
  const [deleting, setDeleting] = useState(false);

  const loadCompanies = () => {
    setLoading(true);
    listCompanies()
      .then((res) => setCompanies(res.data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load companies'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCompanies, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createCompany({
        name: createForm.name,
        country: createForm.country || null,
        plan_tier: createForm.plan_tier,
        seat_limit: createForm.seat_limit ? Number(createForm.seat_limit) : null,
      });
      setShowCreate(false);
      setCreateForm({ name: '', country: '', plan_tier: 'standard', seat_limit: '' });
      loadCompanies();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (company) => {
    const nextStatus = company.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateCompanyStatus(company.id, nextStatus);
      loadCompanies();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const openInvite = (company) => {
    setInviteFor(company);
    setInviteForm({ email: '', full_name: '', employee_code: 'EMP001' });
    setInviteResult(null);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await inviteCompanyAdmin(inviteFor.id, inviteForm);
      setInviteResult(res.data);
      loadCompanies();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to invite admin');
    } finally {
      setInviting(false);
    }
  };

  const setupLink = inviteResult
    ? `${window.location.origin}/set-password?token=${inviteResult.invite_token}`
    : '';

  const openUsers = (company) => {
    setUsersFor(company);
    setUsers([]);
    setUsersLoading(true);
    listCompanyUsers(company.id)
      .then((res) => setUsers(res.data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load users'))
      .finally(() => setUsersLoading(false));
  };

  const openEdit = (company) => {
    setEditFor(company);
    setEditForm({
      name: company.name,
      country: company.country || '',
      plan_tier: company.plan_tier,
      seat_limit: company.seat_limit ?? '',
    });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setEditing(true);
    try {
      await updateCompany(editFor.id, {
        name: editForm.name,
        country: editForm.country || null,
        plan_tier: editForm.plan_tier,
        seat_limit: editForm.seat_limit ? Number(editForm.seat_limit) : null,
      });
      setEditFor(null);
      loadCompanies();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update company');
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCompany(deleteFor.id);
      setDeleteFor(null);
      loadCompanies();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete company');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700 }}>Tenants</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Companies provisioned on the Meagle360 HRMS platform
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Company
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-rose-light)',
            color: 'var(--accent-rose)',
            fontSize: '0.8125rem',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>
        ) : companies.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text-muted)' }}>No companies yet. Create the first one.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Name</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Plan</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Country</th>
                <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.875rem' }}>{c.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${STATUS_BADGE[c.status] || 'badge-info'}`}>{c.status}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8125rem' }}>{c.plan_tier}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.8125rem' }}>{c.country || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openUsers(c)}>
                        <Users size={14} /> Users
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openInvite(c)}>
                        <UserPlus size={14} /> Invite Admin
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px' }}
                        onClick={() => handleToggleStatus(c)}
                        disabled={c.status === 'pending_setup'}
                        title={c.status === 'pending_setup' ? 'Awaiting admin setup' : ''}
                      >
                        {c.status === 'suspended' ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                        {c.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => openEdit(c)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', color: 'var(--accent-rose)' }}
                        onClick={() => setDeleteFor(c)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <Modal title="New Company" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <div className="input-group">
              <label className="input-label">Company Name</label>
              <input
                className="input-field"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Country</label>
              <input
                className="input-field"
                value={createForm.country}
                onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Plan Tier</label>
              <select
                className="input-field"
                value={createForm.plan_tier}
                onChange={(e) => setCreateForm({ ...createForm, plan_tier: e.target.value })}
              >
                <option value="standard">Standard</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Seat Limit (optional)</label>
              <input
                type="number"
                className="input-field"
                value={createForm.seat_limit}
                onChange={(e) => setCreateForm({ ...createForm, seat_limit: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              {creating ? 'Creating...' : 'Create Company'}
            </button>
          </form>
        </Modal>
      )}

      {inviteFor && (
        <Modal title={`Invite Admin — ${inviteFor.name}`} onClose={() => setInviteFor(null)}>
          {!inviteResult ? (
            <form onSubmit={handleInvite}>
              <div className="input-group">
                <label className="input-label">Admin Email</label>
                <input
                  type="email"
                  className="input-field"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input
                  className="input-field"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Employee Code</label>
                <input
                  className="input-field"
                  value={inviteForm.employee_code}
                  onChange={(e) => setInviteForm({ ...inviteForm, employee_code: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={inviting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                {inviting ? 'Sending...' : 'Create Admin & Generate Invite'}
              </button>
            </form>
          ) : (
            <div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Admin account created for <strong>{inviteResult.email}</strong>. In production this
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
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={() => setInviteFor(null)}>
                Done
              </button>
            </div>
          )}
        </Modal>
      )}

      {usersFor && (
        <Modal title={`Users — ${usersFor.name}`} onClose={() => setUsersFor(null)}>
          {usersLoading ? (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading...</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No users yet — invite the first admin to get started.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Name</th>
                  <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Email</th>
                  <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Role(s)</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_account_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px', fontSize: '0.8125rem', fontWeight: 500 }}>{u.full_name}</td>
                    <td style={{ padding: '8px', fontSize: '0.8125rem' }}>{u.email}</td>
                    <td style={{ padding: '8px', fontSize: '0.8125rem' }}>
                      {u.role_names.length > 0 ? u.role_names.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {editFor && (
        <Modal title={`Edit — ${editFor.name}`} onClose={() => setEditFor(null)}>
          <form onSubmit={handleEdit}>
            <div className="input-group">
              <label className="input-label">Company Name</label>
              <input
                className="input-field"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Country</label>
              <input
                className="input-field"
                value={editForm.country}
                onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Plan Tier</label>
              <select
                className="input-field"
                value={editForm.plan_tier}
                onChange={(e) => setEditForm({ ...editForm, plan_tier: e.target.value })}
              >
                <option value="standard">Standard</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Seat Limit (optional)</label>
              <input
                type="number"
                className="input-field"
                value={editForm.seat_limit}
                onChange={(e) => setEditForm({ ...editForm, seat_limit: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={editing} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              {editing ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </Modal>
      )}

      {deleteFor && (
        <Modal title="Delete Company" onClose={() => setDeleteFor(null)}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            This will permanently delete <strong>{deleteFor.name}</strong> and everything under
            it — employees, users, attendance, leave, documents, everything. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteFor(null)} disabled={deleting}>
              Cancel
            </button>
            <button
              className="btn"
              style={{ background: 'var(--accent-rose)', color: 'white' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, permanently delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
