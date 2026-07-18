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
import { ArrowLeft, Copy, Pencil, UserX, UserCheck, Mail, FileText, Upload, Shield } from 'lucide-react';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

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
};

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = !!user?.permissions?.['employees:write'];
  const canManageRoles = !!user?.permissions?.['settings:write'];

  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [docForm, setDocForm] = useState({ doc_type: '', file_url: '' });
  const [showRoles, setShowRoles] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
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
      });
      setShowEdit(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update employee');
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={() => navigate('/employees')}>
            <ArrowLeft size={16} /> Back to Directory
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {employee.photo_url ? (
              <img src={employee.photo_url} alt={employee.full_name} className="avatar" style={{ width: 56, height: 56, objectFit: 'cover' }} />
            ) : (
              <div className="avatar" style={{ width: 56, height: 56, fontSize: '1.25rem', background: 'var(--gradient-primary)' }}>
                {employee.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()}
              </div>
            )}
            <div>
              <h1>{employee.full_name}</h1>
              <p>
                {employee.employee_code}
                {employee.department_name ? ` · ${employee.department_name}` : ''}
                {employee.site_name ? ` · ${employee.site_name}` : ''}
              </p>
            </div>
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 10 }}>
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

      {error && (
        <div style={{ marginBottom: 16, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}>Employment Details</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 12, fontSize: '0.875rem' }}>
            <dt style={{ color: 'var(--text-muted)' }}>Status</dt>
            <dd><span className={`badge badge-${employee.employment_status}`}>{employee.employment_status}</span></dd>
            <dt style={{ color: 'var(--text-muted)' }}>Department</dt>
            <dd>{employee.department_name || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Site</dt>
            <dd>{employee.site_name || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Manager</dt>
            <dd>{employee.manager_name || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Hire Date</dt>
            <dd>{employee.date_of_hire}</dd>
          </dl>
        </div>

        <div className="section-card">
          <h3 style={{ marginBottom: 16 }}>Account & Access</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 12, fontSize: '0.875rem' }}>
            <dt style={{ color: 'var(--text-muted)' }}>Login Email</dt>
            <dd>{employee.email || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Role(s)</dt>
            <dd>{(employee.role_names || []).join(', ') || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Account</dt>
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

        <div className="section-card" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: 16 }}>Personal Information</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', rowGap: 12, columnGap: 16, fontSize: '0.875rem' }}>
            <dt style={{ color: 'var(--text-muted)' }}>Personal Email</dt>
            <dd>{employee.personal_email || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Phone</dt>
            <dd>{employee.phone || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Date of Birth</dt>
            <dd>{employee.date_of_birth || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Gender</dt>
            <dd>{employee.gender || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Address</dt>
            <dd style={{ gridColumn: 'span 3' }}>{employee.address || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Emergency Contact</dt>
            <dd>{employee.emergency_contact_name || '—'}</dd>
            <dt style={{ color: 'var(--text-muted)' }}>Emergency Phone</dt>
            <dd>{employee.emergency_contact_phone || '—'}</dd>
          </dl>
        </div>

        <div className="section-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 0 }}>Documents</h3>
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>File</th>
                  <th>e-Signed</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.doc_type}</td>
                    <td><a href={doc.file_url} target="_blank" rel="noreferrer">{doc.file_url}</a></td>
                    <td>{doc.e_signed ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
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
    </div>
  );
}
