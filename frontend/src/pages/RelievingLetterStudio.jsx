import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getDirectory } from '../api/employees';
import { getMyCompany } from '../api/company';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.jpg';
import {
  Award,
  Calendar,
  User,
  Printer,
  ArrowLeft,
  MapPin,
  Globe,
  Mail,
  Phone,
  Sparkles,
  PenTool,
  FileText,
} from 'lucide-react';

export default function RelievingLetterStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialEmployeeId = searchParams.get('employee_id') || '';

  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeId);
  const [lastWorkingDate, setLastWorkingDate] = useState(new Date().toISOString().split('T')[0]);
  const [customParagraph, setCustomParagraph] = useState(
    'We confirm that you have successfully completed your exit formalities and that there are no dues pending against you.'
  );
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('HR Department');

  useEffect(() => {
    getMyCompany()
      .then((res) => {
        setCompany(res.data);
        if (res.data?.authorized_signatory_name) {
          setSignatoryName(res.data.authorized_signatory_name);
        } else if (user?.name || user?.full_name) {
          setSignatoryName(user.name || user.full_name);
        }
      })
      .catch(() => {});

    getDirectory()
      .then((res) => {
        const list = res.data || [];
        setEmployees(list);
        if (!selectedEmployeeId && list.length > 0) {
          setSelectedEmployeeId(list[0].id);
        }
      })
      .catch(() => {});
  }, [user]);

  const selectedEmp = employees.find((e) => String(e.id) === String(selectedEmployeeId)) || employees[0] || {
    full_name: 'Sarah Johnson',
    employee_code: 'EMP001',
    department_name: 'Engineering',
    role_name: 'Software Engineer',
    address: '185, Cape Town, South Africa',
    date_of_hire: '2023-01-15',
  };

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
    const sanitized = (selectedEmp?.full_name || 'Employee').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `Relieving_Letter_${sanitized}`;
    document.body.classList.add('printing-relieving-letter');

    const restore = () => {
      document.title = oldTitle;
      document.body.classList.remove('printing-relieving-letter');
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
          padding: '14px 22px',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          marginBottom: 20,
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
            <FileText size={20} style={{ color: '#2563eb' }} /> Relieving Letter Studio
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
              background: '#059669',
              borderColor: '#059669',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
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
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
          gap: 24,
          alignItems: 'start',
        }}
      >
        
        {/* ══ LEFT PANE: Live Real-Time A4 Document Preview ══════════════════ */}
        <div
          style={{
            background: '#f8fafc',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '20px 16px',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
            position: 'sticky',
            top: 20,
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              padding: '0 6px',
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} style={{ color: '#059669' }} /> Live A4 Document Preview
            </span>
            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, background: '#ecfdf5', padding: '2px 8px', borderRadius: 99 }}>
              ● Synchronized
            </span>
          </div>

          {/* Scaled A4 Document Container */}
          <div className="relieving-letter-container-wrap">
            <div id="relieving-letter-voucher" className="relieving-letter-voucher">
              
              <div>
                {/* 1. Corporate Header */}
                <div className="relieving-header">
                  <div className="relieving-header-left">
                    <div className="relieving-logo-card">
                      <img src={company?.logo_url || logoImg} alt="Company Logo" />
                    </div>
                    <div>
                      <div className="relieving-brand-title">HRMS Portal</div>
                      <div className="relieving-brand-company">{company?.name || 'MEAGLE360 CORP'}</div>
                    </div>
                  </div>

                  <div className="relieving-header-right">
                    <div className="relieving-contact-list">
                      <div className="relieving-contact-row">
                        <MapPin size={13} className="relieving-contact-icon" />
                        <span>{company?.address || '1 Infinite Loop, Cupertino, CA'}</span>
                      </div>
                      <div className="relieving-contact-row">
                        <Globe size={13} className="relieving-contact-icon" />
                        <span>{company?.website || 'https://about.puma.com/en'}</span>
                      </div>
                      <div className="relieving-contact-row">
                        <Mail size={13} className="relieving-contact-icon" />
                        <span>{company?.email || 'service@puma.com'}</span>
                      </div>
                      <div className="relieving-contact-row">
                        <Phone size={13} className="relieving-contact-icon" />
                        <span>{company?.phone || '+91 9845178901'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Full Width Divider */}
                <div className="relieving-header-divider"></div>

                {/* 3. Title Block */}
                <div className="relieving-title-block">
                  <div className="relieving-title-text">RELIEVING LETTER</div>
                  <div className="relieving-title-underline"></div>
                </div>

                {/* 4. Meta Block */}
                <div className="relieving-meta-block">
                  <div>{todayFormatted}</div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 6, fontSize: '1.20rem' }}>
                    {selectedEmp?.full_name || 'Employee Name'}
                  </div>
                  <div style={{ color: '#475569', whiteSpace: 'pre-line', marginTop: 2, fontSize: '1.05rem' }}>
                    {selectedEmp?.address || selectedEmp?.location || '185, Cape Town, South Africa'}
                  </div>
                </div>

                {/* 5. Centered Subject */}
                <div className="relieving-subject">Subject: Relieving Letter</div>

                {/* 6. Salutation */}
                <div className="relieving-salutation">
                  Dear {selectedEmp?.full_name || 'Employee'},
                </div>

                {/* 7. Body Paragraphs */}
                <div className="relieving-body-p">
                  This letter confirms that your resignation from the position of{' '}
                  <strong>{selectedEmp?.role_name || selectedEmp?.designation || 'Software Engineer'}</strong> at{' '}
                  <strong>{company?.name || 'Meagle360 Corp'}</strong> has been accepted. Your last working day with the organization was{' '}
                  <strong>{formatDate(lastWorkingDate) || todayFormatted}</strong>.
                </div>

                <div className="relieving-body-p">
                  You joined our organization on <strong>{formatDate(selectedEmp?.date_of_hire || selectedEmp?.created_at) || '15 January 2023'}</strong>. During your tenure with us, your performance and conduct were found to be satisfactory.
                </div>

                {customParagraph && (
                  <div className="relieving-body-p">{customParagraph}</div>
                )}

                <div className="relieving-body-p">
                  We appreciate your contributions to the company and wish you all the best in your future professional endeavors.
                </div>

                {/* 8. Authorized Signatory */}
                <div className="relieving-sign-block">
                  <div style={{ fontWeight: 600, color: '#334155' }}>Sincerely,</div>
                  {company?.signature_url ? (
                    <div style={{ margin: '8px 0 4px 0', minHeight: 65, display: 'flex', alignItems: 'center' }}>
                      <img src={company.signature_url} alt="Sign" style={{ height: 65, maxWidth: 220, width: 'auto', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ width: 190, height: 65, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 8 }}></div>
                    </div>
                  )}
                  <div className="relieving-sign-name">{signatoryName || 'Meloni'}</div>
                  <div style={{ color: '#475569', fontSize: '1.02rem' }}>{signatoryDesignation || 'HR Department'}</div>
                  <div style={{ fontWeight: 800, color: '#0052cc', fontSize: '1.05rem', marginTop: 1 }}>{company?.name || 'Meagle360 Corp'}</div>
                </div>
              </div>

              {/* 9. Bottom Dual Color Band Footer */}
              <div className="relieving-footer-wrap">
                <div className="relieving-footer-cin">
                  CIN : {company?.cin_number || company?.registration_number || 'U72900KA2020PTC134567'}
                </div>
                <div className="relieving-footer-address">
                  {company?.address ? `Regd. Office: ${company.address}` : 'Regd. Office: 1 Infinite Loop, Cupertino, CA 95014'}
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
            padding: '24px 22px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Section 1: Employee Selection */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <User size={17} style={{ color: '#059669' }} />
              Employee Selection
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Select Employee *</label>
                <select
                  className="input-field"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  required
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code}) - {emp.department_name || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEmp && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 12, borderRadius: 10, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Code:</span> <strong>{selectedEmp.employee_code}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Designation:</span> <strong>{selectedEmp.role_name || selectedEmp.designation || 'Software Engineer'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Department:</span> <strong>{selectedEmp.department_name || 'Engineering'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Hire Date:</span> <strong>{formatDate(selectedEmp.date_of_hire || selectedEmp.created_at) || '15 Jan 2023'}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Relieving Details & Key Dates */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <Calendar size={17} style={{ color: '#059669' }} />
              Relieving Dates &amp; Formalities
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Last Working / Relieving Date *</label>
                <input
                  type="date"
                  className="input-field"
                  value={lastWorkingDate}
                  onChange={(e) => setLastWorkingDate(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label className="input-label">Exit Clearance &amp; Dues Note</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={customParagraph}
                  onChange={(e) => setCustomParagraph(e.target.value)}
                  placeholder="Custom confirmation text regarding exit formalities..."
                />
              </div>
            </div>
          </div>

          {/* Section 3: Authorized Signatory */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <PenTool size={17} style={{ color: '#7c3aed' }} />
              Authorized Signatory Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Signatory Full Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Sarah Johnson"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Signatory Position / Role</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. HR Department / Director"
                  value={signatoryDesignation}
                  onChange={(e) => setSignatoryDesignation(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}