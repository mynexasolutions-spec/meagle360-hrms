import { useEffect, useMemo, useState } from 'react';
import {
  Plus, UserPlus, Ban, CheckCircle2, Copy, Check, Users, Pencil, Trash2,
  Building2, Clock3, Search, ShieldAlert, RefreshCw, Mail, Globe,
} from 'lucide-react';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import {
  listCompanies, createCompany, updateCompanyStatus, inviteCompanyAdmin,
  listCompanyUsers, updateCompany, deleteCompany, resendCompanyAdminInvite,
} from '../api/platform';

const BASE_DOMAIN = import.meta.env.VITE_TENANT_DOMAIN || 'meagle360.com';
const getPortalUrl = (subdomain) => `https://${subdomain}.${BASE_DOMAIN}`;

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
  trial: { label: 'Trial', color: '#0891b2', bg: '#ecfeff' },
  quarterly: { label: 'Quarterly', color: '#2563eb', bg: '#eff6ff' },
  half_yearly: { label: 'Half-Yearly', color: '#7c3aed', bg: '#f5f3ff' },
  yearly: { label: 'Yearly', color: '#059669', bg: '#ecfdf5' },
};

function formatPlanTier(tier) {
  if (!tier) return '—';
  const style = PLAN_STYLES[tier];
  if (style) return style.label;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getDaysRemaining(company) {
  if (company.days_remaining != null) return Math.max(company.days_remaining, 0);
  if (!company.plan_ends_at) return null;
  try {
    const expiry = new Date(company.plan_ends_at);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    return Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
  } catch {
    return null;
  }
}

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
  const [createForm, setCreateForm] = useState({
    name: '',
    country: '',
    multi_entity: false,
    plan_tier: 'trial',
    trial_days: 15,
    seat_limit: '',
  });
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState(null);
  const [createdLinkCopied, setCreatedLinkCopied] = useState(false);

  const [copiedSubdomainId, setCopiedSubdomainId] = useState(null);

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
  const [editForm, setEditForm] = useState({ name: '', subdomain: '', country: '', plan_tier: 'standard', seat_limit: '' });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

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

  const copyPortalUrl = (company) => {
    navigator.clipboard.writeText(getPortalUrl(company.subdomain));
    setCopiedSubdomainId(company.id);
    setTimeout(() => setCopiedSubdomainId(null), 1800);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const payload = {
        name: createForm.name,
        country: createForm.country || null,
        multi_entity: createForm.multi_entity,
        plan_tier: createForm.plan_tier,
        seat_limit: createForm.seat_limit ? Number(createForm.seat_limit) : null,
      };
      if (createForm.plan_tier === 'trial') {
        payload.trial_days = createForm.trial_days ? Number(createForm.trial_days) : undefined;
      }
      const res = await createCompany(payload);
      setCreatedResult(res.data);
      setCreateForm({
        name: '',
        country: '',
        multi_entity: false,
        plan_tier: 'trial',
        trial_days: 15,
        seat_limit: '',
      });
      loadCompanies();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to create company');
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
    setEditError('');
    setEditForm({
      name: company.name,
      subdomain: company.subdomain || '',
      country: company.country || '',
      plan_tier: company.plan_tier || 'trial',
      trial_days: company.plan_tier === 'trial' ? (company.days_remaining || 15) : 30,
      seat_limit: company.seat_limit ?? '',
    });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditing(true);
    try {
      const payload = {
        name: editForm.name,
        subdomain: editForm.subdomain ? editForm.subdomain.trim() : undefined,
        country: editForm.country || null,
        plan_tier: editForm.plan_tier,
        seat_limit: editForm.seat_limit ? Number(editForm.seat_limit) : null,
      };
      if (editForm.plan_tier === 'trial') {
        payload.trial_days = editForm.trial_days ? Number(editForm.trial_days) : undefined;
      }
      await updateCompany(editFor.id, payload);
      setEditFor(null);
      loadCompanies();
    } catch (err) {
      setEditError(err.response?.data?.detail || err.message || 'Failed to update company');
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
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table className="data-table" style={{ width: '100%', minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ width: '26%', minWidth: 200 }}>Company</th>
                <th style={{ width: '12%', minWidth: 100 }}>Status</th>
                <th style={{ width: '13%', minWidth: 100 }}>Plan Tier</th>
                <th style={{ width: '13%', minWidth: 110 }}>Expiry Date</th>
                <th style={{ width: '12%', minWidth: 110 }}>Days Left</th>
                <th style={{ width: '10%', minWidth: 80 }}>Country</th>
                <th style={{ width: '14%', minWidth: 160, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c, i) => {
                const plan = PLAN_STYLES[c.plan_tier] || { label: c.plan_tier, color: '#475569', bg: '#f1f5f9' };
                const daysLeft = getDaysRemaining(c);
                const isExpired = daysLeft === 0 || (c.plan_ends_at && new Date(c.plan_ends_at) <= new Date());
                const isExpiringSoon = daysLeft != null && daysLeft > 0 && daysLeft < 7;
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0,
                            background: avatarGradient(i), display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: 'white', fontSize: '0.8rem', fontWeight: 700,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                          }}
                        >
                          {companyInitials(c.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{c.name}</div>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              marginTop: 3,
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              maxWidth: '100%',
                            }}
                          >
                            <Globe size={11} style={{ color: '#64748b', flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#475569',
                                fontWeight: 500,
                                fontFamily: 'monospace',
                              }}
                              className="truncate"
                            >
                              {c.subdomain}.{BASE_DOMAIN}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); copyPortalUrl(c); }}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                color: copiedSubdomainId === c.id ? 'var(--accent-emerald)' : '#94a3b8',
                                transition: 'color 150ms ease', flexShrink: 0,
                              }}
                              title={copiedSubdomainId === c.id ? 'Copied!' : 'Copy portal URL'}
                            >
                              {copiedSubdomainId === c.id ? <Check size={11} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={11} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[c.status] || '#94a3b8', flexShrink: 0 }} />
                        <span className={`badge ${STATUS_BADGE[c.status] || 'badge-info'}`}>{c.status.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem', fontWeight: 700,
                          color: plan.color, background: plan.bg, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatPlanTier(c.plan_tier)}
                      </span>
                    </td>
                    <td style={{ color: '#334155', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {formatDate(c.plan_ends_at)}
                    </td>
                    <td>
                      {daysLeft != null ? (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap',
                            ...(isExpired
                              ? { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
                              : isExpiringSoon
                              ? { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }
                              : { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }),
                          }}
                        >
                          {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.country || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="platform-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openUsers(c)} title="View Users">
                          <Users size={13} /> <span className="platform-action-label">Users</span>
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openInvite(c)} title="Invite Admin">
                          <UserPlus size={13} /> <span className="platform-action-label">Invite</span>
                        </button>
                        <button
                          className="btn-icon btn-ghost"
                          style={{
                            width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                            background: '#ffffff',
                            color: c.status === 'suspended' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                            padding: 0,
                          }}
                          onClick={() => handleToggleStatus(c)}
                          disabled={c.status === 'pending_setup'}
                          title={c.status === 'pending_setup' ? 'Awaiting admin setup' : c.status === 'suspended' ? 'Reactivate tenant' : 'Suspend tenant'}
                        >
                          {c.status === 'suspended' ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                        </button>
                        <button
                          className="btn-icon btn-ghost"
                          style={{
                            width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                            background: '#ffffff',
                            color: 'var(--text-secondary)',
                            padding: 0,
                          }}
                          onClick={() => openEdit(c)}
                          title="Edit tenant details"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-icon btn-ghost"
                          style={{
                            width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                            background: '#ffffff',
                            color: 'var(--accent-rose)',
                            padding: 0,
                          }}
                          onClick={() => setDeleteFor(c)}
                          title="Delete tenant permanently"
                        >
                          <Trash2 size={15} />
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
        <Modal
          title={createdResult ? 'Company Created' : 'New Company'}
          onClose={() => {
            setShowCreate(false);
            setCreatedResult(null);
            setCreatedLinkCopied(false);
          }}
        >
          {!createdResult ? (
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label className="input-label">Company Name</label>
                <input
                  className="input-field"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Acme Corporation"
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Country</label>
                <input
                  className="input-field"
                  value={createForm.country}
                  onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
                  placeholder="e.g. India"
                />
              </div>
              <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 14 }}>
                <input
                  type="checkbox"
                  id="create_multi_entity"
                  checked={createForm.multi_entity}
                  onChange={(e) => setCreateForm({ ...createForm, multi_entity: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="create_multi_entity" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Multi-Entity Organization
                </label>
              </div>
              <div className="input-group">
                <label className="input-label">Plan Tier</label>
                <select
                  className="input-field"
                  value={createForm.plan_tier}
                  onChange={(e) => setCreateForm({ ...createForm, plan_tier: e.target.value })}
                >
                  <option value="trial">Trial</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half_yearly">Half-Yearly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              {createForm.plan_tier === 'trial' && (
                <div className="input-group animate-fade-in">
                  <label className="input-label">Trial Duration (Days)</label>
                  <input
                    type="number"
                    min="1"
                    className="input-field"
                    value={createForm.trial_days}
                    onChange={(e) => setCreateForm({ ...createForm, trial_days: e.target.value })}
                    placeholder="e.g. 15"
                    required
                  />
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Seat Limit (optional)</label>
                <input
                  type="number"
                  className="input-field"
                  value={createForm.seat_limit}
                  onChange={(e) => setCreateForm({ ...createForm, seat_limit: e.target.value })}
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={creating} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                {creating ? 'Creating...' : 'Create Company'}
              </button>
            </form>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)',
                  fontSize: '0.875rem', fontWeight: 600, marginBottom: 16,
                }}
              >
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <span>Company created successfully!</span>
              </div>

              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                <strong>{createdResult.name}</strong> has been provisioned. Their portal URL is:
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  wordBreak: 'break-all',
                  marginBottom: 16,
                }}
              >
                <span style={{ flex: 1, color: '#0f172a' }}>{getPortalUrl(createdResult.subdomain)}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    flexShrink: 0,
                    color: createdLinkCopied ? 'var(--accent-emerald)' : undefined,
                    background: createdLinkCopied ? 'var(--accent-emerald-light)' : undefined,
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(getPortalUrl(createdResult.subdomain));
                    setCreatedLinkCopied(true);
                    setTimeout(() => setCreatedLinkCopied(false), 1800);
                  }}
                >
                  {createdLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                  {createdLinkCopied ? 'Copied!' : 'Copy link'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreate(false);
                    setCreatedResult(null);
                    setCreatedLinkCopied(false);
                  }}
                >
                  Done
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const comp = createdResult;
                    setShowCreate(false);
                    setCreatedResult(null);
                    setCreatedLinkCopied(false);
                    openInvite(comp);
                  }}
                >
                  <UserPlus size={15} /> Invite Admin
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {inviteFor && (
        <Modal title={`Invite Admin — ${inviteFor.name}`} onClose={() => setInviteFor(null)}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              fontSize: '0.8125rem',
              marginBottom: 16,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              Portal: <strong style={{ color: '#0f172a' }}>{getPortalUrl(inviteFor.subdomain)}</strong>
            </span>
            <button
              type="button"
              className="btn-icon btn-ghost"
              style={{ width: 22, height: 22, padding: 0 }}
              onClick={() => {
                navigator.clipboard.writeText(getPortalUrl(inviteFor.subdomain));
                setCopiedSubdomainId('invite');
                setTimeout(() => setCopiedSubdomainId(null), 1800);
              }}
              title="Copy Portal URL"
            >
              {copiedSubdomainId === 'invite' ? <Check size={13} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={13} />}
            </button>
          </div>

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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              fontSize: '0.8125rem',
              marginBottom: 14,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              Portal: <strong style={{ color: '#0f172a' }}>{getPortalUrl(usersFor.subdomain)}</strong>
            </span>
            <button
              type="button"
              className="btn-icon btn-ghost"
              style={{ width: 22, height: 22, padding: 0 }}
              onClick={() => {
                navigator.clipboard.writeText(getPortalUrl(usersFor.subdomain));
                setCopiedSubdomainId('users');
                setTimeout(() => setCopiedSubdomainId(null), 1800);
              }}
              title="Copy Portal URL"
            >
              {copiedSubdomainId === 'users' ? <Check size={13} style={{ color: 'var(--accent-emerald)' }} /> : <Copy size={13} />}
            </button>
          </div>

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
          {editError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-rose-light)',
                color: 'var(--accent-rose)',
                fontSize: '0.8125rem',
                marginBottom: 14,
              }}
            >
              <ShieldAlert size={15} style={{ flexShrink: 0 }} /> {editError}
            </div>
          )}
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
              <label className="input-label">Subdomain</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  className="input-field"
                  value={editForm.subdomain}
                  onChange={(e) => setEditForm({ ...editForm, subdomain: e.target.value })}
                  maxLength={63}
                  placeholder="e.g. acme-corp"
                  required
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                />
                <span
                  style={{
                    height: 38,
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderLeft: 'none',
                    borderTopRightRadius: 'var(--radius-md)',
                    borderBottomRightRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  .{BASE_DOMAIN}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Portal: https://{editForm.subdomain || '...'}.{BASE_DOMAIN} (max 63 characters)
              </span>
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
                <option value="trial">Trial</option>
                <option value="quarterly">Quarterly</option>
                <option value="half_yearly">Half-Yearly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            {editForm.plan_tier === 'trial' && (
              <div className="input-group animate-fade-in">
                <label className="input-label">Trial Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={editForm.trial_days}
                  onChange={(e) => setEditForm({ ...editForm, trial_days: e.target.value })}
                  placeholder="e.g. 15"
                  required
                />
              </div>
            )}
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
