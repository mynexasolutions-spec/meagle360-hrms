import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getEmployee,
  updateEmployee,
  resendInvite,
  getEmployeeDocuments,
  addEmployeeDocument,
  getDepartments,
  getSites,
  getRoles,
  updateEmployeeRoles,
} from '../api/employees';
import { getGratuityStatus, getFnfForEmployee, initiateFnf, processFnf } from '../api/payroll';
import {
  ArrowLeft, Copy, Pencil, UserX, UserCheck, Mail, FileText, Upload, Shield, LogOut, Award,
  Briefcase, KeyRound, User, Wallet, ExternalLink,
} from 'lucide-react';
import Modal from '../components/Modal';
import RelievingLetterModal from '../components/RelievingLetterModal';
import { useAuth } from '../context/AuthContext';

function money(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ACCOUNT_STATUS_LABEL = {
  active: 'Active',
  invited: 'Invited — awaiting first login',
  no_login: 'No login created',
};

const ACCOUNT_STATUS_COLOR = {
  active: 'badge-active',
  invited: 'badge-probation',
  no_login: 'badge-inactive',
};

const EMPTY_EDIT_FORM = {
  full_name: '',
  department_id: '',
  site_id: '',
  photo_url: '',
  personal_email: '',
  phone: '',
  date_of_birth: '',
  gender: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  employment_type: 'full_time',
  pan_number: '',
  uan_number: '',
  bank_account_number: '',
  bank_ifsc: '',
  esi_number: '',
  esi_registered_date: '',
  tax_regime: '',
  declared_investments: '0',
  epf_applicable: '',
  esi_applicable: '',
};

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = !!user?.permissions?.['employees:write'];
  const canManageRoles = !!user?.permissions?.['settings:write'];
  const canViewPayroll = !!user?.permissions?.['payroll:read'];
  const canManagePayroll = !!user?.permissions?.['payroll:write'];
  const canApprovePayroll = !!user?.permissions?.['payroll:approve'];

  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [gratuity, setGratuity] = useState(null);
  const [fnf, setFnf] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [docForm, setDocForm] = useState({ doc_type: '', file_url: '' });
  const [showRoles, setShowRoles] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [showFnf, setShowFnf] = useState(false);
  const [showRelievingModal, setShowRelievingModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    getDepartments().then((res) => setDepartments(res.data)).catch(() => {});
    getSites().then((res) => setSites(res.data)).catch(() => {});
    if (canManageRoles) {
      getRoles().then((res) => setAllRoles(res.data)).catch(() => {});
    }
    if (canViewPayroll) {
      getGratuityStatus(id).then((res) => setGratuity(res.data)).catch(() => {});
      getFnfForEmployee(id).then((res) => setFnf(res.data)).catch(() => {});
    }
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, docsRes] = await Promise.all([
        getEmployee(id),
        getEmployeeDocuments(id),
      ]);
      setEmployee(empRes.data);
      setEditForm({
        full_name: empRes.data.full_name,
        department_id: empRes.data.department_id || '',
        site_id: empRes.data.site_id || '',
        photo_url: empRes.data.photo_url || '',
        personal_email: empRes.data.personal_email || '',
        phone: empRes.data.phone || '',
        date_of_birth: empRes.data.date_of_birth || '',
        gender: empRes.data.gender || '',
        address: empRes.data.address || '',
        emergency_contact_name: empRes.data.emergency_contact_name || '',
        emergency_contact_phone: empRes.data.emergency_contact_phone || '',
        employment_type: empRes.data.employment_type || 'full_time',
        pan_number: empRes.data.pan_number || '',
        uan_number: empRes.data.uan_number || '',
        bank_account_number: empRes.data.bank_account_number || '',
        bank_ifsc: empRes.data.bank_ifsc || '',
        esi_number: empRes.data.esi_number || '',
        esi_registered_date: empRes.data.esi_registered_date || '',
        tax_regime: empRes.data.tax_regime || '',
        declared_investments: String(empRes.data.declared_investments ?? '0'),
        epf_applicable: empRes.data.epf_applicable === null || empRes.data.epf_applicable === undefined ? '' : String(empRes.data.epf_applicable),
        esi_applicable: empRes.data.esi_applicable === null || empRes.data.esi_applicable === undefined ? '' : String(empRes.data.esi_applicable),
      });
      setDocuments(docsRes.data);
      setSelectedRoleIds(empRes.data.additional_role_ids || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRoles = async () => {
    try {
      await updateEmployeeRoles(id, selectedRoleIds);
      setShowRoles(false);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update roles');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await updateEmployee(id, {
        full_name: editForm.full_name,
        department_id: editForm.department_id || null,
        site_id: editForm.site_id || null,
        photo_url: editForm.photo_url || null,
        personal_email: editForm.personal_email || null,
        phone: editForm.phone || null,
        date_of_birth: editForm.date_of_birth || null,
        gender: editForm.gender || null,
        address: editForm.address || null,
        emergency_contact_name: editForm.emergency_contact_name || null,
        emergency_contact_phone: editForm.emergency_contact_phone || null,
        employment_type: editForm.employment_type,
        pan_number: editForm.pan_number || null,
        uan_number: editForm.uan_number || null,
        bank_account_number: editForm.bank_account_number || null,
        bank_ifsc: editForm.bank_ifsc || null,
        esi_number: editForm.esi_number || null,
        esi_registered_date: editForm.esi_registered_date || null,
        tax_regime: editForm.tax_regime || null,
        declared_investments: Number(editForm.declared_investments || 0),
        epf_applicable: editForm.epf_applicable === '' ? null : editForm.epf_applicable === 'true',
        esi_applicable: editForm.esi_applicable === '' ? null : editForm.esi_applicable === 'true',
      });
      setShowEdit(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update employee');
    }
  };

  const handleInitiateFnf = async (exitDate, exitReason) => {
    try {
      const res = await initiateFnf(id, { exit_date: exitDate, exit_reason: exitReason || null });
      setFnf(res.data);
      setShowFnf(false);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to initiate Full & Final settlement');
    }
  };

  const handleProcessFnf = async () => {
    if (!confirm('Mark this Full & Final settlement as processed/paid?')) return;
    try {
      const res = await processFnf(fnf.id);
      setFnf(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to process settlement');
    }
  };

  const toggleStatus = async () => {
    const next = employee.employment_status === 'active' ? 'inactive' : 'active';
    if (!confirm(`Mark ${employee.full_name} as ${next}?`)) return;
    try {
      await updateEmployee(id, { employment_status: next });
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const handleResendInvite = async () => {
    setError('');
    try {
      const res = await resendInvite(id);
      setInviteLink(`${window.location.origin}/set-password?token=${res.data.invite_token}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend invite');
    }
  };

  const handleUploadDoc = async (e) => {
    e.preventDefault();
    try {
      await addEmployeeDocument(id, docForm);
      setShowUploadDoc(false);
      setDocForm({ doc_type: '', file_url: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload document');
    }
  };

  if (loading) return <div className="animate-fade-in">Loading...</div>;
  if (!employee) return <div className="animate-fade-in">Employee not found.</div>;

  const initials = employee.full_name.split(' ').map((n) => n[0]).join('').toUpperCase();

  return (
    <div className="animate-fade-in">
      <button
        className="btn-ghost"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}
        onClick={() => navigate('/employees')}
      >
        <ArrowLeft size={15} /> Back to Directory
      </button>

      <div className="profile-hero">
        <div className="profile-hero-cover" />
        <div className="profile-hero-body">
          {employee.photo_url ? (
            <img
              className="profile-hero-avatar"
              src={employee.photo_url}
              alt={employee.full_name}
              style={{ width: 88, height: 88, borderRadius: 20, objectFit: 'cover', border: '4px solid var(--bg-card)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', flexShrink: 0 }}
            />
          ) : (
            <div
              className="profile-hero-avatar"
              style={{
                width: 88, height: 88, borderRadius: 20, flexShrink: 0,
                background: 'var(--gradient-primary)', color: '#fff', fontSize: '1.75rem', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '4px solid var(--bg-card)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              }}
            >
              {initials}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {employee.full_name}
              <span className={`badge badge-${employee.employment_status}`}>{employee.employment_status}</span>
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600 }}>{employee.employee_code}</span>
              {employee.department_name && <><span>·</span><span>{employee.department_name}</span></>}
              {employee.site_name && <><span>·</span><span>{employee.site_name}</span></>}
            </div>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowRelievingModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                }}
              >
                <Award size={16} style={{ color: '#059669' }} /> Relieving Letter
              </button>
              <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
                <Pencil size={16} /> Edit
              </button>
              <button className="btn btn-secondary" onClick={toggleStatus}>
                {employee.employment_status === 'active' ? (
                  <><UserX size={16} /> Deactivate</>
                ) : (
                  <><UserCheck size={16} /> Reactivate</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>
      )}

      <div className="content-grid">
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <h3 style={{ marginBottom: 16 }}><Briefcase size={17} style={{ color: '#2563eb' }} /> Employment Details</h3>
          <dl className="info-dl">
            <dt>Status</dt>
            <dd><span className={`badge badge-${employee.employment_status}`}>{employee.employment_status}</span></dd>
            <dt>Department</dt>
            <dd>{employee.department_name || '—'}</dd>
            <dt>Site</dt>
            <dd>{employee.site_name || '—'}</dd>
            <dt>Manager</dt>
            <dd>{employee.manager_name || '—'}</dd>
            <dt>Hire Date</dt>
            <dd>{employee.date_of_hire}</dd>
          </dl>
        </div>

        <div className="section-card" style={{ borderTop: '3px solid #7c3aed' }}>
          <h3 style={{ marginBottom: 16 }}><KeyRound size={17} style={{ color: '#7c3aed' }} /> Account & Access</h3>
          <dl className="info-dl">
            <dt>Login Email</dt>
            <dd style={{ fontWeight: 500 }}>{employee.email || '—'}</dd>
            <dt>Role(s)</dt>
            <dd>{(employee.role_names || []).join(', ') || '—'}</dd>
            <dt>Account</dt>
            <dd>
              <span className={`badge ${ACCOUNT_STATUS_COLOR[employee.account_status] || 'badge-inactive'}`}>
                {ACCOUNT_STATUS_LABEL[employee.account_status] || employee.account_status}
              </span>
            </dd>
          </dl>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {canManage && employee.account_status === 'invited' && (
              <button className="btn btn-secondary" onClick={handleResendInvite}>
                <Mail size={16} /> Resend Invite Link
              </button>
            )}
            {canManageRoles && employee.email && (
              <button className="btn btn-secondary" onClick={() => setShowRoles(true)}>
                <Shield size={16} /> Manage Additional Roles
              </button>
            )}
          </div>
          {inviteLink && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
                padding: '10px 12px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                fontSize: '0.75rem', wordBreak: 'break-all',
              }}
            >
              <span style={{ flex: 1 }}>{inviteLink}</span>
              <button type="button" className="btn-icon btn-ghost" onClick={() => navigator.clipboard.writeText(inviteLink)} title="Copy link">
                <Copy size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="section-card" style={{ gridColumn: '1 / -1', borderTop: '3px solid #059669' }}>
          <h3 style={{ marginBottom: 16 }}><User size={17} style={{ color: '#059669' }} /> Personal Information</h3>
          <dl className="info-dl-wide">
            <dt>Personal Email</dt>
            <dd>{employee.personal_email || '—'}</dd>
            <dt>Phone</dt>
            <dd>{employee.phone || '—'}</dd>
            <dt>Date of Birth</dt>
            <dd>{employee.date_of_birth || '—'}</dd>
            <dt>Gender</dt>
            <dd>{employee.gender || '—'}</dd>
            <dt>Address</dt>
            <dd style={{ gridColumn: 'span 3' }}>{employee.address || '—'}</dd>
            <dt>Emergency Contact</dt>
            <dd>{employee.emergency_contact_name || '—'}</dd>
            <dt>Emergency Phone</dt>
            <dd>{employee.emergency_contact_phone || '—'}</dd>
          </dl>
        </div>

        {canViewPayroll && (
          <div className="section-card" style={{ gridColumn: '1 / -1', borderTop: '3px solid #d97706' }}>
            <h3 style={{ marginBottom: 16 }}><Wallet size={17} style={{ color: '#d97706' }} /> Statutory & Payroll Details</h3>
            <dl className="info-dl-wide">
              <dt>Employment Type</dt>
              <dd style={{ textTransform: 'capitalize' }}>{(employee.employment_type || 'full_time').replace('_', ' ')}</dd>
              <dt>PAN</dt>
              <dd>{employee.pan_number || '—'}</dd>
              <dt>UAN</dt>
              <dd>{employee.uan_number || '—'}</dd>
              <dt>Bank Account</dt>
              <dd>{employee.bank_account_number ? `${employee.bank_account_number} (${employee.bank_ifsc || 'no IFSC'})` : '—'}</dd>
              <dt>ESI Number</dt>
              <dd>{employee.esi_number || '—'}</dd>
              <dt>ESI Registered</dt>
              <dd>{employee.esi_registered_date || '—'}</dd>
              <dt>EPF Applicable</dt>
              <dd>{employee.epf_applicable === null || employee.epf_applicable === undefined ? 'Auto (company policy)' : employee.epf_applicable ? 'Yes' : 'No'}</dd>
              <dt>ESI Applicable</dt>
              <dd>{employee.esi_applicable === null || employee.esi_applicable === undefined ? 'Auto (headcount/ceiling)' : employee.esi_applicable ? 'Yes' : 'No'}</dd>
              <dt>Tax Regime</dt>
              <dd style={{ textTransform: 'capitalize' }}>{employee.tax_regime || 'New (default)'}</dd>
              <dt>Declared Investments</dt>
              <dd>₹{money(employee.declared_investments)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(old regime only)</span></dd>
            </dl>
          </div>
        )}

        {canViewPayroll && (
          <div className="section-card" style={{ gridColumn: '1 / -1', borderTop: '3px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ marginBottom: 0 }}><Award size={18} style={{ color: 'var(--accent-amber)' }} /> Gratuity & Exit</h3>
              {canManagePayroll && !fnf && employee.employment_status === 'active' && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowFnf(true)}>
                  <LogOut size={14} /> Initiate Exit / Full & Final
                </button>
              )}
            </div>
            {gratuity && (
              <dl className="info-dl-wide" style={{ marginBottom: fnf ? 20 : 0 }}>
                <dt>Gratuity Eligible</dt>
                <dd>{gratuity.eligible ? 'Yes' : 'Not yet'}</dd>
                <dt>Years of Service</dt>
                <dd>{gratuity.years_of_service} (needs {gratuity.years_required})</dd>
                <dt>Headcount Requirement Met</dt>
                <dd>{gratuity.headcount_met ? 'Yes' : 'No'}</dd>
                <dt>Estimated Gratuity</dt>
                <dd>₹{money(gratuity.estimated_amount)}</dd>
              </dl>
            )}
            {fnf && (
              <div style={{ borderTop: gratuity ? '1px solid var(--border-color)' : 'none', paddingTop: gratuity ? 16 : 0 }}>
                <h4 style={{ marginBottom: 12, fontSize: '0.9375rem' }}>Full & Final Settlement — Exit Date: {fnf.exit_date}</h4>
                <dl className="info-dl-wide">
                  <dt>Pending Salary</dt>
                  <dd>₹{money(fnf.pending_salary_amount)}</dd>
                  <dt>Leave Encashment</dt>
                  <dd>{fnf.leave_encashment_days} days = ₹{money(fnf.leave_encashment_amount)}</dd>
                  <dt>Gratuity</dt>
                  <dd>{fnf.gratuity_eligible ? `₹${money(fnf.gratuity_amount)}` : 'Not eligible'}</dd>
                  <dt>Outstanding Deductions</dt>
                  <dd>-₹{money(fnf.outstanding_deductions)}</dd>
                  <dt>Net Payable</dt>
                  <dd style={{ fontWeight: 800 }}>₹{money(fnf.net_payable)}</dd>
                  <dt>Status</dt>
                  <dd><span className={`badge ${fnf.status === 'processed' ? 'badge-active' : 'badge-pending'}`}>{fnf.status}</span></dd>
                </dl>
                {canApprovePayroll && fnf.status === 'pending' && (
                  <button className="btn btn-success btn-sm" style={{ marginTop: 16 }} onClick={handleProcessFnf}>Mark as Processed / Paid</button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="section-card" style={{ gridColumn: '1 / -1', borderTop: '3px solid #64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ marginBottom: 0 }}><FileText size={17} style={{ color: '#64748b' }} /> Documents</h3>
            {canManage && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowUploadDoc(true)}>
                <Upload size={14} /> Upload Document
              </button>
            )}
          </div>
          {documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={40} />
              <p>No documents on file</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>Type</th>
                    <th style={{ whiteSpace: 'nowrap' }}>File</th>
                    <th style={{ whiteSpace: 'nowrap' }}>e-Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{doc.doc_type}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 320 }}>
                          <span className="truncate" style={{ maxWidth: 280 }}>{doc.file_url}</span>
                          <ExternalLink size={12} style={{ flexShrink: 0 }} />
                        </a>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`badge ${doc.e_signed ? 'badge-active' : 'badge-inactive'}`}>{doc.e_signed ? 'Yes' : 'No'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <Modal title="Edit Employee" onClose={() => setShowEdit(false)}>
          <form onSubmit={handleEdit}>
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                className="input-field"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Photo URL</label>
              <input
                className="input-field"
                placeholder="https://..."
                value={editForm.photo_url}
                onChange={(e) => setEditForm({ ...editForm, photo_url: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Department</label>
              <select
                className="input-field"
                value={editForm.department_id}
                onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
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
                value={editForm.site_id}
                onChange={(e) => setEditForm({ ...editForm, site_id: e.target.value })}
              >
                <option value="">No site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Personal Email</label>
              <input
                type="email"
                className="input-field"
                value={editForm.personal_email}
                onChange={(e) => setEditForm({ ...editForm, personal_email: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Phone</label>
              <input
                className="input-field"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Date of Birth</label>
              <input
                type="date"
                className="input-field"
                value={editForm.date_of_birth}
                onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Gender</label>
              <select
                className="input-field"
                value={editForm.gender}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Address</label>
              <input
                className="input-field"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Emergency Contact Name</label>
              <input
                className="input-field"
                value={editForm.emergency_contact_name}
                onChange={(e) => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label className="input-label">Emergency Contact Phone</label>
              <input
                className="input-field"
                value={editForm.emergency_contact_phone}
                onChange={(e) => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
              />
            </div>

            {canViewPayroll && (
              <>
                <h4 style={{ margin: '16px 0 8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Statutory & Payroll</h4>
                <div className="input-group">
                  <label className="input-label">Employment Type</label>
                  <select className="input-field" value={editForm.employment_type} onChange={(e) => setEditForm({ ...editForm, employment_type: e.target.value })}>
                    <option value="full_time">Full-time</option>
                    <option value="fixed_term">Fixed-term</option>
                    <option value="contractor">Contractor</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">PAN Number</label>
                  <input className="input-field" value={editForm.pan_number} onChange={(e) => setEditForm({ ...editForm, pan_number: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">UAN Number</label>
                  <input className="input-field" value={editForm.uan_number} onChange={(e) => setEditForm({ ...editForm, uan_number: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Bank Account Number</label>
                  <input className="input-field" value={editForm.bank_account_number} onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">Bank IFSC</label>
                  <input className="input-field" value={editForm.bank_ifsc} onChange={(e) => setEditForm({ ...editForm, bank_ifsc: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">ESI Number</label>
                  <input className="input-field" value={editForm.esi_number} onChange={(e) => setEditForm({ ...editForm, esi_number: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">ESI Registered Date</label>
                  <input type="date" className="input-field" value={editForm.esi_registered_date} onChange={(e) => setEditForm({ ...editForm, esi_registered_date: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">EPF Applicable</label>
                  <select className="input-field" value={editForm.epf_applicable} onChange={(e) => setEditForm({ ...editForm, epf_applicable: e.target.value })}>
                    <option value="">Auto (follow company policy)</option>
                    <option value="true">Force Yes</option>
                    <option value="false">Force No</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">ESI Applicable</label>
                  <select className="input-field" value={editForm.esi_applicable} onChange={(e) => setEditForm({ ...editForm, esi_applicable: e.target.value })}>
                    <option value="">Auto (headcount/ceiling/cycle)</option>
                    <option value="true">Force Yes</option>
                    <option value="false">Force No</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Tax Regime</label>
                  <select className="input-field" value={editForm.tax_regime} onChange={(e) => setEditForm({ ...editForm, tax_regime: e.target.value })}>
                    <option value="">New (default)</option>
                    <option value="old">Old</option>
                    <option value="new">New</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Declared Investments (₹/year, old regime only)</label>
                  <input type="number" step="0.01" className="input-field" value={editForm.declared_investments} onChange={(e) => setEditForm({ ...editForm, declared_investments: e.target.value })} />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {showFnf && (
        <FnfModal onClose={() => setShowFnf(false)} onSubmit={handleInitiateFnf} />
      )}

      {showRoles && (
        <Modal title={`Additional Roles — ${employee.full_name}`} onClose={() => setShowRoles(false)}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Grants extra permissions on top of their primary role ({(employee.role_names || [])[0] || '—'}) without changing it.
          </p>
          <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
            {allRoles.filter((r) => r.id !== employee.primary_role_id).map((r) => (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(r.id)}
                  onChange={(e) => {
                    setSelectedRoleIds((prev) =>
                      e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)
                    );
                  }}
                />
                {r.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowRoles(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveRoles}>Save</button>
          </div>
        </Modal>
      )}

      {showUploadDoc && (
        <Modal title={`Upload Document — ${employee.full_name}`} onClose={() => setShowUploadDoc(false)}>
          <form onSubmit={handleUploadDoc}>
            <div className="input-group">
              <label className="input-label">Document Type</label>
              <input
                className="input-field"
                placeholder="e.g. Offer Letter, PAN Card"
                value={docForm.doc_type}
                onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">File URL</label>
              <input
                className="input-field"
                placeholder="https://..."
                value={docForm.file_url}
                onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowUploadDoc(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Upload</button>
            </div>
          </form>
        </Modal>
      )}

      {showRelievingModal && (
        <RelievingLetterModal
          employee={employee}
          onClose={() => setShowRelievingModal(false)}
          onSuccess={() => load()}
        />
      )}
    </div>
  );
}

function FnfModal({ onClose, onSubmit }) {
  const [exitDate, setExitDate] = useState('');
  const [exitReason, setExitReason] = useState('');

  return (
    <Modal title="Initiate Exit / Full & Final Settlement" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(exitDate, exitReason); }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          This deactivates the employee and computes pending salary, leave encashment, and gratuity (if eligible) into a settlement you can review before marking it paid.
        </p>
        <div className="input-group">
          <label className="input-label">Exit Date</label>
          <input type="date" className="input-field" value={exitDate} onChange={(e) => setExitDate(e.target.value)} required />
        </div>
        <div className="input-group">
          <label className="input-label">Reason (optional)</label>
          <input className="input-field" value={exitReason} onChange={(e) => setExitReason(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Initiate Settlement</button>
        </div>
      </form>
    </Modal>
  );
}
