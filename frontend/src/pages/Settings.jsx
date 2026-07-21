import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Building, Shield, Calendar, ScrollText, MapPin, Wallet, Pencil, Trash2 } from 'lucide-react';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../api/attendance';
import { getDepartments, createDepartment, getSites, createSite } from '../api/employees';
import { getAuditLogs } from '../api/audit';
import { getMyCompany, updateMyCompany } from '../api/company';
import client from '../api/client';
import Modal from '../components/Modal';

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function Settings() {
  const [tab, setTab] = useState('holidays');
  const [holidays, setHolidays] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [company, setCompany] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [hRes, dRes, sRes, alRes, cRes] = await Promise.all([
        getHolidays().catch(() => ({ data: [] })),
        getDepartments().catch(() => ({ data: [] })),
        getSites().catch(() => ({ data: [] })),
        getAuditLogs().catch(() => ({ data: [] })),
        getMyCompany().catch(() => ({ data: null })),
      ]);
      setHolidays(hRes.data);
      setDepartments(dRes.data);
      setSites(sRes.data);
      setAuditLogs(alRes.data);
      setCompany(cRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleWeeklyOff = async (dayIndex) => {
    const current = company.weekly_off_days || [];
    const next = current.includes(dayIndex) ? current.filter((d) => d !== dayIndex) : [...current, dayIndex];
    try {
      const res = await updateMyCompany({ weekly_off_days: next });
      setCompany(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update weekly off days');
    }
  };

  const handleDeleteHoliday = async (h) => {
    if (!confirm(`Delete "${h.name}" (${h.holiday_date})?`)) return;
    try {
      await deleteHoliday(h.id);
      loadAll();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete holiday');
    }
  };

  const tabs = [
    { id: 'holidays', label: 'Holidays', icon: Calendar },
    { id: 'departments', label: 'Departments', icon: Building },
    { id: 'sites', label: 'Sites', icon: MapPin },
    { id: 'payroll-policy', label: 'Payroll Policy', icon: Wallet },
    { id: 'audit-log', label: 'Audit Log', icon: ScrollText },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <SettingsIcon size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Settings</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Configure company policies, holiday calendars, work sites &amp; system audit logs</p>
          </div>
        </div>
      </div>

      {/* Modern Pill Tabs */}
      <div className="pill-tabs" style={{ marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 18px',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 700,
              border: tab === t.id ? 'none' : '1px solid #cbd5e1',
              background: tab === t.id ? '#0f172a' : '#ffffff',
              color: tab === t.id ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              boxShadow: tab === t.id ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <t.icon size={15} style={{ color: tab === t.id ? '#ffffff' : '#2563eb' }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Holidays Tab */}
      {tab === 'holidays' && (
        <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ marginBottom: 0 }}><Calendar size={18} style={{ color: 'var(--accent-amber)' }} /> Holiday Calendar</h3>
            <button
              onClick={() => setShowAdd('holiday')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              + Add Holiday
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Date</th><th style={{ whiteSpace: 'nowrap' }}>Holiday</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{h.holiday_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{h.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div className="table-row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd({ type: 'edit-holiday', holiday: h })}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteHoliday(h)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {holidays.length === 0 && <div className="empty-state"><p>No holidays configured</p></div>}
        </div>
      )}

      {/* Departments */}
      {tab === 'departments' && (
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ marginBottom: 0 }}><Building size={18} style={{ color: 'var(--accent-blue)' }} /> Departments</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd('department')}>+ Add</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Name</th><th style={{ whiteSpace: 'nowrap' }}>ID</th></tr></thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{d.name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{d.id.slice(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {departments.length === 0 && <div className="empty-state"><p>No departments</p></div>}
        </div>
      )}

      {/* Sites */}
      {tab === 'sites' && (
        <div className="section-card" style={{ borderTop: '3px solid #059669' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ marginBottom: 0 }}><MapPin size={18} style={{ color: 'var(--accent-emerald)' }} /> Sites</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd('site')}>+ Add</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Name</th><th style={{ whiteSpace: 'nowrap' }}>City</th><th style={{ whiteSpace: 'nowrap' }}>State</th><th style={{ whiteSpace: 'nowrap' }}>Country</th></tr></thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{s.name}</td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.city || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.state || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.country || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sites.length === 0 && <div className="empty-state"><MapPin size={48} /><p>No sites registered yet</p></div>}
        </div>
      )}

      {/* Payroll Policy */}
      {tab === 'payroll-policy' && (
        <div className="section-card" style={{ borderTop: '3px solid #7c3aed' }}>
          <h3 style={{ marginBottom: 8 }}><Wallet size={18} style={{ color: 'var(--accent-emerald)' }} /> Weekly Off Days</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Used by Payroll to tell a weekly off apart from an unpaid absence when calculating Loss of Pay.
          </p>
          {company && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {WEEKDAY_LABELS.map((label, i) => {
                const isOff = (company.weekly_off_days || []).includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    className={`btn ${isOff ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => toggleWeeklyOff(i)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Audit Log */}
      {tab === 'audit-log' && (
        <div className="section-card" style={{ borderTop: '3px solid #dc2626' }}>
          <h3><ScrollText size={18} style={{ color: 'var(--accent-rose)' }} /> Audit Log</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>When</th><th style={{ whiteSpace: 'nowrap' }}>Actor</th><th style={{ whiteSpace: 'nowrap' }}>Action</th><th style={{ whiteSpace: 'nowrap' }}>Entity</th></tr></thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{log.actor_name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{log.action}</td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{log.entity_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auditLogs.length === 0 && <div className="empty-state"><ScrollText size={48} /><p>No audit activity yet</p></div>}
        </div>
      )}

      {/* Add Modals */}
      {showAdd === 'holiday' && (
        <AddHolidayModal onClose={() => setShowAdd(false)} onSuccess={loadAll} />
      )}
      {showAdd?.type === 'edit-holiday' && (
        <EditHolidayModal holiday={showAdd.holiday} onClose={() => setShowAdd(false)} onSuccess={loadAll} />
      )}
      {showAdd === 'department' && (
        <AddDepartmentModal onClose={() => setShowAdd(false)} onSuccess={loadAll} />
      )}
      {showAdd === 'site' && (
        <AddSiteModal onClose={() => setShowAdd(false)} onSuccess={loadAll} />
      )}
    </div>
  );
}

function AddHolidayModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ holiday_date: '', name: '' });
  const handleSubmit = async (e) => {
    e.preventDefault();
    await createHoliday(form);
    onSuccess();
    onClose();
  };
  return (
    <Modal title="Add Holiday" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="input-label">Date</label>
          <input type="date" className="input-field" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Holiday Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>
    </Modal>
  );
}

function EditHolidayModal({ holiday, onClose, onSuccess }) {
  const [form, setForm] = useState({ holiday_date: holiday.holiday_date, name: holiday.name });
  const [error, setError] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await updateHoliday(holiday.id, form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update holiday');
    }
  };
  return (
    <Modal title="Edit Holiday" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Date</label>
          <input type="date" className="input-field" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Holiday Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function AddDepartmentModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '' });
  const handleSubmit = async (e) => {
    e.preventDefault();
    await createDepartment(form);
    onSuccess();
    onClose();
  };
  return (
    <Modal title="Add Department" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="input-label">Department Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}

function AddSiteModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', country: '' });
  const handleSubmit = async (e) => {
    e.preventDefault();
    await createSite(form);
    onSuccess();
    onClose();
  };
  return (
    <Modal title="Add Site" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="input-label">Site Name</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="input-group">
          <label className="input-label">Address</label>
          <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">City</label>
          <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">State</label>
          <input className="input-field" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">Country</label>
          <input className="input-field" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}
