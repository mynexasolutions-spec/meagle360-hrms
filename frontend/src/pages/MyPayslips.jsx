import { useState, useEffect } from 'react';
import { getMyPayslips } from '../api/payroll';
import { Wallet, ChevronDown, ChevronUp, Download, Printer, Building2, CheckCircle2 } from 'lucide-react';

import logoImg from '../assets/logo.jpg';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function money(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    getMyPayslips()
      .then((r) => {
        setPayslips(r.data);
        if (r.data?.length > 0) {
          setExpandedId(r.data[0].id); // Auto expand latest payslip
        }
      })
      .catch(() => {});
  }, []);

  const handlePrint = (payslipId) => {
    window.print();
  };

  const handleDownloadPDF = (p) => {
    const element = document.getElementById(`payslip-container-${p.id}`);
    if (!element) return;

    // Load html2pdf from CDN dynamically if not available
    const opt = {
      margin: 0.3,
      filename: `Payslip_${MONTH_NAMES[p.run_month - 1]}_${p.run_year}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(element).save();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => {
        window.html2pdf().set(opt).from(element).save();
      };
      script.onerror = () => {
        // Fallback to native print to PDF if script fails
        window.print();
      };
      document.body.appendChild(script);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.13)',
            }}
          >
            <Wallet size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>My Payslips</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>View &amp; download your official monthly salary statements</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 20 }}>
        {payslips.map((p) => {
          const isOpen = expandedId === p.id;
          const earnings = p.lines?.filter((l) => l.component_type === 'earning') || [];
          const deductions = p.lines?.filter((l) => l.component_type === 'deduction') || [];

          return (
            <div
              key={p.id}
              className="payslip-card"
              style={{
                boxShadow: isOpen ? '0 10px 30px -5px rgba(0, 0, 0, 0.05)' : '0 2px 8px rgba(0, 0, 0, 0.02)',
                transition: 'all 0.2s ease-in-out',
              }}
            >
              {/* Header Bar */}
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
                      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
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
                      Working Days: <strong style={{ color: '#334155' }}>{p.working_days}</strong> | LOP: <strong style={{ color: '#ef4444' }}>{p.lop_days} days</strong>
                    </span>
                  </div>
                </div>

                <div className="payslip-header-right">
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Transfer</div>
                    <div style={{ fontSize: 'clamp(1.05rem, 4vw, 1.25rem)', fontWeight: 800, color: '#16a34a' }}>₹{money(p.net_pay)}</div>
                  </div>
                  <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {/* Payslip Document Body */}
              {isOpen && (
                <div id={`payslip-doc-${p.id}`} className="payslip-doc-body">

                  {/* Action Toolbar */}
                  <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleDownloadPDF(p)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '9px 18px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                      }}
                    >
                      <Download size={16} /> Download PDF
                    </button>
                  </div>

                  {/* Salary Voucher Container */}
                  <div
                    id={`payslip-container-${p.id}`}
                    className="payslip-voucher"
                  >
                    {/* Header Banner */}
                    <div className="payslip-banner-header">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                          <img src={logoImg} alt="Logo" style={{ height: 60, width: 'auto', objectFit: 'contain' }} />
                          <h2 style={{ margin: 0, fontSize: 'clamp(1.05rem, 4vw, 1.35rem)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                            MEAGLE360 CORP
                          </h2>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>Official Salary Statement &amp; Tax Voucher</p>
                      </div>

                      <div style={{ textAlign: 'right', minWidth: 0 }}>
                        <div style={{ fontSize: 'clamp(0.9375rem, 3.5vw, 1.15rem)', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                          PAYSLIP - {MONTH_NAMES[p.run_month - 1].toUpperCase()} {p.run_year}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 4 }}>
                          Generated Date: {new Date().toLocaleDateString('en-IN')}
                        </div>
                      </div>
                    </div>

                    {/* Employee & Payroll Overview Meta Grid */}
                    <div className="payslip-meta-grid">
                      <div>
                        <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Working Days</span>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{p.working_days} Days</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>LOP Days</span>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: p.lop_days > 0 ? '#ef4444' : '#0f172a', marginTop: 2 }}>{p.lop_days} Days</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Basic Pay</span>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>₹{money(p.basic_pay)}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>LOP Amount Deduction</span>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: p.lop_amount > 0 ? '#dc2626' : '#0f172a', marginTop: 2 }}>₹{money(p.lop_amount)}</div>
                      </div>
                    </div>

                    {/* Earnings & Deductions Dual Table */}
                    <div className="payslip-tables">

                      {/* Earnings Table */}
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ background: '#f1f5f9', padding: '10px 16px', fontWeight: 700, fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                          <span>EARNINGS</span>
                          <span>AMOUNT (₹)</span>
                        </div>
                        <div style={{ minHeight: 120 }}>
                          {earnings.map((line) => (
                            <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderBottom: '1px dashed #f1f5f9', fontSize: '0.85rem' }}>
                              <span style={{ color: '#334155', fontWeight: 500 }}>{line.component_name}</span>
                              <span style={{ fontWeight: 600, color: '#0f172a', flexShrink: 0 }}>₹{money(line.amount)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ background: '#f8fafc', padding: '12px 16px', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', borderTop: '2px solid #cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Gross Earnings</span>
                          <span style={{ color: '#16a34a' }}>₹{money(p.gross_earnings)}</span>
                        </div>
                      </div>

                      {/* Deductions Table */}
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ background: '#f1f5f9', padding: '10px 16px', fontWeight: 700, fontSize: '0.875rem', color: '#0f172a', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                          <span>DEDUCTIONS</span>
                          <span>AMOUNT (₹)</span>
                        </div>
                        <div style={{ minHeight: 120 }}>
                          {deductions.map((line) => (
                            <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderBottom: '1px dashed #f1f5f9', fontSize: '0.85rem' }}>
                              <span style={{ color: '#334155', fontWeight: 500 }}>{line.component_name}</span>
                              <span style={{ fontWeight: 600, color: '#dc2626', flexShrink: 0 }}>₹{money(line.amount)}</span>
                            </div>
                          ))}
                          {deductions.length === 0 && (
                            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>No deductions for this period</div>
                          )}
                        </div>
                        <div style={{ background: '#f8fafc', padding: '12px 16px', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', borderTop: '2px solid #cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Total Deductions</span>
                          <span style={{ color: '#dc2626' }}>₹{money(p.gross_deductions)}</span>
                        </div>
                      </div>

                    </div>

                    {/* Net Pay Highlight Banner */}
                    <div className="payslip-net-banner">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <CheckCircle2 size={24} style={{ color: '#4ade80', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Net Take Home Salary</div>
                          <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Direct Bank Transfer Successful</div>
                        </div>
                      </div>

                      <div style={{ fontSize: 'clamp(1.35rem, 5vw, 1.65rem)', fontWeight: 800, color: '#4ade80', letterSpacing: '-0.02em' }}>
                        ₹{money(p.net_pay)}
                      </div>
                    </div>

                    {/* Confidentiality Footer */}
                    <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.725rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                      This is a computer-generated salary slip and does not require a physical signature. Confidential &amp; Proprietary to Meagle360 Corp.
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
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 700 }}>No Payslips Available</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>Your monthly finalized salary statements will appear here once processed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
