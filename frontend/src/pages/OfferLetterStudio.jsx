import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getDepartments,
  getDesignations,
  getSites,
  getDirectory,
} from '../api/employees';
import { getMyCompany } from '../api/company';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.jpg';
import {
  FileText,
  User,
  Briefcase,
  DollarSign,
  MapPin,
  Mail,
  Printer,
  ArrowLeft,
  Globe,
  Phone,
  Sparkles,
  PenTool,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'fixed_term', label: 'Fixed-Term Contract' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Internship' },
];

const SALARY_FREQUENCIES = [
  { value: 'annual', label: 'annual' },
  { value: 'monthly', label: 'monthly' },
  { value: 'hourly', label: 'hourly' },
];

export default function OfferLetterStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [sites, setSites] = useState([]);
  const [managers, setManagers] = useState([]);
  const [previewZoom, setPreviewZoom] = useState(0.58);

  const [form, setForm] = useState({
    candidate_name: 'gigilia',
    candidate_address: 'Sanya Balay 76/34 Bdd Chawl, Nr. Doordarshan, Worli Mumbai Maharashtra 400018 India',
    department_id: '',
    designation_id: '',
    reporting_to_id: '',
    site_id: '',
    employment_type: 'full_time',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    salary_amount: '4999999.71',
    salary_frequency: 'annual',
    bonus_details: 'Performance-linked bonus as per company policy',
    other_benefits: 'Health Insurance, Paid Leaves, and other standard company perks.',
    acceptance_deadline: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    hr_contact_name: user?.name || user?.full_name || 'Sarah Johnson',
    hr_contact_email: user?.email || 'sarah@meagle360.com',
  });

  useEffect(() => {
    getMyCompany().then((res) => {
      setCompany(res.data);
      if (res.data?.authorized_signatory_name) {
        setForm((prev) => ({ ...prev, hr_contact_name: res.data.authorized_signatory_name }));
      }
    }).catch(() => {});

    getDepartments().then((res) => {
      const depts = res.data || [];
      setDepartments(depts);
      if (depts.length > 0) setForm((prev) => ({ ...prev, department_id: prev.department_id || depts[0].id }));
    }).catch(() => {});

    getDesignations().then((res) => {
      const desigs = res.data || [];
      setDesignations(desigs);
      if (desigs.length > 0) setForm((prev) => ({ ...prev, designation_id: prev.designation_id || desigs[0].id }));
    }).catch(() => {});

    getSites().then((res) => {
      const st = res.data || [];
      setSites(st);
      if (st.length > 0) setForm((prev) => ({ ...prev, site_id: prev.site_id || st[0].id }));
    }).catch(() => {});

    getDirectory().then((res) => setManagers(res.data || [])).catch(() => {});
  }, [user]);

  const selectedDepartment = departments.find((d) => d.id === form.department_id);
  const selectedDesignation = designations.find((d) => d.id === form.designation_id);
  const selectedManager = managers.find((m) => m.id === form.reporting_to_id);
  const selectedSite = sites.find((s) => s.id === form.site_id);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handlePrint = () => {
    const oldTitle = document.title;
    const sanitized = (form.candidate_name || 'Candidate').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `Offer_Letter_${sanitized}`;
    document.body.classList.add('printing-offer-letter');

    const restore = () => {
      document.title = oldTitle;
      document.body.classList.remove('printing-offer-letter');
      window.removeEventListener('afterprint', restore);
    };

    window.addEventListener('afterprint', restore);
    setTimeout(() => {
      window.print();
      setTimeout(restore, 1500);
    }, 150);
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: 40 }}>
      
      {/* ── Top Studio Action Bar ────────────────────────────────────────── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          background: '#ffffff',
          padding: '12px 20px',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          marginBottom: 18,
        }}
      >
        <div>
          {/* Breadcrumb Back Link */}
          <Link
            to="/employees"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#64748b',
              marginBottom: 4,
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <ArrowLeft size={13} /> Back to Directory
          </Link>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} style={{ color: '#2563eb' }} /> Offer Letter Studio
          </h1>
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
            Real-time split-screen editor • Instant single-page live preview
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePrint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 20px',
              fontSize: '0.875rem',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Printer size={17} /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* ── 2-Column Split Screen Studio ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(480px, 1fr) minmax(400px, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}
      >
        
        {/* ══ LEFT PANE: Complete Single-Page A4 Document Live Preview ══════ */}
        <div
          style={{
            background: '#f1f5f9',
            borderRadius: 16,
            border: '1px solid #cbd5e1',
            padding: '14px 12px',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
            position: 'sticky',
            top: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Preview Toolbar with Zoom Controls */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              marginBottom: 10,
              padding: '0 4px',
            }}
          >
            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} style={{ color: '#2563eb' }} /> Live A4 Document Preview
            </span>

            {/* Interactive Zoom Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '3px 8px', borderRadius: 8, border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.max(0.42, Number((z - 0.05).toFixed(2))))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'flex', color: '#475569' }}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a', minWidth: 34, textAlign: 'center' }}>
                {Math.round(previewZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.min(1.0, Number((z + 0.05).toFixed(2))))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'flex', color: '#475569' }}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewZoom(0.58)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  marginLeft: 4,
                }}
                title="Fit to Page"
              >
                <Maximize2 size={10} /> Fit
              </button>
            </div>
          </div>

          {/* Scaled A4 Single-View Canvas Box */}
          <div
            className="offer-preview-scale-box"
            style={{
              width: '100%',
              height: `${Math.round(1120 * previewZoom + 8)}px`,
              display: 'flex',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <div
              className="offer-preview-transform-wrapper"
              style={{
                transform: `scale(${previewZoom})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out',
                width: 794,
                height: 1120,
              }}
            >
              {/* ══════════ EXACT A4 VOUCHER MATCHING offer_letter_gigilia ══════════ */}
              <div id="offer-letter-voucher" className="offer-letter-voucher">
                <div className="offer-content-body">
                  
                  {/* 1. Header with Logo, Title & Address Block */}
                  <div className="offer-header">
                    <div className="offer-header-left">
                      <div className="offer-logo-card">
                        <img src={company?.logo_url || logoImg} alt="Company Logo" />
                      </div>
                      <div>
                        <div className="offer-brand-title">HRMS Portal</div>
                        <div className="offer-brand-company">{company?.name || 'MEAGLE360 CORP'}</div>
                      </div>
                    </div>

                    <div className="offer-header-right">
                      <div className="offer-contact-list">
                        <div className="offer-contact-row">
                          <MapPin size={12} className="offer-contact-icon" />
                          <span>{selectedSite?.name ? `${selectedSite.name}, ${selectedSite.city || ''}` : (company?.address || '1 Infinite Loop, Cupertino, CA')}</span>
                        </div>
                        <div className="offer-contact-row">
                          <Globe size={12} className="offer-contact-icon" />
                          <span>{company?.website || 'https://about.puma.com/en'}</span>
                        </div>
                        <div className="offer-contact-row">
                          <Mail size={12} className="offer-contact-icon" />
                          <span>{company?.email || 'service@puma.com'}</span>
                        </div>
                        <div className="offer-contact-row">
                          <Phone size={12} className="offer-contact-icon" />
                          <span>{company?.phone || '+91 9845178901'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Divider Bar */}
                  <div className="offer-header-divider"></div>

                  {/* 3. Centered Title */}
                  <div className="offer-title-block">
                    <div className="offer-title-text">OFFER LETTER</div>
                  </div>

                  {/* 4. Company Info (Left) & Date (Right) Row */}
                  <div className="offer-company-date-row">
                    <div className="offer-company-info">
                      <div className="offer-company-name">{company?.name || 'Meagle360 Corp'}</div>
                      <div>{selectedSite?.name ? `${selectedSite.name}, ${selectedSite.city || ''}` : (company?.address || '1 Infinite Loop, Cupertino, CA')}</div>
                      <div>{(company?.email || 'service@puma.com')} | {(company?.phone || '+91 9845178901')}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      {todayFormatted}
                    </div>
                  </div>

                  {/* 5. Candidate Name, Address & Subject Block */}
                  <div className="offer-meta-block">
                    <div className="offer-meta-candidate-name">{form.candidate_name || 'gigilia'}</div>
                    {form.candidate_address && (
                      <div style={{ color: '#334155', whiteSpace: 'pre-line', marginTop: 1 }}>
                        {form.candidate_address}
                      </div>
                    )}
                    <div className="offer-meta-subject">Subject: Job Offer for {selectedDesignation?.title || 'Software Engineer'}</div>
                  </div>

                  <div className="offer-salutation">Dear {form.candidate_name || 'Candidate'},</div>

                  {/* 6. Intro Paragraph */}
                  <div className="offer-body-p">
                    We are pleased to offer you the position of <strong>{selectedDesignation?.title || 'Software Engineer'}</strong> at <strong>{company?.name || 'Meagle360 Corp'}</strong>. After reviewing your qualifications and experience, we believe you will be a valuable addition to our team.
                  </div>

                  {/* 7. Section 1: Position Details */}
                  <div className="offer-sec-container">
                    <div className="offer-sec-header">
                      <div className="offer-sec-badge">
                        <Briefcase size={12} />
                      </div>
                      <span>Position Details:</span>
                    </div>
                    <div className="offer-bullet-list">
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span><strong>Job Title:</strong> {selectedDesignation?.title || 'Software Engineer'}</span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span><strong>Department:</strong> {selectedDepartment?.name || 'Frontend'}</span>
                      </div>
                      {selectedManager && (
                        <div className="offer-bullet-item">
                          <span className="offer-bullet-star">❖</span>
                          <span><strong>Reporting To:</strong> {selectedManager.full_name}</span>
                        </div>
                      )}
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span><strong>Start Date:</strong> {formatDate(form.start_date) || todayFormatted}</span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span><strong>Employment Type:</strong> {EMPLOYMENT_TYPES.find((t) => t.value === form.employment_type)?.label || 'Full-Time'}</span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span><strong>Work Location:</strong> {selectedSite?.name ? `${selectedSite.name} (${selectedSite.city || ''})` : 'Bangalore HQ (Bangalore)'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 8. Section 2: Compensation & Benefits */}
                  <div className="offer-sec-container">
                    <div className="offer-sec-header">
                      <div className="offer-sec-badge">
                        <DollarSign size={12} />
                      </div>
                      <span>Compensation &amp; Benefits:</span>
                    </div>
                    <div className="offer-bullet-list">
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span>
                          <strong>Salary:</strong> {form.salary_amount ? `₹ ${Number(form.salary_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${form.salary_frequency || 'annual'})` : '₹ 49,99,999.71 (annual)'}
                        </span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span>
                          <strong>Bonus/Incentives (if applicable):</strong> {form.bonus_details || 'Performance-linked bonus as per company policy'}
                        </span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span>
                          <strong>Other Benefits:</strong> {form.other_benefits || 'Health Insurance, Paid Leaves, and other standard company perks.'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 9. Section 3: Terms & Conditions */}
                  <div className="offer-sec-container">
                    <div className="offer-sec-header">
                      <div className="offer-sec-badge">
                        <FileText size={12} />
                      </div>
                      <span>Terms &amp; Conditions:</span>
                    </div>
                    <div className="offer-bullet-list">
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span>Your employment will be subject to the terms outlined in the company's policies.</span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span>You may be required to sign a confidentiality agreement and/or a non-compete clause.</span>
                      </div>
                      <div className="offer-bullet-item">
                        <span className="offer-bullet-star">❖</span>
                        <span>The employment is {form.employment_type !== 'fixed_term' ? 'at-will' : 'fixed-term'}, and either party may terminate the agreement as per company policies.</span>
                      </div>
                    </div>
                  </div>

                  {/* 10. Closing Paragraphs */}
                  <div className="offer-body-p" style={{ marginTop: 4 }}>
                    Please sign and return a copy of this letter by <strong>{formatDate(form.acceptance_deadline) || '30 September 2026'}</strong> to confirm your acceptance of the offer. If you have any questions, feel free to reach out to <strong>{form.hr_contact_name || 'Sarah Johnson'}</strong> at <strong>{form.hr_contact_email || company?.email || 'sarah@meagle360.com'}</strong>.
                  </div>

                  <div className="offer-body-p" style={{ marginBottom: 6 }}>
                    We are excited to have you on board and look forward to working together!
                  </div>

                  {/* 11. Dual Signatures (Exact Match) */}
                  <div className="offer-sign-row">
                    <div className="offer-sign-col">
                      <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Best regards,</div>
                      {company?.signature_url ? (
                        <div style={{ margin: '3px 0 2px 0', minHeight: 48, display: 'flex', alignItems: 'center' }}>
                          <img src={company.signature_url} alt="Sign" style={{ height: 48, maxWidth: 190, width: 'auto', objectFit: 'contain' }} />
                        </div>
                      ) : (
                        <div style={{ width: 170, height: 48, display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 4 }}></div>
                        </div>
                      )}
                      <div className="offer-sign-name">{form.hr_contact_name || company?.authorized_signatory_name || 'Sarah Johnson'}</div>
                      <div style={{ color: '#475569', fontSize: '0.85rem' }}>{selectedDesignation?.title || 'Software Engineer'}</div>
                      <div style={{ fontWeight: 700, color: '#0052cc', fontSize: '0.88rem' }}>{company?.name || 'Meagle360 Corp'}</div>
                    </div>

                    <div className="offer-sign-col">
                      <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Accepted &amp; Acknowledged by:</div>
                      <div style={{ width: 170, height: 48, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 4 }}></div>
                      </div>
                      <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>SIGNATURE</div>
                      <div className="offer-sign-name" style={{ marginTop: 1 }}>{form.candidate_name || 'gigilia'}</div>
                      <div style={{ color: '#475569', fontSize: '0.85rem' }}>Candidate</div>
                    </div>
                  </div>
                </div>

                {/* 12. Bottom Corporate Blue Footer */}
                <div className="offer-footer-bar">
                  <div className="offer-footer-item">
                    <Phone size={12} />
                    <span>{company?.phone || '+91 9845178901'}</span>
                  </div>
                  <div className="offer-footer-item">
                    <Mail size={12} />
                    <span>{company?.email || 'service@puma.com'}</span>
                  </div>
                  <div className="offer-footer-item">
                    <Globe size={12} />
                    <span>{company?.website || 'https://about.puma.com/en'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT PANE: Interactive Input Form ═════════════════════════════ */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '22px 20px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Section 1: Candidate Details */}
          <div style={{ background: '#f8fafc', padding: 15, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.90rem', color: '#0f172a', marginBottom: 12 }}>
              <User size={16} style={{ color: '#2563eb' }} />
              Candidate Information
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Candidate Full Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. gigilia"
                  value={form.candidate_name}
                  onChange={(e) => setForm({ ...form, candidate_name: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Candidate Address</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Street Name, City, State, PIN"
                  value={form.candidate_address}
                  onChange={(e) => setForm({ ...form, candidate_address: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Position & Work Location */}
          <div style={{ background: '#f8fafc', padding: 15, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.90rem', color: '#0f172a', marginBottom: 12 }}>
              <Briefcase size={16} style={{ color: '#2563eb' }} />
              Position &amp; Work Location
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Department</label>
                <select
                  className="input-field"
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Designation / Title</label>
                <select
                  className="input-field"
                  value={form.designation_id}
                  onChange={(e) => setForm({ ...form, designation_id: e.target.value })}
                >
                  <option value="">Select Designation</option>
                  {designations.map((des) => (
                    <option key={des.id} value={des.id}>{des.title}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Employment Type</label>
                <select
                  className="input-field"
                  value={form.employment_type}
                  onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Work Site / Branch</label>
                <select
                  className="input-field"
                  value={form.site_id}
                  onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                >
                  <option value="">Main Office</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                  ))}
                </select>
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Reporting Manager</label>
                <select
                  className="input-field"
                  value={form.reporting_to_id}
                  onChange={(e) => setForm({ ...form, reporting_to_id: e.target.value })}
                >
                  <option value="">None / Self-Reporting</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name} ({m.department_name || 'Management'})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Compensation & Key Dates */}
          <div style={{ background: '#f8fafc', padding: 15, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.90rem', color: '#0f172a', marginBottom: 12 }}>
              <DollarSign size={16} style={{ color: '#059669' }} />
              Compensation &amp; Dates
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Salary / Compensation (₹)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="e.g. 4999999.71"
                  value={form.salary_amount}
                  onChange={(e) => setForm({ ...form, salary_amount: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Frequency</label>
                <select
                  className="input-field"
                  value={form.salary_frequency}
                  onChange={(e) => setForm({ ...form, salary_frequency: e.target.value })}
                >
                  {SALARY_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Joining Start Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Acceptance Deadline</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.acceptance_deadline}
                  onChange={(e) => setForm({ ...form, acceptance_deadline: e.target.value })}
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Bonus / Incentives</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Performance-linked bonus as per company policy"
                  value={form.bonus_details}
                  onChange={(e) => setForm({ ...form, bonus_details: e.target.value })}
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Other Perks &amp; Benefits</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Health Insurance, Paid Leaves, and other standard company perks."
                  value={form.other_benefits}
                  onChange={(e) => setForm({ ...form, other_benefits: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Authorized Signatory */}
          <div style={{ background: '#f8fafc', padding: 15, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.90rem', color: '#0f172a', marginBottom: 12 }}>
              <PenTool size={16} style={{ color: '#7c3aed' }} />
              Signatory Formalities
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Authorized Signatory Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Signatory Name"
                  value={form.hr_contact_name}
                  onChange={(e) => setForm({ ...form, hr_contact_name: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Signatory / HR Email</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="sarah@meagle360.com"
                  value={form.hr_contact_email}
                  onChange={(e) => setForm({ ...form, hr_contact_email: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}