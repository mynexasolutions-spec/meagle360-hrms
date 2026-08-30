import { useState, useEffect } from 'react';
import { getMyPayslips, downloadPayslipPdf } from '../api/payroll';
import { getEmployee } from '../api/employees';
import { getMyCompany } from '../api/company';
import { useAuth } from '../context/AuthContext';
import {
  Wallet,
  ChevronDown,
  ChevronUp,
  Download,
  Printer,
  User,
  PlusCircle,
  MinusCircle,
  Calendar,
  CalendarCheck,
  CalendarX,
  IndianRupee,
  Building2,
  FileText,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
} from 'lucide-react';

import logoImg from '../assets/logo.jpg';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function money(n) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberToWordsIndian(num) {
  const n = Math.round(Number(num || 0));
  if (n === 0) return 'Rupees Zero Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(v) {
    if (v < 20) return a[v];
    return (b[Math.floor(v / 10)] + ' ' + a[v % 10]).trim();
  }

  function convertThreeDigits(v) {
    let str = '';
    if (Math.floor(v / 100) > 0) {
      str += a[Math.floor(v / 100)] + ' Hundred ';
    }
    const rem = v % 100;
    if (rem > 0) {
      str += convertTwoDigits(rem);
    }
    return str.trim();
  }

  let words = '';
  const crore = Math.floor(n / 10000000);
  let rem = n % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  const hundreds = rem % 1000;

  if (crore > 0) words += convertThreeDigits(crore) + ' Crore ';
  if (lakh > 0) words += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand > 0) words += convertTwoDigits(thousand) + ' Thousand ';
  if (hundreds > 0) words += convertThreeDigits(hundreds) + ' ';

  return `(Rupees ${words.trim()} Only)`;
}

function maskAccountNumber(acc) {
  if (!acc) return '—';
  const str = String(acc).trim();
  if (str.length <= 4) return str;
  const last4 = str.slice(-4);
  return `**** **** ${last4}`;
}

function formatJoinDate(d) {
  if (!d) return '15 Jan 2022';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function formatPayPeriod(month, year) {
  const m = Number(month || 1);
  const y = Number(year || new Date().getFullYear());
  const monthShort = MONTH_NAMES[m - 1]?.slice(0, 3) || 'Jan';
  const lastDay = new Date(y, m, 0).getDate();
  return `01 ${monthShort} ${y} - ${lastDay} ${monthShort} ${y}`;
}

function formatPayDate(month, year) {
  const m = Number(month || 1);
  const y = Number(year || new Date().getFullYear());
  const monthShort = MONTH_NAMES[m - 1]?.slice(0, 3) || 'Jan';
  const lastDay = new Date(y, m, 0).getDate();
  return `${lastDay} ${monthShort} ${y}`;
}

export default function MyPayslips() {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [company, setCompany] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    getMyPayslips()
      .then((r) => {
        setPayslips(r.data || []);
        if (r.data?.length > 0) {
          setExpandedId(r.data[0].id); // Auto expand latest payslip
        }
      })
      .catch(() => { });

    getMyCompany()
      .then((r) => setCompany(r.data))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (user?.employee_id) {
      getEmployee(user.employee_id)
        .then((r) => setEmployee(r.data))
        .catch(() => { });
    }
  }, [user?.employee_id]);

  const handleDownloadPDF = async (p) => {
    setDownloadingId(p.id);
    const empCode = employee?.employee_code || p.employee_code || 'EMP';
    const filename = `Payslip_${MONTH_NAMES[p.run_month - 1]}_${p.run_year}_${empCode}.pdf`;

    try {
      // 1. First attempt: Server-side PDF generation (pristine single-page A4, vector crisp)
      try {
        const response = await downloadPayslipPdf(p.id);
        if (response?.data) {
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          setDownloadingId(null);
          return;
        }
      } catch (serverErr) {
        console.warn('Server PDF generation failed, falling back to client canvas:', serverErr);
      }

      // 2. Fallback: Client-side html2pdf
      const element = document.getElementById(`payslip-container-${p.id}`);
      if (!element) {
        window.print();
        return;
      }

      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
        },
        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' },
      };

      const generate = () => {
        return window.html2pdf().set(opt).from(element).save();
      };

      if (window.html2pdf) {
        await generate();
      } else {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = async () => {
            try {
              await generate();
              resolve();
            } catch (e) {
              reject(e);
            }
          };
          script.onerror = () => {
            window.print();
            resolve();
          };
          document.body.appendChild(script);
        });
      }
    } catch (err) {
      console.error('Error generating PDF:', err);
      window.print();
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              flexShrink: 0,
              background: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <Wallet size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>
              My Payslips
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              View &amp; download your official monthly salary statements
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 20 }}>
        {payslips.map((p) => {
          const isOpen = expandedId === p.id;

          const isEmployerLine = (l) =>
            l.component_type === 'employer_cost' || l.is_employer_contribution === true;

          const earnings = p.lines?.filter((l) => l.component_type === 'earning' && !isEmployerLine(l)) || [];
          const deductions = p.lines?.filter((l) => l.component_type === 'deduction' && !isEmployerLine(l)) || [];

          const empName = employee?.full_name || p.employee_name || '—';
          const empCode = employee?.employee_code || p.employee_code || '—';
          const designation = employee?.designation?.title || employee?.designation || employee?.role?.name || '—';
          const department = employee?.department?.name || employee?.department || '—';
          const doj = formatJoinDate(employee?.date_of_hire);
          const pan = employee?.pan_number || '—';
          const bankName = employee?.bank_name || (employee?.bank_ifsc ? `${employee.bank_ifsc.slice(0, 4)} Bank` : '—');
          const bankAccount = maskAccountNumber(employee?.bank_account_number);

          const paidDays = Math.max(0, Number(p.working_days || 0) - Number(p.lop_days || 0));
          const payslipNumber = p.payslip_number || `PS-${p.run_year}-${String(p.run_month).padStart(2, '0')}-${empCode}`;

          return (
            <div
              key={p.id}
              className="payslip-card"
              style={{
                boxShadow: isOpen ? '0 10px 30px -5px rgba(0, 0, 0, 0.05)' : '0 2px 8px rgba(0, 0, 0, 0.02)',
                transition: 'all 0.2s ease-in-out',
              }}
            >
              {/* Header Accordion Bar */}
              <div
                className="payslip-header-bar"
                style={{
                  background: isOpen ? '#f8fafc' : '#ffffff',
                  borderBottom: isOpen ? '1px solid #e2e8f0' : 'none',
                }}
                onClick={() => setExpandedId(isOpen ? null : p.id)}
              >
                <div className="payslip-header-left">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #0052cc, #1d4ed8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
                      flexShrink: 0,
                    }}
                  >
                    <Wallet size={22} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                      {MONTH_NAMES[p.run_month - 1]} {p.run_year} Payslip
                    </h3>
                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                      Working Days: <strong style={{ color: '#334155' }}>{p.working_days}</strong> | Paid Days:{' '}
                      <strong style={{ color: '#16a34a' }}>{paidDays}</strong> | LOP:{' '}
                      <strong style={{ color: Number(p.lop_days) > 0 ? '#ef4444' : '#64748b' }}>
                        {p.lop_days} days
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="payslip-header-right">
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Net Transfer
                    </div>
                    <div style={{ fontSize: 'clamp(1.05rem, 4vw, 1.25rem)', fontWeight: 800, color: '#0052cc' }}>
                      ₹{money(p.net_pay)}
                    </div>
                  </div>
                  <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {/* Expanded Payslip Document Body */}
              {isOpen && (
                <div id={`payslip-doc-${p.id}`} className="payslip-doc-body">
                  {/* Action Toolbar */}
                  <div
                    className="no-print"
                    style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 20 }}
                  >
                    <button
                      onClick={() => handleDownloadPDF(p)}
                      disabled={downloadingId === p.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '9px 18px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'linear-gradient(135deg, #0052cc, #1d4ed8)',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        cursor: downloadingId === p.id ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
                        opacity: downloadingId === p.id ? 0.75 : 1,
                      }}
                    >
                      <Download size={16} /> {downloadingId === p.id ? 'Generating PDF...' : 'Download PDF'}
                    </button>
                  </div>

                  {/* Corporate Payslip Voucher Container */}
                  <div id={`payslip-container-${p.id}`} className="payslip-voucher">
                    {/* 1. Header Banner (Angled Blue Polygon) */}
                    <div className="payslip-banner-header">
                      <div className="payslip-brand-left">
                        <div className="logo-box">
                          <img
                            src={company?.logo_url || logoImg}
                            crossOrigin="anonymous"
                            alt="Company Logo"
                            className="logo-img"
                            onError={(e) => {
                              e.currentTarget.src = logoImg;
                            }}
                          />
                        </div>
                        <div>
                          <h2 className="payslip-brand-title">HRMS Portal</h2>
                          <div className="payslip-brand-subtitle">{company?.name || 'MEAGLE360'}</div>
                        </div>
                      </div>

                      <div className="payslip-meta-right">
                        <div className="payslip-meta-top-title">
                          <h2>PAYSLIP</h2>
                          <Wallet size={24} style={{ color: '#ffffff' }} />
                        </div>
                        <div className="payslip-meta-rows">
                          <div className="payslip-meta-row">
                            <span className="payslip-meta-label">Pay Period</span>
                            <span className="payslip-meta-val">: &nbsp;{formatPayPeriod(p.run_month, p.run_year)}</span>
                          </div>
                          <div className="payslip-meta-row">
                            <span className="payslip-meta-label">Payslip No.</span>
                            <span className="payslip-meta-val">: &nbsp;{payslipNumber}</span>
                          </div>
                          <div className="payslip-meta-row">
                            <span className="payslip-meta-label">Pay Date</span>
                            <span className="payslip-meta-val">: &nbsp;{formatPayDate(p.run_month, p.run_year)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Content Wrapper */}
                    <div className="payslip-voucher-content">
                      {/* 2. Employee Information Grid */}
                      <div className="payslip-employee-info">
                        <div className="payslip-section-heading">
                          <User size={16} />
                          <span>EMPLOYEE INFORMATION</span>
                        </div>
                        <div className="payslip-emp-grid">
                          <div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Employee Name</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{empName}</span>
                            </div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Employee ID</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{empCode}</span>
                            </div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Designation</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{designation}</span>
                            </div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Department</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{department}</span>
                            </div>
                          </div>
                          <div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Date of Joining</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{doj}</span>
                            </div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">PAN</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{pan}</span>
                            </div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Bank Name</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{bankName}</span>
                            </div>
                            <div className="payslip-emp-row">
                              <span className="payslip-emp-label">Bank Account No.</span>
                              <span className="payslip-emp-colon">:</span>
                              <span className="payslip-emp-val">{bankAccount}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 3. Dual Earnings & Deductions Tables */}
                      <div className="payslip-tables">
                        {/* Left: Earnings */}
                        <div className="payslip-table-box">
                          <div className="payslip-table-header">
                            <div className="table-title-with-icon">
                              <PlusCircle size={15} />
                              <span>EARNINGS</span>
                            </div>
                            <span>AMOUNT (₹)</span>
                          </div>
                          <div className="payslip-table-body">
                            {earnings.map((line) => (
                              <div key={line.id} className="payslip-table-row">
                                <span className="comp-name">{line.component_name}</span>
                                <span className="comp-val">{money(line.amount)}</span>
                              </div>
                            ))}
                            {earnings.length === 0 && (
                              <div className="payslip-table-row">
                                <span className="comp-name">Basic Salary</span>
                                <span className="comp-val">{money(p.basic_pay)}</span>
                              </div>
                            )}
                          </div>
                          <div className="payslip-table-footer">
                            <span>GROSS EARNINGS</span>
                            <span>{money(p.gross_earnings)}</span>
                          </div>
                        </div>

                        {/* Right: Deductions */}
                        <div className="payslip-table-box">
                          <div className="payslip-table-header">
                            <div className="table-title-with-icon">
                              <MinusCircle size={15} />
                              <span>DEDUCTIONS</span>
                            </div>
                            <span>AMOUNT (₹)</span>
                          </div>
                          <div className="payslip-table-body">
                            {deductions.map((line) => (
                              <div key={line.id} className="payslip-table-row">
                                <span className="comp-name">{line.component_name}</span>
                                <span className="comp-val">{money(line.amount)}</span>
                              </div>
                            ))}
                            {!deductions.some((d) => d.component_name?.toLowerCase().includes('loss of pay') || d.component_name?.toLowerCase().includes('lop')) && Number(p.lop_amount) > 0 && (
                              <div className="payslip-table-row">
                                <span className="comp-name">Loss of Pay ({p.lop_days} days)</span>
                                <span className="comp-val">{money(p.lop_amount)}</span>
                              </div>
                            )}
                            {deductions.length === 0 && Number(p.lop_amount) === 0 && (
                              <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                                No deductions for this period
                              </div>
                            )}
                          </div>
                          <div className="payslip-table-footer">
                            <span>TOTAL DEDUCTIONS</span>
                            <span>{money(p.gross_deductions)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 4. Attendance Metrics (4 Cards) */}
                      <div className="payslip-attendance">
                        <div className="payslip-att-card">
                          <div className="payslip-att-icon">
                            <Calendar size={22} />
                          </div>
                          <div>
                            <div className="payslip-att-label">WORKING DAYS</div>
                            <div className="payslip-att-val">{p.working_days}</div>
                          </div>
                        </div>

                        <div className="payslip-att-card">
                          <div className="payslip-att-icon">
                            <CalendarCheck size={22} />
                          </div>
                          <div>
                            <div className="payslip-att-label">PAID DAYS</div>
                            <div className="payslip-att-val">{paidDays}</div>
                          </div>
                        </div>

                        <div className="payslip-att-card">
                          <div className="payslip-att-icon">
                            <CalendarX size={22} />
                          </div>
                          <div>
                            <div className="payslip-att-label">LEAVE / LOP DAYS</div>
                            <div className="payslip-att-val">{p.lop_days}</div>
                          </div>
                        </div>

                        <div className="payslip-att-card">
                          <div className="payslip-att-icon">
                            <IndianRupee size={22} />
                          </div>
                          <div>
                            <div className="payslip-att-label">LOP AMOUNT</div>
                            <div className="payslip-att-val">{money(p.lop_amount)}</div>
                          </div>
                        </div>
                      </div>

                      {/* 5. Net Pay Royal Blue Banner */}
                      <div className="payslip-net-banner">
                        <div className="payslip-net-wallet-circle">
                          <Wallet size={24} />
                        </div>
                        <div className="payslip-net-content">
                          <div className="payslip-net-title-row">
                            <span className="payslip-net-title">NET PAY</span>
                            <span className="payslip-net-divider">|</span>
                            <span className="payslip-net-amount">₹ {money(p.net_pay)}</span>
                          </div>
                          <div className="payslip-net-words">{numberToWordsIndian(p.net_pay)}</div>
                        </div>
                      </div>

                      {/* 6. Signature & Notice Card (Aligned Right) */}
                      <div className="payslip-bottom-section">
                        <div className="payslip-signature-card">
                          <div>
                            <div className="payslip-notice-header">
                              <FileText size={16} style={{ flexShrink: 0 }} />
                              <span>THIS IS A COMPUTER-GENERATED PAYSLIP.</span>
                            </div>
                            <div className="payslip-notice-sub">This does not require any signature.</div>
                          </div>

                          <div className="payslip-sig-container">
                            {company?.signature_url ? (
                              <img
                                src={company.signature_url}
                                crossOrigin="anonymous"
                                alt="Signature"
                                className="payslip-sig-img"
                              />
                            ) : (
                              <div className="payslip-sig-font">
                                {company?.authorized_signatory_name || 'Rhaunta'}
                              </div>
                            )}
                            <div className="payslip-sig-line"></div>
                            <div className="payslip-sig-role">
                              AUTHORIZED SIGNATORY
                            </div>
                            <div className="payslip-sig-dept">
                              {company?.authorized_signatory_name ? `${company.authorized_signatory_name} - HR Department` : 'HR Department'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 7. Corporate Blue Footer */}
                    <div className="payslip-footer">
                      <div className="payslip-footer-contacts">
                        <div className="payslip-footer-contact-item">
                          <Phone size={15} />
                          <div className="item-text">
                            <span>{company?.phone || '+123 456 789 00'}</span>
                          </div>
                        </div>
                        <div className="payslip-footer-contact-item">
                          <Mail size={15} />
                          <div className="item-text">
                            <span>{company?.email || 'info@meagle360.com'}</span>
                            {company?.website && <span>{company.website}</span>}
                          </div>
                        </div>
                        <div className="payslip-footer-contact-item">
                          <MapPin size={15} />
                          <div className="item-text">
                            <span>{company?.company_address || company?.address || '123A Street Name, City, State - 560001'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="payslip-footer-thanks">
                        <div className="thanks-title">THANK YOU!</div>
                        <div className="thanks-sub">{company?.footer_text || 'We appreciate your hard work.'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {payslips.length === 0 && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: 48,
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            <Wallet size={48} style={{ color: '#cbd5e1', marginBottom: 12 }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>
              No Payslips Available
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
              Your monthly finalized salary statements will appear here once processed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
