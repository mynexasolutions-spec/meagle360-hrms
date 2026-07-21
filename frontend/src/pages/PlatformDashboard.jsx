import { useEffect, useMemo, useState } from 'react';
import {
  Plus, UserPlus, Ban, CheckCircle2, Copy, Check, Users, Pencil, Trash2,
  Building2, Clock3, Search, ShieldAlert, RefreshCw, Mail,
} from 'lucide-react';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import {
  listCompanies, createCompany, updateCompanyStatus, inviteCompanyAdmin,
  listCompanyUsers, updateCompany, deleteCompany, resendCompanyAdminInvite,
} from '../api/platform';

const STATUS_BADGE = {
  active: 'badge-active',
  pending_setup: 'badge-pending',
  suspended: 'badge-rejected',
  cancelled: 'badge-inactive',
};

const STATUS_DOT = {
  active: '#10b981',
  pending_setup: '#f59e0b',
  suspended: '#ef4444',
  cancelled: '#94a3b8',
};

const PLAN_STYLES = {
  standard: { color: '#2563eb', bg: '#eff6ff' },
  pro: { color: '#7c3aed', bg: '#f5f3ff' },
  enterprise: { color: '#d97706', bg: '#fffbeb' },
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #059669, #10b981)',
  'linear-gradient(135deg, #d97706, #f59e0b)',
  'linear-gradient(135deg, #db2777, #ec4899)',
  'linear-gradient(135deg, #0891b2, #06b6d4)',
];

function companyInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function avatarGradient(id) {
  return AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];
}

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
  const [linkCopied, setLinkCopied] = useState(false);

  const [usersFor, setUsersFor] = useState(null); // company object
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [resendResult, setResendResult] = useState(null); // { userAccountId, email, link }
  const [resendLinkCopied, setResendLinkCopied] = useState(false);

  const [editFor, setEditFor] = useState(null); // company object
  const [editForm, setEditForm] = useState({ name: '', country: '', plan_tier: 'standard', seat_limit: '' });
  const [editing, setEditing] = useState(false);

  const [deleteFor, setDeleteFor] = useState(null); // company object
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState('');

  const stats = useMemo(() => ({
    total: companies.length,
    active: companies.filter((c) => c.status === 'active').length,
    pending: companies.filter((c) => c.status === 'pending_setup').length,
    suspended: companies.filter((c) => c.status === 'suspended').length,
  }), [companies]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q)
    );
  }, [companies, search]);

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
    setError('');
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
    setError('');
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
    setLinkCopied(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(setupLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
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
    setResendResult(null);
    listCompanyUsers(company.id)
      .then((res) => setUsers(res.data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load users'))
      .finally(() => setUsersLoading(false));
  };

  const handleResendInvite = async (user) => {
    setError('');
    setResendingId(user.user_account_id);
    setResendResult(null);
    setResendLinkCopied(false);
    try {
      const res = await resendCompanyAdminInvite(usersFor.id, user.user_account_id);
      setResendResult({
        userAccountId: user.user_account_id,
        email: res.data.email,
        emailSent: res.data.email_sent,
        link: `${window.location.origin}/set-password?token=${res.data.invite_token}`,
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend invite');
    } finally {
      setResendingId(null);
    }
  };

  const handleCopyResendLink = () => {
    navigator.clipboard.writeText(resendResult.link);
    setResendLinkCopied(true);
    setTimeout(() => setResendLinkCopied(false), 1800);
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
    setError('');
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
    setError('');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Tenants</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
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
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-rose-light)',
            color: 'var(--accent-rose)',
            fontSize: '0.8125rem',
            marginBottom: 16,
          }}
        >
          <ShieldAlert size={15} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon={Building2} label="Total Companies" value={stats.total} bgColor="#eff6ff" color="#2563eb" />
        <StatCard icon={CheckCircle2} label="Active" value={stats.active} bgColor="#ecfdf5" color="#059669" />
        <StatCard icon={Clock3} label="Pending Setup" value={stats.pending} bgColor="#fffbeb" color="#d97706" />
        <StatCard icon={Ban} label="Suspended" value={stats.suspended} bgColor="#fef2f2" color="#dc2626" />
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '16px 20px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>
            {filteredCompanies.length} {filteredCompanies.length === 1 ? 'Company' : 'Companies'}
          </span>
          <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input-field"
              style={{ paddingLeft: 34, fontSize: '0.8125rem' }}
              placeholder="Search by name or country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading tenants...</div>
        ) : filteredCompanies.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {companies.length === 0 ? 'No companies yet. Create the first one.' : 'No companies match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Country</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((c, i) => {
                  const plan = PLAN_STYLES[c.plan_tier] || PLAN_STYLES.standard;
                  return (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0,
                              background: avatarGradient(i), display: 'flex', alignItems: 'center',
                              justifyContent: 'center', color: 'white', fontSize: '0.75rem', fontWeight: 700,
                            }}
                          >
                            {companyInitials(c.name)}
                          </div>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[c.status] || '#94a3b8', flexShrink: 0 }} />
                          <span className={`badge ${STATUS_BADGE[c.status] || 'badge-info'}`}>{c.status.replace('_', ' ')}</span>
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                            color: plan.color, background: plan.bg, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.plan_tier}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.country || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div className="platform-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openUsers(c)}>
                            <Users size={14} /> <span className="platform-action-label">Users</span>
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openInvite(c)}>
                            <UserPlus size={14} /> <span className="platform-action-label">Invite</span>
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleToggleStatus(c)}
                            disabled={c.status === 'pending_setup'}
                            title={c.status === 'pending_setup' ? 'Awaiting admin setup' : ''}
                          >
                            {c.status === 'suspended' ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                            <span className="platform-action-label">{c.status === 'suspended' ? 'Reactivate' : 'Suspend'}</span>
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>
                            <Pencil size={14} /> <span className="platform-action-label">Edit</span>
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--accent-rose)' }}
                            onClick={() => setDeleteFor(c)}
                          >
                            <Trash2 size={14} /> <span className="platform-action-label">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
              {inviteResult.email_sent ? (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)',
                    fontSize: '0.8125rem', fontWeight: 600, marginBottom: 12,
                  }}
                >
                  <Mail size={15} style={{ flexShrink: 0 }} />
                  Setup email sent to {inviteResult.email}
                </div>
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Admin account created for <strong>{inviteResult.email}</strong>, but the setup
                  email couldn't be sent automatically — share this link with them manually instead.
                </p>
              )}
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                This link expires in 48 hours{inviteResult.email_sent ? ' — you can also share it directly as a backup' : ''}.
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
                <span style={{ flex: 1, minWidth: 0 }}>{setupLink}</span>
                <button
                  type="button"
                  className="btn-icon btn-ghost"
                  style={{
                    flexShrink: 0,
                    color: linkCopied ? 'var(--accent-emerald)' : undefined,
                    background: linkCopied ? 'var(--accent-emerald-light)' : undefined,
                  }}
                  onClick={handleCopyLink}
                  title={linkCopied ? 'Copied!' : 'Copy link'}
                >
                  {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              {linkCopied && (
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontWeight: 600, marginTop: 6 }}>
                  Copied to clipboard
                </div>
              )}
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
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Name</th>
                    <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Email</th>
                    <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Role(s)</th>
                    <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isPending = !u.invite_accepted_at;
                    return (
                      <tr key={u.user_account_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px', fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{u.full_name}</td>
                        <td style={{ padding: '8px', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{u.email}</td>
                        <td style={{ padding: '8px', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          {u.role_names.length > 0 ? u.role_names.join(', ') : '—'}
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          <span className={`badge ${isPending ? 'badge-pending' : 'badge-active'}`}>
                            {isPending ? 'Invited' : 'Active'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                          {isPending && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleResendInvite(u)}
                              disabled={resendingId === u.user_account_id}
                            >
                              <RefreshCw size={13} /> {resendingId === u.user_account_id ? 'Sending...' : 'Resend Invite'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {resendResult && (
            <div style={{ marginTop: 16 }}>
              {resendResult.emailSent ? (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)',
                    fontSize: '0.8125rem', fontWeight: 600, marginBottom: 8,
                  }}
                >
                  <Mail size={15} style={{ flexShrink: 0 }} />
                  New setup email sent to {resendResult.email}
                </div>
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  New invite link generated for <strong>{resendResult.email}</strong>, but the email
                  couldn't be sent automatically — share this link manually instead.
                </p>
              )}
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
                <span style={{ flex: 1, minWidth: 0 }}>{resendResult.link}</span>
                <button
                  type="button"
                  className="btn-icon btn-ghost"
                  style={{
                    flexShrink: 0,
                    color: resendLinkCopied ? 'var(--accent-emerald)' : undefined,
                    background: resendLinkCopied ? 'var(--accent-emerald-light)' : undefined,
                  }}
                  onClick={handleCopyResendLink}
                  title={resendLinkCopied ? 'Copied!' : 'Copy link'}
                >
                  {resendLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
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
