import { useState, useEffect } from 'react';
import Modal from './Modal';
import {
  getDirectory,
  createRelievingLetter,
  downloadRelievingLetterPdf,
} from '../api/employees';
import { getMyCompany } from '../api/company';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.jpg';
import {
  Download,
  Calendar,
  User,
  FileText,
  Printer,
  Eye,
  ArrowLeft,
  MapPin,
  Globe,
  Mail,
  Phone,
  CheckCircle,
} from 'lucide-react';

export default function RelievingLetterModal({ employee, onClose, onSuccess }) {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employee?.id || '');
  const [lastWorkingDate, setLastWorkingDate] = useState(new Date().toISOString().split('T')[0]);
  const [customParagraph, setCustomParagraph] = useState(
    'We confirm that you have successfully completed your exit formalities and that there are no dues pending against you.'
  );
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('HR Department');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Open live preview directly if employee is pre-passed or when toggled
  const [showPreview, setShowPreview] = useState(Boolean(employee?.id));

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
        if (!employee && !selectedEmployeeId && list.length > 0) {
          setSelectedEmployeeId(list[0].id);
        }
      })
      .catch(() => {});
  }, [employee, user]);

  const selectedEmp = employee || employees.find((e) => e.id === selectedEmployeeId) || employees[0];

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

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const targetEmpId = selectedEmployeeId || employee?.id || selectedEmp?.id;
    if (!targetEmpId) {
      setError('Please select an employee');
      return;
    }
    if (!lastWorkingDate) {
      setError('Please enter the last working date');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const payload = {
        employee_id: targetEmpId,
        last_working_date: lastWorkingDate,
        custom_paragraph: customParagraph?.trim() || null,
      };

      const res = await createRelievingLetter(payload);
      const relievingId = res.data?.id;

      if (relievingId) {
        const pdfRes = await downloadRelievingLetterPdf(relievingId);
        const blob = new Blob([pdfRes.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const name = (selectedEmp?.full_name || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `Relieving_Letter_${name}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create relieving letter:', err);
      setError(err.response?.data?.detail || 'Failed to generate relieving letter.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={showPreview ? "Relieving Letter Preview (A4 Format)" : "Generate Official Relieving Letter"}
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
           EXACT LIVE A4 RELIEVING LETTER VOUCHER (MATCHING media_1788198024893.jpg)
           ═══════════════════════════════════════════════════════════════ */
        <div className="relieving-letter-container-wrap">
          {/* Action Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              maxWidth: 820,
              padding: '4px 0 10px 0',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPreview(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.86rem' }}
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
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  padding: '7px 18px',
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
                  fontSize: '0.88rem',
                }}
              >
                <CheckCircle size={16} /> {loading ? 'Generating...' : 'Save & Download'}
              </button>
            </div>
          </div>

          {/* Printable Voucher Frame */}
          <div id="relieving-letter-voucher" className="relieving-letter-voucher">
            <div>
              {/* 1. Header (Matching Offer Letter Brand Header) */}
              <div className="relieving-header">
                <div className="relieving-header-left">
                  <div className="relieving-logo-card">
                    <img
                      src={company?.logo_url || logoImg}
                      alt="Logo"
                      onError={(e) => {
                        e.currentTarget.src = logoImg;
                      }}
                    />
                  </div>
                  <div>
                    <div className="relieving-brand-title">HRMS Portal</div>
                    <div className="relieving-brand-company">{company?.name || 'MEAGLE360 CORP'}</div>
                  </div>
                </div>

                <div className="relieving-header-right">
                  <div className="relieving-contact-list">
                    <div className="relieving-contact-row">
                      <MapPin size={12} className="relieving-contact-icon" />
                      <span>{company?.company_address || company?.address || '1 Infinite Loop, Cupertino, CA'}</span>
                    </div>
                    <div className="relieving-contact-row">
                      <Globe size={12} className="relieving-contact-icon" />
                      <span>{company?.website || 'https://about.puma.com/en'}</span>
                    </div>
                    <div className="relieving-contact-row">
                      <Mail size={12} className="relieving-contact-icon" />
                      <span>{company?.email || 'service@puma.com'}</span>
                    </div>
                    <div className="relieving-contact-row">
                      <Phone size={12} className="relieving-contact-icon" />
                      <span>{company?.phone || '+91 9845178901'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Edge-to-edge full width divider line */}
              <div className="relieving-header-divider"></div>

              {/* 2. Centered Document Title */}
              <div className="relieving-title-block">
                <div className="relieving-title-text">Relieving Letter</div>
                <div className="relieving-title-underline"></div>
              </div>

              {/* 3. Top Recipient & Date Section (Matching media_1788198024893.jpg) */}
              <div className="relieving-meta-block">
                <div style={{ color: '#1e293b', fontWeight: 600, marginBottom: 8 }}>{todayFormatted}</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.04rem' }}>{selectedEmp?.full_name || '[Recipient\'s Name]'}</div>
                {selectedEmp?.current_address ? (
                  <div>{selectedEmp.current_address}</div>
                ) : (
                  <div>{selectedEmp?.permanent_address || '185, cape town, south africa'}</div>
                )}
                {selectedEmp?.city && (
                  <div>
                    {selectedEmp.city}{selectedEmp.state ? `, ${selectedEmp.state}` : ''}{selectedEmp.postal_code ? `, ${selectedEmp.postal_code}` : ''}
                  </div>
                )}
              </div>

              {/* 4. Centered Subject (Matching media_1788198024893.jpg) */}
              <div className="relieving-subject">
                Subject: Relieving Letter
              </div>

              {/* 5. Salutation & Body Paragraphs */}
              <div className="relieving-salutation">
                Dear {selectedEmp?.full_name || '[Recipient\'s Name]'},
              </div>

              <div className="relieving-body-p">
                We are writing to confirm that <strong>{selectedEmp?.full_name || '[Employee\'s Full Name]'}</strong>, employed with <strong>{company?.name || 'MEAGLE360 CORP'}</strong> since <strong>{formatDate(selectedEmp?.date_of_hire) || '[Employee\'s Joining Date]'}</strong>, has been relieved from their duties effective <strong>{formatDate(lastWorkingDate) || '[Relieving Date]'}</strong>.
              </div>

              <div className="relieving-body-p">
                During their tenure with us, <strong>{selectedEmp?.full_name || '[Employee\'s Full Name]'}</strong> performed their duties diligently and responsibly. We appreciate their contributions to the company and wish them all the best in their future endeavors.
              </div>

              {customParagraph && (
                <div className="relieving-body-p">
                  {customParagraph}
                </div>
              )}

              <div className="relieving-body-p">
                Please feel free to contact us at {company?.phone || '+91 9845178901'} or {company?.email || 'service@puma.com'} if you require any further information.
              </div>

              <div className="relieving-body-p" style={{ marginBottom: 16 }}>
                Thank you for your cooperation.
              </div>

              {/* 6. Signatory Section */}
              <div className="relieving-sign-block">
                <div style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>Sincerely,</div>
                {company?.signature_url ? (
                  <div style={{ margin: '6px 0 4px 0', minHeight: 68, display: 'flex', alignItems: 'center' }}>
                    <img src={company.signature_url} alt="Sign" style={{ height: 68, maxWidth: 240, width: 'auto', objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div style={{ width: 210, height: 68, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', borderBottom: '2px solid #94a3b8', marginBottom: 6 }}></div>
                  </div>
                )}
                <div className="relieving-sign-name">{signatoryName || company?.authorized_signatory_name || 'Authorized Signatory'}</div>
                <div style={{ color: '#475569', fontSize: '0.94rem' }}>{signatoryDesignation || 'HR Department'}</div>
                {company?.phone && <div style={{ color: '#475569', fontSize: '0.90rem' }}>{company.phone}</div>}
                {company?.email && <div style={{ color: '#475569', fontSize: '0.90rem' }}>{company.email}</div>}
                <div style={{ fontWeight: 700, color: '#0052cc', fontSize: '0.96rem', marginTop: 3 }}>{company?.name || 'MEAGLE360 CORP'}</div>
              </div>
            </div>

            {/* 7. Bottom 2-Tier Footer (Matching media_1788198024893.jpg) */}
            <div className="relieving-footer-wrap">
              <div className="relieving-footer-cin">
                CIN NO: {company?.cin_number || 'U74899DL2000PLC103438'}
              </div>
              <div className="relieving-footer-address">
                Registered Address: {company?.registered_address || company?.company_address || company?.address || '1 Infinite Loop, Cupertino, CA'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════
           FORM DETAILS VIEW
           ═══════════════════════════════════════════════════════════════ */
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Employee Selection */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
              <User size={16} style={{ color: '#0052cc' }} />
              Employee Details
            </div>

            {employee ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#eff6ff',
                    color: '#0052cc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '1rem',
                  }}
                >
                  {employee.full_name?.charAt(0) || 'E'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{employee.full_name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {employee.employee_code} • {employee.designation_name || employee.department_name || 'Team Member'}
                  </div>
                  {employee.date_of_hire && (
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                      Joining Date: <strong>{formatDate(employee.date_of_hire)}</strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="input-group">
                <label className="input-label">Select Employee *</label>
                <select
                  className="input-field"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  required
                >
                  <option value="">Choose Employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code}) - {emp.department_name || 'General'}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Dates & Signatory Details */}
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', marginBottom: 12 }}>
              <Calendar size={16} style={{ color: '#0052cc' }} />
              Relieving Formalities &amp; Signatory
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                <label className="input-label">Authorized Signatory Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={signatoryName}
                  placeholder="e.g. Sarah Johnson"
                  onChange={(e) => setSignatoryName(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group" style={{ marginTop: 12 }}>
              <label className="input-label">Signatory Position / Role</label>
              <input
                type="text"
                className="input-field"
                value={signatoryDesignation}
                placeholder="e.g. HR Department"
                onChange={(e) => setSignatoryDesignation(e.target.value)}
              />
            </div>

            <div className="input-group" style={{ marginTop: 12 }}>
              <label className="input-label">Custom Paragraph / Formalities Note (Optional)</label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="e.g. We confirm that you have successfully completed your exit formalities and that there are no dues pending against you."
                value={customParagraph}
                onChange={(e) => setCustomParagraph(e.target.value)}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const targetEmpId = selectedEmployeeId || employee?.id || selectedEmp?.id;
                if (!targetEmpId) {
                  setError('Please select an employee first.');
                  return;
                }
                setError('');
                setShowPreview(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #0052cc, #004080)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
              }}
            >
              <Eye size={16} />
              Preview Document
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}


