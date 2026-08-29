import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Building, Shield, Calendar, ScrollText, MapPin, Wallet, Pencil, Trash2,
  Image as ImageIcon, FileSignature, UploadCloud, CheckCircle2, Building2, Phone, Mail, Globe
} from 'lucide-react';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../api/attendance';
import { getDepartments, createDepartment, getSites, createSite } from '../api/employees';
import { getAuditLogs } from '../api/audit';
import { getMyCompany, updateMyCompany, uploadCompanyBranding } from '../api/company';
import client from '../api/client';
import Modal from '../components/Modal';

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function Settings() {
  const [tab, setTab] = useState('branding');
  const [holidays, setHolidays] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sites, setSites] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [company, setCompany] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [regLimitInput, setRegLimitInput] = useState('');
  const [savingRegLimit, setSavingRegLimit] = useState(false);

  // Branding states
  const [brandingForm, setBrandingForm] = useState({
    authorized_signatory_name: '',
    phone: '',
    email: '',
    website: '',
    company_address: '',
    footer_text: '',
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSuccess, setBrandingSuccess] = useState('');

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (company) {
      setRegLimitInput(String(company.max_monthly_regularizations));
      setBrandingForm({
        authorized_signatory_name: company.authorized_signatory_name || '',
        phone: company.phone || '',
        email: company.email || '',
        website: company.website || '',
        company_address: company.company_address || '',
        footer_text: company.footer_text || '',
      });
    }
  }, [company]);

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

  const handleSaveRegLimit = async () => {
    const value = Number(regLimitInput);
    if (!Number.isInteger(value) || value < 0) {
      alert('Please enter a whole number of 0 or more');
      return;
    }
    setSavingRegLimit(true);
    try {
      const res = await updateMyCompany({ max_monthly_regularizations: value });
      setCompany(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update regularization limit');
    } finally {
      setSavingRegLimit(false);
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

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setBrandingSuccess('');
    try {
      const res = await uploadCompanyBranding(file, 'logo');
      setCompany(res.data);
      setBrandingSuccess('Company logo uploaded to Cloudinary successfully!');
      setTimeout(() => setBrandingSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload company logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSignature(true);
    setBrandingSuccess('');
    try {
      const res = await uploadCompanyBranding(file, 'signature');
      setCompany(res.data);
      setBrandingSuccess('Authorized signature uploaded to Cloudinary successfully!');
      setTimeout(() => setBrandingSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload authorized signature');
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleSaveBrandingDetails = async (e) => {
    e.preventDefault();
    setSavingBranding(true);
    setBrandingSuccess('');
    try {
      const res = await updateMyCompany(brandingForm);
      setCompany(res.data);
      setBrandingSuccess('Company branding details saved successfully!');
      setTimeout(() => setBrandingSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update branding details');
    } finally {
      setSavingBranding(false);
    }
  };

  const tabs = [
    { id: 'branding', label: 'Company Branding', icon: ImageIcon },
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
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Configure company branding, policies, holiday calendars, work sites &amp; system audit logs</p>
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

      {/* Branding Tab */}
      {tab === 'branding' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {brandingSuccess && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                padding: '12px 18px',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              <CheckCircle2 size={18} style={{ color: '#059669' }} />
              <span>{brandingSuccess}</span>
            </div>
          )}

          {/* Top 2 Cards: Logo & Signature Uploads */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Card 1: Company Logo */}
            <div className="section-card" style={{ borderTop: '3px solid #2563eb', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px 0' }}>
                  <ImageIcon size={18} style={{ color: '#2563eb' }} /> Company Logo
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0 0 16px 0' }}>
                  Uploaded logo will appear on all employee payslips, offer letters, and system headers.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 90,
                      height: 90,
                      borderRadius: 12,
                      border: '1.5px dashed #cbd5e1',
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {company?.logo_url ? (
                      <img src={company.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Building2 size={36} style={{ color: '#94a3b8' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                      {company?.logo_url ? 'Active Logo' : 'No Logo Uploaded'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      PNG, JPG or SVG (Max 5MB)
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 10,
                    background: uploadingLogo ? '#94a3b8' : '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: uploadingLogo ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)',
                  }}
                >
                  <UploadCloud size={16} />
                  <span>{uploadingLogo ? 'Uploading to Cloudinary...' : 'Choose & Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Card 2: Authorized Signature */}
            <div className="section-card" style={{ borderTop: '3px solid #0056d6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px 0' }}>
                  <FileSignature size={18} style={{ color: '#0056d6' }} /> Authorized Signature
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0 0 16px 0' }}>
                  Official digital signature used for salary slip approval and legal letters.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 140,
                      height: 90,
                      borderRadius: 12,
                      border: '1.5px dashed #cbd5e1',
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {company?.signature_url ? (
                      <img src={company.signature_url} alt="Signature" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No Signature</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                      {company?.signature_url ? 'Active Signature' : 'No Signature Uploaded'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      Transparent PNG recommended (Max 5MB)
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 10,
                    background: uploadingSignature ? '#94a3b8' : '#0056d6',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: uploadingSignature ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(0, 86, 214, 0.2)',
                  }}
                >
                  <UploadCloud size={16} />
                  <span>{uploadingSignature ? 'Uploading to Cloudinary...' : 'Choose & Upload Signature'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    disabled={uploadingSignature}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Card 3: Signatory & Corporate Details Form */}
          <div className="section-card" style={{ borderTop: '3px solid #10b981' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              Signatory &amp; Document Footer Information
            </h3>
            <form onSubmit={handleSaveBrandingDetails} style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Authorized Signatory Name / Title</label>
                  <input
                    className="input-field"
                    placeholder="e.g. Rahul Sharma (HR Department)"
                    value={brandingForm.authorized_signatory_name}
                    onChange={(e) => setBrandingForm({ ...brandingForm, authorized_signatory_name: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Official Phone Number</label>
                  <input
                    className="input-field"
                    placeholder="e.g. +91 98765 43210"
                    value={brandingForm.phone}
                    onChange={(e) => setBrandingForm({ ...brandingForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Official Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="e.g. hr@company.com"
                    value={brandingForm.email}
                    onChange={(e) => setBrandingForm({ ...brandingForm, email: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Official Website</label>
                  <input
                    className="input-field"
                    placeholder="e.g. www.company.com"
                    value={brandingForm.website}
                    onChange={(e) => setBrandingForm({ ...brandingForm, website: e.target.value })}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Company Official Address</label>
                <input
                  className="input-field"
                  placeholder="e.g. Plot 45, Sector 62, Noida, UP - 201301"
                  value={brandingForm.company_address}
                  onChange={(e) => setBrandingForm({ ...brandingForm, company_address: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Payslip Footer Note / Disclaimer</label>
                <input
                  className="input-field"
                  placeholder="e.g. This is a computer-generated salary slip. We appreciate your hard work."
                  value={brandingForm.footer_text}
                  onChange={(e) => setBrandingForm({ ...brandingForm, footer_text: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={savingBranding}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: savingBranding ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  {savingBranding ? 'Saving Details...' : 'Save Branding Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        <div style={{ display: 'grid', gap: 20 }}>
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

          <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
            <h3 style={{ marginBottom: 8 }}><Calendar size={18} style={{ color: 'var(--accent-amber)' }} /> Monthly Regularization Limit</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Maximum number of attendance regularization requests (pending + approved) an employee can submit per calendar month.
            </p>
            {company && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  style={{ maxWidth: 120 }}
                  value={regLimitInput}
                  onChange={(e) => setRegLimitInput(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveRegLimit}
                  disabled={savingRegLimit || Number(regLimitInput) === company.max_monthly_regularizations}
                >
                  {savingRegLimit ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
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
