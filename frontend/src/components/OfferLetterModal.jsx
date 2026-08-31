import { useState, useEffect } from 'react';
import Modal from './Modal';
import {
  getDepartments,
  getDesignations,
  getSites,
  getDirectory,
  createOfferLetter,
  downloadOfferLetterPdf,
} from '../api/employees';
import { getMyCompany } from '../api/company';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.jpg';
import {
  FileText,
  Download,
  User,
  Briefcase,
  Calendar,
  DollarSign,
  MapPin,
  Mail,
  Printer,
  Eye,
  ArrowLeft,
  Globe,
  Phone,
  CheckCircle,
} from 'lucide-react';

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'fixed_term', label: 'Fixed-Term Contract' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Internship' },
];

const SALARY_FREQUENCIES = [
  { value: 'annual', label: 'Annual (Per Annum)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'hourly', label: 'Hourly' },
];

export default function OfferLetterModal({ onClose, onSuccess }) {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [sites, setSites] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState({
    candidate_name: '',
    candidate_address: '',
    department_id: '',
    designation_id: '',
    reporting_to_id: '',
    site_id: '',
    employment_type: 'full_time',
    start_date: '',
    end_date: '',
    salary_amount: '',
    salary_frequency: 'annual',
    bonus_details: '',
    other_benefits: '',
    acceptance_deadline: '',
    hr_contact_name: user?.name || user?.full_name || '',
    hr_contact_email: user?.email || '',
  });

  useEffect(() => {
    getMyCompany().then((res) => setCompany(res.data)).catch(() => {});
    getDepartments().then((res) => setDepartments(res.data || [])).catch(() => {});
    getDesignations().then((res) => setDesignations(res.data || [])).catch(() => {});
    getSites().then((res) => setSites(res.data || [])).catch(() => {});
    getDirectory().then((res) => setManagers(res.data || [])).catch(() => {});
  }, []);

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

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        candidate_name: form.candidate_name.trim(),
        candidate_address: form.candidate_address?.trim() || null,
        department_id: form.department_id || null,
        designation_id: form.designation_id || null,
        reporting_to_id: form.reporting_to_id || null,
        site_id: form.site_id || null,
        employment_type: form.employment_type || 'full_time',
        start_date: form.start_date,
        end_date: form.end_date || null,
        salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : null,
        salary_frequency: form.salary_frequency || null,
        bonus_details: form.bonus_details?.trim() || null,
        other_benefits: form.other_benefits?.trim() || null,
        acceptance_deadline: form.acceptance_deadline || null,
        hr_contact_name: form.hr_contact_name?.trim() || null,
        hr_contact_email: form.hr_contact_email?.trim() || null,
      };

      await createOfferLetter(payload);
      if (onSuccess) onSuccess();
      // Seamlessly show the Live A4 Preview so user can print/save exact vector PDF!
      setShowPreview(true);
    } catch (err) {
      console.error('Failed to create offer letter:', err);
      setError(err.response?.data?.detail || 'Failed to create offer letter. Please check input fields.');
    } finally {
      setLoading(false);
    }
  };

  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const candidateFirstName = form.candidate_name ? form.candidate_name.trim().split(' ')[0] : 'Candidate';

  return (
    <Modal
      title={showPreview ? "Offer Letter Preview (A4 Format)" : "Generate Candidate Offer Letter"}
      onClose={onClose}
      maxWidth={showPreview ? "860px" : "720px"}
    >
      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: '#fef2f2',
            color: '#dc2626',
            fontSize: '0.85rem',
            border: '1px solid #fecaca',
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {showPreview ? (
        /* ═══════════════════════════════════════════════════════════════
           EXACT LIVE A4 OFFER LETTER VOUCHER (MATCHING media_1788175292889.jpg)
           ═══════════════════════════════════════════════════════════════ */
        <div className="offer-letter-container-wrap">
          {/* Action Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              maxWidth: 794,
              padding: '8px 4px',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPreview(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={16} /> Edit Information
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrint}
                style={{
                  background: 'linear-gradient(135deg, #0052cc, #003d99)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
                }}
              >
                <Printer size={16} /> Print / Save as PDF
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <CheckCircle size={16} /> {loading ? 'Saving...' : 'Save & Record'}
              </button>
            </div>
          </div>

          {/* Printable Voucher */}
          <div id="offer-letter-voucher" className="offer-letter-voucher">
            <div>
              {/* 1. Top Header */}
              <div className="offer-header">
                <div className="offer-header-left">
                  <div className="offer-logo-card">
                    <img
                      src={company?.logo_url || logoImg}
                      alt="Logo"
                      onError={(e) => {
                        e.currentTarget.src = logoImg;
                      }}
                    />
                  </div>
                  <div>
                    <div className="offer-brand-title">HRMS Portal</div>
                    <div className="offer-brand-company">{company?.name || 'MEAGLE360'}</div>
                  </div>
                </div>

                <div className="offer-header-right">
                  <div className="offer-contact-list">
                    <div className="offer-contact-row">
                      <MapPin size={12} className="offer-contact-icon" />
                      <span>{company?.company_address || company?.address || '123 Business Park, Sector 62, Noida, Uttar Pradesh – 201309, INDIA'}</span>
                    </div>
                    <div className="offer-contact-row">
                      <Globe size={12} className="offer-contact-icon" />
                      <span>{company?.website || 'www.meagle360.com'}</span>
                    </div>
                    <div className="offer-contact-row">
                      <Mail size={12} className="offer-contact-icon" />
                      <span>{company?.email || 'info@meagle360.com'}</span>
                    </div>
                    <div className="offer-contact-row">
                      <Phone size={12} className="offer-contact-icon" />
                      <span>{company?.phone || '+91 12345 67890'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="offer-header-divider"></div>

              {/* 2. Document Title */}
              <div className="offer-title-block">
                <div className="offer-title-text">Offer Letter</div>
                <div className="offer-title-underline"></div>
              </div>

              {/* 3. Metadata & Sender/Recipient */}
              <div className="offer-meta-block">
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{company?.name || 'Meagle360 HRMS Pvt. Ltd.'}</div>
                <div>{company?.company_address || company?.address || '123 Business Park, Sector 62'}</div>
                <div>{company?.email || 'info@meagle360.com'} | {company?.phone || '+91 12345 67890'}</div>
                <div style={{ margin: '6px 0 10px 0' }}>{todayFormatted}</div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{form.candidate_name || '[Candidate Name]'}</div>
                {form.candidate_address && <div>{form.candidate_address}</div>}
                <div className="offer-meta-subject">
                  Subject: Job Offer for {selectedDesignation?.title || 'Selected Position'}
                </div>
              </div>

              {/* 4. Salutation & Opening Paragraph */}
              <div className="offer-salutation">Dear {candidateFirstName},</div>
              <div className="offer-body-p">
                We are pleased to offer you the position of <strong>{selectedDesignation?.title || 'Selected Position'}</strong> at <strong>{company?.name || 'MEAGLE360'}</strong>. After reviewing your qualifications and experience, we believe you will be a valuable addition to our team.
              </div>

              {/* 5. Section 1: Position Details */}
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
                    <span><strong>Job Title:</strong> {selectedDesignation?.title || 'Selected Position'}</span>
                  </div>
                  <div className="offer-bullet-item">
                    <span className="offer-bullet-star">❖</span>
                    <span><strong>Department:</strong> {selectedDepartment?.name || 'General'}</span>
                  </div>
                  <div className="offer-bullet-item">
                    <span className="offer-bullet-star">❖</span>
                    <span><strong>Reporting To:</strong> {selectedManager ? `${selectedManager.full_name}` : 'Department Manager'}</span>
                  </div>
                  <div className="offer-bullet-item">
                    <span className="offer-bullet-star">❖</span>
                    <span><strong>Start Date:</strong> {formatDate(form.start_date) || '[Start Date]'}</span>
                  </div>
                  <div className="offer-bullet-item">
                    <span className="offer-bullet-star">❖</span>
                    <span><strong>Employment Type:</strong> {form.employment_type === 'full_time' ? 'Full-Time' : (form.employment_type ? form.employment_type.replace('_', ' ').toUpperCase() : 'Full-Time')}</span>
                  </div>
                  <div className="offer-bullet-item">
                    <span className="offer-bullet-star">❖</span>
                    <span><strong>Work Location:</strong> {selectedSite ? `${selectedSite.name} (${selectedSite.city || 'Headquarters'})` : 'Office Location / Remote'}</span>
                  </div>
                </div>
              </div>

              {/* 6. Section 2: Compensation & Benefits */}
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
                      <strong>Salary:</strong> {form.salary_amount ? `₹ ${Number(form.salary_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${form.salary_frequency || 'annual'})` : 'Competitive CTC as discussed during interview'}
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

              {/* 7. Section 3: Terms & Conditions */}
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

              {/* 8. Closing Paragraphs */}
              <div className="offer-body-p" style={{ marginTop: 5 }}>
                Please sign and return a copy of this letter by <strong>{formatDate(form.acceptance_deadline) || '[Acceptance Deadline Date]'}</strong> to confirm your acceptance of the offer. If you have any questions, feel free to reach out to <strong>{form.hr_contact_name || 'HR Contact Person'}</strong> at <strong>{form.hr_contact_email || company?.email || 'info@meagle360.com'}</strong>.
              </div>

              <div className="offer-body-p">
                We are excited to have you on board and look forward to working together!
              </div>

              {/* 9. Dual Sign-off (Company Authorized Signatory on Left, Candidate Signature on Right) */}
              <div className="offer-sign-row">
                {/* Left: Authorized Signatory */}
                <div className="offer-sign-col">
                  <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Best regards,</div>
                  {company?.signature_url ? (
                    <div style={{ margin: '4px 0 2px 0', minHeight: 64, display: 'flex', alignItems: 'center' }}>
                      <img src={company.signature_url} alt="Sign" style={{ height: 64, maxWidth: 240, width: 'auto', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ width: 190, height: 64, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 5 }}></div>
                    </div>
                  )}
                  <div className="offer-sign-name">{form.hr_contact_name || company?.authorized_signatory_name || 'Authorized Signatory'}</div>
                  <div style={{ color: '#475569', fontSize: '0.90rem' }}>{selectedDesignation?.title || 'HR Department'}</div>
                  <div style={{ fontWeight: 700, color: '#0052cc', fontSize: '0.92rem' }}>{company?.name || 'MEAGLE360 CORP'}</div>
                </div>

                {/* Right: Candidate Signature & Name */}
                <div className="offer-sign-col">
                  <div style={{ fontWeight: 600, color: '#334155', marginBottom: 2 }}>Accepted &amp; Acknowledged by:</div>
                  <div style={{ width: 190, height: 64, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 5 }}></div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Signature</div>
                  <div className="offer-sign-name" style={{ marginTop: 2 }}>{form.candidate_name || '[Candidate Name]'}</div>
                  <div style={{ color: '#475569', fontSize: '0.90rem' }}>Candidate</div>
                </div>
              </div>
            </div>

            {/* 10. Bottom Solid Blue Footer */}
            <div className="offer-footer-bar">
              <div className="offer-footer-item">
                <Phone size={13} />
                <span>{company?.phone || '+91 12345 67890'}</span>
              </div>
              <div className="offer-footer-item">
                <Mail size={13} />
                <span>{company?.email || 'info@meagle360.com'}</span>
              </div>
              <div className="offer-footer-item">
                <Globe size={13} />
                <span>{company?.website || 'www.meagle360.com'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           OFFER LETTER CREATION FORM
           ═══════════════════════════════════════════════════════════════ */
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Candidate Information */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
              <User size={16} style={{ color: '#2563eb' }} />
              Candidate Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Candidate Full Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Alex Morgan"
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
                  placeholder="123 Street Name, City, State, PIN"
                  value={form.candidate_address}
                  onChange={(e) => setForm({ ...form, candidate_address: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Position & Work Location */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
              <Briefcase size={16} style={{ color: '#2563eb' }} />
              Position & Location
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
                <label className="input-label">Designation</label>
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
                <label className="input-label">Reporting Manager</label>
                <select
                  className="input-field"
                  value={form.reporting_to_id}
                  onChange={(e) => setForm({ ...form, reporting_to_id: e.target.value })}
                >
                  <option value="">Select Reporting Manager</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Work Location / Site</label>
                <select
                  className="input-field"
                  value={form.site_id}
                  onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                >
                  <option value="">Select Work Location</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city || 'Headquarters'})</option>
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
            </div>
          </div>

          {/* Dates & Compensation */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
              <DollarSign size={16} style={{ color: '#2563eb' }} />
              Dates & Compensation
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Joining / Start Date *</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">End Date (Optional / Fixed-term)</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Salary / CTC Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  placeholder="e.g. 600000"
                  value={form.salary_amount}
                  onChange={(e) => setForm({ ...form, salary_amount: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Salary Frequency</label>
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
                <label className="input-label">Acceptance Deadline</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.acceptance_deadline}
                  onChange={(e) => setForm({ ...form, acceptance_deadline: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Bonus Details</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Annual Performance Bonus up to 10%"
                  value={form.bonus_details}
                  onChange={(e) => setForm({ ...form, bonus_details: e.target.value })}
                />
              </div>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Other Benefits & Perks</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Health Insurance (₹5L), Internet Reimbursement, Gym Membership"
                  value={form.other_benefits}
                  onChange={(e) => setForm({ ...form, other_benefits: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* HR Contact */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
              <Mail size={16} style={{ color: '#2563eb' }} />
              HR Contact Person
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">HR Contact Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. HR Team / John Doe"
                  value={form.hr_contact_name}
                  onChange={(e) => setForm({ ...form, hr_contact_name: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label className="input-label">HR Contact Email</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="hr@meagle360.com"
                  value={form.hr_contact_email}
                  onChange={(e) => setForm({ ...form, hr_contact_email: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!form.candidate_name) {
                  setError('Please fill in Candidate Name before previewing.');
                  return;
                }
                setShowPreview(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderColor: '#0052cc',
                color: '#0052cc',
              }}
            >
              <Eye size={16} /> Live A4 Preview &amp; Print
            </button>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #0056d6, #0041a3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(0, 86, 214, 0.25)',
                }}
              >
                <Printer size={16} />
                {loading ? 'Saving Record...' : 'Generate & Open A4 Print'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

