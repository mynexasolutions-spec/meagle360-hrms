import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { getDirectory, inviteEmployee, getDepartments, getRoles, getSites } from '../api/employees';
import { Users, Search, Plus, Copy, Check, LayoutGrid, List, Mail, UserCheck, UserX, FileText, Award, Building2 } from 'lucide-react';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import OrgChart from './OrgChart';
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
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'linear-gradient(135deg, #06b6d4, #0284c7)',
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const canInvite = !!user?.permissions?.['employees:write'];
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'organization' ? 'organization' : 'directory';
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const handleTabChange = (tab) => {
    if (tab === 'organization') {
      setSearchParams({ tab: 'organization' });
    } else {
      setSearchParams({});
    }
  };

  useEffect(() => {
    loadEmployees();
    getDepartments().then((res) => setDepartments(res.data)).catch(() => { });
    getSites().then((res) => setSites(res.data)).catch(() => { });
    if (canInvite) {
      getRoles().then((res) => setRoles(res.data)).catch(() => { });
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

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((e) => e.account_status === 'active').length,
    invited: employees.filter((e) => e.account_status === 'invited').length,
    noLogin: employees.filter((e) => e.account_status === 'no_login').length,
  }), [employees]);

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
    setLinkCopied(false);
    setShowInvite(true);
  };

  const handleCopyLink = async () => {
    if (!setupLink) return;
    try {
      await navigator.clipboard.writeText(setupLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const closeInvite = () => {
    setShowInvite(false);
    setInviteResult(null);
    loadEmployees();
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
      {/* 1. Header with dynamic title and action buttons */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            {activeTab === 'organization' ? (
              <Building2 size={22} style={{ color: '#2563eb' }} />
            ) : (
              <Users size={22} style={{ color: '#2563eb' }} />
            )}
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {activeTab === 'organization' ? 'Organization Structure' : 'Employee Directory'}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '2px 0 0 0' }}>
              {activeTab === 'organization'
                ? "Visual hierarchy of your organization's reporting structure"
                : `${employees.length} employees in your organization`}
            </p>
          </div>
        </div>
        {activeTab === 'directory' && canInvite && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/offer-letter')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              <FileText size={16} style={{ color: '#2563eb' }} /> Offer Letter
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/relieving-letter')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              }}
            >
              <Award size={16} style={{ color: '#059669' }} /> Relieving Letter
            </button>
            <button className="btn btn-primary" onClick={openInvite}>
              <Plus size={16} /> Invite Employee
            </button>
          </div>
        )}
      </div>

      {/* 2. Top Segmented Navigation Tabs */}
      <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 12, border: '1px solid #e2e8f0', width: 'fit-content', marginBottom: 22 }}>
        <button
          onClick={() => handleTabChange('directory')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 9, border: 'none',
            fontSize: '0.84rem', fontWeight: activeTab === 'directory' ? 700 : 600, cursor: 'pointer',
            background: activeTab === 'directory' ? '#ffffff' : 'transparent',
            color: activeTab === 'directory' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'directory' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={16} style={{ color: activeTab === 'directory' ? '#2563eb' : '#94a3b8' }} />
          <span>Employee Directory</span>
          <span style={{ fontSize: '0.70rem', padding: '1px 7px', borderRadius: 99, background: activeTab === 'directory' ? '#eff6ff' : '#e2e8f0', color: activeTab === 'directory' ? '#2563eb' : '#64748b', fontWeight: 700 }}>
            {employees.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('organization')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 9, border: 'none',
            fontSize: '0.84rem', fontWeight: activeTab === 'organization' ? 700 : 600, cursor: 'pointer',
            background: activeTab === 'organization' ? '#ffffff' : 'transparent',
            color: activeTab === 'organization' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'organization' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Building2 size={16} style={{ color: activeTab === 'organization' ? '#2563eb' : '#94a3b8' }} />
          <span>Organization</span>
        </button>
      </div>

      {/* 3. Conditional Tab Content */}
      {activeTab === 'organization' ? (
        <OrgChart embedded={true} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard icon={Users} label="Total Employees" value={stats.total} bgColor="#eff6ff" color="#2563eb" />
            <StatCard icon={UserCheck} label="Active Accounts" value={stats.active} bgColor="#ecfdf5" color="#059669" />
            <StatCard icon={Mail} label="Invited" value={stats.invited} bgColor="#fffbeb" color="#d97706" />
            <StatCard icon={UserX} label="No Login Access" value={stats.noLogin} bgColor="#f8fafc" color="#64748b" />
          </div>

          {/* Search & View Switcher Bar */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
              <Search
                size={18}
                style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)', color: '#94a3b8',
                }}
              />
              <input
                className="input-field"
                style={{
                  paddingLeft: 42,
                  borderRadius: 12,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  background: '#ffffff',
                }}
                placeholder="Search by name, code, or department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* View Mode Toggle Switcher */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <button
            onClick={() => setViewMode('table')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              background: viewMode === 'table' ? '#ffffff' : 'transparent',
              color: viewMode === 'table' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'table' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <List size={15} /> <span className="view-toggle-label">Table List</span>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              background: viewMode === 'grid' ? '#ffffff' : 'transparent',
              color: viewMode === 'grid' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid size={15} /> <span className="view-toggle-label">Grid Cards</span>
          </button>
        </div>
      </div>

      {/* Grid Mode */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 20 }}>
          {filtered.map((emp, i) => (
            <Link
              key={emp.id}
              to={`/employees/${emp.id}`}
              className="employee-card"
              style={{
                textDecoration: 'none',
                background: '#ffffff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
                boxShadow: '0 4px 18px rgba(0,0,0,0.02)',
              }}
            >
              {/* Account Badge */}
              <span
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 10,
                  background: emp.account_status === 'active' ? '#dcfce7' : emp.account_status === 'invited' ? '#fef3c7' : '#f1f5f9',
                  color: emp.account_status === 'active' ? '#15803d' : emp.account_status === 'invited' ? '#b45309' : '#64748b',
                }}
              >
                {ACCOUNT_STATUS_LABEL[emp.account_status] || emp.account_status}
              </span>

              {/* Avatar */}
              {emp.photo_url ? (
                <img
                  src={emp.photo_url}
                  alt={emp.full_name}
                  style={{ width: 64, height: 64, borderRadius: 20, objectFit: 'cover', marginBottom: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 20,
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.25rem',
                    marginBottom: 14,
                    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                  }}
                >
                  {emp.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                </div>
              )}

              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{emp.full_name}</h3>
              <div style={{ fontSize: '0.78125rem', color: '#64748b', marginBottom: 12 }}>{emp.work_email || emp.email || '—'}</div>

              {/* Department Tag */}
              {emp.department_name && (
                <span style={{ fontSize: '0.78125rem', fontWeight: 600, padding: '4px 14px', borderRadius: 10, background: '#eff6ff', color: '#2563eb', marginBottom: 16 }}>
                  {emp.department_name}
                </span>
              )}

              <div style={{ width: '100%', borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: '0.78125rem', color: '#64748b' }}>
                <span>Code: <strong style={{ color: '#334155' }}>{emp.employee_code}</strong></span>
                <span>Site: <strong style={{ color: '#334155' }}>{emp.site_name || 'Main Office'}</strong></span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Table Mode */
        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            borderTop: '3px solid #2563eb',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03)',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Employee</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Code</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Department</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Location / Site</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Role</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Account Status</th>
                <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                    <Link
                      to={`/employees/${emp.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
                    >
                      {emp.photo_url ? (
                        <img
                          src={emp.photo_url}
                          alt={emp.full_name}
                          style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            flexShrink: 0,
                            background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                          }}
                        >
                          {emp.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.925rem', color: '#0f172a' }}>{emp.full_name}</div>
                        <div style={{ fontSize: '0.78125rem', color: '#64748b' }}>{emp.work_email || emp.email || '—'}</div>
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{emp.employee_code}</td>
                  <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                    {emp.department_name ? (
                      <span style={{ padding: '4px 12px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '0.8125rem' }}>
                        {emp.department_name}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{emp.site_name || 'Main Office'}</td>
                  <td style={{ padding: '14px 20px', color: '#475569', fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {(emp.role_names || []).join(', ') || 'Employee'}
                  </td>
                  <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: '0.78125rem',
                        background: emp.account_status === 'active' ? '#dcfce7' : emp.account_status === 'invited' ? '#fef3c7' : '#f1f5f9',
                        color: emp.account_status === 'active' ? '#15803d' : emp.account_status === 'invited' ? '#b45309' : '#64748b',
                      }}
                    >
                      {ACCOUNT_STATUS_LABEL[emp.account_status] || emp.account_status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {canInvite && (
                      <button
                        className="btn btn-secondary"
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.75rem',
                          gap: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: 8,
                        }}
                        onClick={() => navigate(`/relieving-letter?employee_id=${emp.id}`)}
                        title="Generate Official Relieving Letter"
                      >
                        <Award size={14} style={{ color: '#059669' }} /> Relieving Letter
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      </>
      )}

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
                  Account created for <strong>{inviteResult.email}</strong>, but the setup email
                  couldn't be sent automatically — share this link with them manually instead.
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
