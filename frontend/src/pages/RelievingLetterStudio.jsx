import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getDirectory } from '../api/employees';
import { getMyCompany } from '../api/company';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.jpg';
import {
  FileText,
  User,
  Calendar,
  PenTool,
  Printer,
  ArrowLeft,
  MapPin,
  Globe,
  Mail,
  Phone,
  Sparkles,
  Building2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  Search,
  Check,
} from 'lucide-react';

export default function RelievingLetterStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialEmployeeId = searchParams.get('employee_id') || '';

  // ── Company & Directory State ──────────────────────────────────────────────
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeId);

  // ── Custom Dropdown State ──────────────────────────────────────────────────
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // ── Zoom / Scale State ─────────────────────────────────────────────────────
  const [zoomLevel, setZoomLevel] = useState(0.58);

  // ── Form State (Two-Way Live Binding) ──────────────────────────────────────
  const [formData, setFormData] = useState({
    letterDate: new Date().toISOString().split('T')[0],
    candidateName: 'Site Test',
    candidateAddress: '185, cape town, south africa',
    subject: 'Subject: Relieving Letter',
    joiningDate: '2026-07-18',
    lastWorkingDate: '2026-08-31',
    exitClearanceNote: 'We confirm that you have successfully completed your exit formalities and that there are no dues pending against you.',
    signatoryName: 'Meloni',
    signatoryRole: 'HR Department',
    signatoryPhone: '+91 9845178901',
    signatoryEmail: 'service@puma.com',
    companyName: 'Meagle360 Corp',
    companyAddress: '1 Infinite Loop, Cupertino, CA',
    companyWebsite: 'https://about.puma.com/en',
    companyEmail: 'service@puma.com',
    companyPhone: '+91 9845178901',
    cinNumber: 'U74899DL2000PLC103438',
    registeredAddress: '1 Infinite Loop, Cupertino, CA',
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    getMyCompany()
      .then((res) => {
        const c = res.data;
        setCompany(c);
        if (c) {
          setFormData((prev) => ({
            ...prev,
            companyName: c.name || prev.companyName,
            companyAddress: c.address || prev.companyAddress,
            companyWebsite: c.website || prev.companyWebsite,
            companyEmail: c.email || prev.companyEmail,
            companyPhone: c.phone || prev.companyPhone,
            cinNumber: c.cin_number || c.registration_number || prev.cinNumber,
            registeredAddress: c.address || prev.registeredAddress,
            signatoryName: c.authorized_signatory_name || user?.name || user?.full_name || prev.signatoryName,
            signatoryEmail: c.email || prev.signatoryEmail,
            signatoryPhone: c.phone || prev.signatoryPhone,
          }));
        }
      })
      .catch(() => {});

    getDirectory()
      .then((res) => {
        const list = res.data || [];
        setEmployees(list);
        if (list.length > 0) {
          const matched = list.find((e) => String(e.id) === String(initialEmployeeId)) || list[0];
          setSelectedEmployeeId(matched.id);
          applyEmployeeData(matched);
        }
      })
      .catch(() => {});
  }, [initialEmployeeId]);

  const applyEmployeeData = (emp) => {
    if (!emp) return;
    setFormData((prev) => ({
      ...prev,
      candidateName: emp.full_name || prev.candidateName,
      candidateAddress: emp.address || emp.location || '185, cape town, south africa',
      joiningDate: emp.date_of_hire ? emp.date_of_hire.split('T')[0] : prev.joiningDate,
    }));
  };

  const handleEmployeeChange = (e) => {
    const empId = e.target.value;
    setSelectedEmployeeId(empId);
    const emp = employees.find((item) => String(item.id) === String(empId));
    if (emp) applyEmployeeData(emp);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => {
    const oldTitle = document.title;
    const sanitized = (formData.candidateName || 'Employee').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
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
              background: '#2563eb',
              borderColor: '#2563eb',
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
            padding: '16px 14px',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
            position: 'sticky',
            top: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              padding: '0 4px',
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} style={{ color: '#2563eb' }} /> Live A4 Document Preview
            </span>
            
            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff', padding: '4px 8px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(0.42, Number((prev - 0.05).toFixed(2))))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: '#475569' }}
                title="Zoom Out"
              >
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155', minWidth: 38, textAlign: 'center' }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(1.0, Number((prev + 0.05).toFixed(2))))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: '#475569' }}
                title="Zoom In"
              >
                <ZoomIn size={13} />
              </button>
              <div style={{ width: 1, height: 12, background: '#cbd5e1', margin: '0 2px' }} />
              <button
                type="button"
                onClick={() => setZoomLevel(0.58)}
                title="Fit to Single View"
                style={{
                  background: zoomLevel === 0.58 ? '#eff6ff' : 'none',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: '2px 5px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  color: zoomLevel === 0.58 ? '#2563eb' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Maximize2 size={12} /> Fit
              </button>
            </div>
          </div>

          {/* Scaled A4 Document Container */}
          <div className="relieving-letter-container-wrap">
            <div
              className="relieving-preview-scale-box"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                minHeight: 660,
                height: 660,
                overflow: 'hidden',
              }}
            >
              <div
                className="relieving-preview-transform-wrapper"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div id="relieving-letter-voucher" className="relieving-letter-voucher">
                  
                  {/* ── Document Body Content ── */}
                  <div className="relieving-content-body">
                    
                    {/* 1. Header with Logo, Title & Contact Meta */}
                    <div className="relieving-header">
                      <div className="relieving-header-left">
                        <div className="relieving-logo-card">
                          <img src={company?.logo_url || logoImg} alt="Company Logo" />
                        </div>
                        <div>
                          <div className="relieving-brand-title">HRMS Portal</div>
                          <div className="relieving-brand-company">{formData.companyName || 'MEAGLE360 CORP'}</div>
                        </div>
                      </div>

                      <div className="relieving-header-right">
                        <div className="relieving-contact-list">
                          <div className="relieving-contact-row">
                            <MapPin size={13} className="relieving-contact-icon" />
                            <span>{formData.companyAddress || '1 Infinite Loop, Cupertino, CA'}</span>
                          </div>
                          <div className="relieving-contact-row">
                            <Globe size={13} className="relieving-contact-icon" />
                            <span>{formData.companyWebsite || 'https://about.puma.com/en'}</span>
                          </div>
                          <div className="relieving-contact-row">
                            <Mail size={13} className="relieving-contact-icon" />
                            <span>{formData.companyEmail || 'service@puma.com'}</span>
                          </div>
                          <div className="relieving-contact-row">
                            <Phone size={13} className="relieving-contact-icon" />
                            <span>{formData.companyPhone || '+91 9845178901'}</span>
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

                    {/* 4. Date & Candidate Info */}
                    <div className="relieving-meta-block">
                      <div>{formatDate(formData.letterDate) || '31 August 2026'}</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 8, fontSize: '1.28rem' }}>
                        {formData.candidateName || 'Site Test'}
                      </div>
                      <div style={{ color: '#334155', whiteSpace: 'pre-line', marginTop: 2, fontSize: '1.08rem', lineHeight: 1.5 }}>
                        {formData.candidateAddress || '185, cape town, south africa'}
                      </div>
                    </div>

                    {/* 5. Centered Subject */}
                    <div className="relieving-subject">
                      {formData.subject || 'Subject: Relieving Letter'}
                    </div>

                    {/* 6. Salutation */}
                    <div className="relieving-salutation">
                      Dear {formData.candidateName || 'Site Test'},
                    </div>

                    {/* 7. Body Paragraphs */}
                    <div className="relieving-body-p">
                      We are writing to confirm that <strong>{formData.candidateName || 'Site Test'}</strong>, employed with <strong>{formData.companyName || 'Meagle360 Corp'}</strong> since <strong>{formatDate(formData.joiningDate) || '18 July 2026'}</strong>, has been relieved from their duties effective <strong>{formatDate(formData.lastWorkingDate) || '31 August 2026'}</strong>.
                    </div>

                    <div className="relieving-body-p">
                      During their tenure with us, <strong>{formData.candidateName || 'Site Test'}</strong> performed their duties diligently and responsibly. We appreciate their contributions to the company and wish them all the best in their future endeavors.
                    </div>

                    {formData.exitClearanceNote && (
                      <div className="relieving-body-p">
                        {formData.exitClearanceNote}
                      </div>
                    )}

                    <div className="relieving-body-p">
                      Please feel free to contact us at <strong>{formData.signatoryPhone || formData.companyPhone || '+91 9845178901'}</strong> or <strong>{formData.signatoryEmail || formData.companyEmail || 'service@puma.com'}</strong> if you require any further information.
                    </div>

                    <div className="relieving-body-p">
                      Thank you for your cooperation.
                    </div>

                    {/* 8. Authorized Signatory Block */}
                    <div className="relieving-sign-block">
                      <div style={{ fontWeight: 600, color: '#334155' }}>Sincerely,</div>
                      {company?.signature_url ? (
                        <div style={{ margin: '8px 0 3px 0', minHeight: 52, display: 'flex', alignItems: 'center' }}>
                          <img src={company.signature_url} alt="Sign" style={{ height: 52, maxWidth: 180, width: 'auto', objectFit: 'contain' }} />
                        </div>
                      ) : (
                        <div style={{ width: 180, height: 52, display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 4 }}></div>
                        </div>
                      )}
                      <div className="relieving-sign-name">{formData.signatoryName || 'Meloni'}</div>
                      <div style={{ color: '#475569', fontSize: '1.08rem' }}>{formData.signatoryRole || 'HR Department'}</div>
                      <div style={{ color: '#475569', fontSize: '1.08rem' }}>{formData.signatoryPhone || formData.companyPhone || '+91 9845178901'}</div>
                      <div style={{ color: '#475569', fontSize: '1.08rem' }}>{formData.signatoryEmail || formData.companyEmail || 'service@puma.com'}</div>
                      <div style={{ fontWeight: 800, color: '#0052cc', fontSize: '1.14rem', marginTop: 1 }}>{formData.companyName || 'Meagle360 Corp'}</div>
                    </div>
                  </div>

                  {/* 9. Pinned Dual Color Band Footer */}
                  <div className="relieving-footer-wrap">
                    <div className="relieving-footer-cin">
                      CIN NO: {formData.cinNumber || 'U74899DL2000PLC103438'}
                    </div>
                    <div className="relieving-footer-address">
                      Registered Address: {formData.registeredAddress || '1 Infinite Loop, Cupertino, CA'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT PANE: Interactive Real-Time Input Form ═══════════════════ */}
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
          {/* Section 1: Employee Selection & Information */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <User size={17} style={{ color: '#2563eb' }} />
              Employee Information
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {/* Custom Searchable Employee Dropdown */}
              <div className="input-group" style={{ position: 'relative' }} ref={dropdownRef}>
                <label className="input-label">Auto-Fill from Employee Directory</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(!isDropdownOpen);
                    setSearchTerm('');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#ffffff',
                    border: isDropdownOpen ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    boxShadow: isDropdownOpen ? '0 0 0 3px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                  }}
                >
                  {(() => {
                    const matched = employees.find((item) => String(item.id) === String(selectedEmployeeId));
                    if (matched) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: '50%',
                              background: '#eff6ff',
                              color: '#2563eb',
                              fontWeight: 800,
                              fontSize: '0.74rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              border: '1px solid #bfdbfe',
                            }}
                          >
                            {matched.full_name?.charAt(0)?.toUpperCase() || 'E'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.86rem' }}>
                              {matched.full_name}
                            </span>
                            <span
                              style={{
                                fontSize: '0.70rem',
                                fontWeight: 700,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '1px 5px',
                                borderRadius: 4,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {matched.employee_code}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              • {matched.department_name || 'General'}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return <span style={{ color: '#94a3b8', fontSize: '0.86rem' }}>-- Choose Employee to Auto-Fill --</span>;
                  })()}
                  <ChevronDown
                    size={16}
                    style={{
                      color: '#64748b',
                      transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  />
                </button>

                {isDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Search Bar */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder="Search employee by name, code, dept..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          width: '100%',
                          fontSize: '0.80rem',
                          color: '#0f172a',
                        }}
                      />
                    </div>

                    {/* Scrollable list */}
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {employees
                        .filter((emp) => {
                          const q = searchTerm.toLowerCase();
                          return (
                            emp.full_name?.toLowerCase().includes(q) ||
                            emp.employee_code?.toLowerCase().includes(q) ||
                            emp.department_name?.toLowerCase().includes(q)
                          );
                        })
                        .map((emp) => {
                          const isSelected = String(emp.id) === String(selectedEmployeeId);
                          return (
                            <div
                              key={emp.id}
                              onClick={() => {
                                setSelectedEmployeeId(emp.id);
                                applyEmployeeData(emp);
                                setIsDropdownOpen(false);
                              }}
                              style={{
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                background: isSelected ? '#eff6ff' : '#ffffff',
                                borderBottom: '1px solid #f8fafc',
                                transition: 'background 0.1s ease',
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = '#ffffff';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: isSelected ? '#2563eb' : '#f1f5f9',
                                    color: isSelected ? '#ffffff' : '#475569',
                                    fontWeight: 700,
                                    fontSize: '0.70rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  {emp.full_name?.charAt(0)?.toUpperCase() || 'E'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: isSelected ? 800 : 600, color: isSelected ? '#1d4ed8' : '#0f172a', fontSize: '0.82rem' }}>
                                    {emp.full_name}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                                    <span style={{ fontSize: '0.68rem', background: '#f1f5f9', color: '#475569', padding: '0 4px', borderRadius: 3 }}>
                                      {emp.employee_code}
                                    </span>
                                    <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                                      {emp.department_name || 'General'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {isSelected && <Check size={15} style={{ color: '#2563eb', flexShrink: 0 }} />}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Employee Full Name *</label>
                  <input
                    type="text"
                    name="candidateName"
                    className="input-field"
                    placeholder="e.g. Site Test"
                    value={formData.candidateName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Employee Address</label>
                  <textarea
                    rows={2}
                    name="candidateAddress"
                    className="input-field"
                    placeholder="e.g. 185, cape town, south africa"
                    value={formData.candidateAddress}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Relieving Dates & Exit Notes */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <Calendar size={17} style={{ color: '#2563eb' }} />
              Relieving Dates &amp; Exit Clearance
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Joining Date *</label>
                  <input
                    type="date"
                    name="joiningDate"
                    className="input-field"
                    value={formData.joiningDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Last Working Date *</label>
                  <input
                    type="date"
                    name="lastWorkingDate"
                    className="input-field"
                    value={formData.lastWorkingDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                  <label className="input-label">Letter Issue Date</label>
                  <input
                    type="date"
                    name="letterDate"
                    className="input-field"
                    value={formData.letterDate}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Exit Clearance / Dues Note</label>
                <textarea
                  className="input-field"
                  rows={2}
                  name="exitClearanceNote"
                  value={formData.exitClearanceNote}
                  onChange={handleInputChange}
                  placeholder="Exit formalities and clearance note..."
                />
              </div>
            </div>
          </div>

          {/* Section 3: Authorized Signatory Details */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <PenTool size={17} style={{ color: '#2563eb' }} />
              Authorized Signatory Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Signatory Full Name</label>
                <input
                  type="text"
                  name="signatoryName"
                  className="input-field"
                  placeholder="e.g. Meloni"
                  value={formData.signatoryName}
                  onChange={handleInputChange}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Signatory Role / Dept</label>
                <input
                  type="text"
                  name="signatoryRole"
                  className="input-field"
                  placeholder="e.g. HR Department"
                  value={formData.signatoryRole}
                  onChange={handleInputChange}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Signatory Phone</label>
                <input
                  type="text"
                  name="signatoryPhone"
                  className="input-field"
                  placeholder="e.g. +91 9845178901"
                  value={formData.signatoryPhone}
                  onChange={handleInputChange}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Signatory Email</label>
                <input
                  type="email"
                  name="signatoryEmail"
                  className="input-field"
                  placeholder="e.g. service@puma.com"
                  value={formData.signatoryEmail}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Corporate Header & Legal Footer */}
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: 14 }}>
              <Building2 size={17} style={{ color: '#2563eb' }} />
              Corporate Identity &amp; Footer Info
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Company Name</label>
                <input
                  type="text"
                  name="companyName"
                  className="input-field"
                  value={formData.companyName}
                  onChange={handleInputChange}
                />
              </div>
              <div className="input-group">
                <label className="input-label">CIN Number</label>
                <input
                  type="text"
                  name="cinNumber"
                  className="input-field"
                  value={formData.cinNumber}
                  onChange={handleInputChange}
                />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Registered Office Address (Bottom Bar)</label>
                <input
                  type="text"
                  name="registeredAddress"
                  className="input-field"
                  value={formData.registeredAddress}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}