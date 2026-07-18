import { useState, useEffect } from 'react';
import { getMyPayslips } from '../api/payroll';
import { Wallet, ChevronDown, ChevronUp } from 'lucide-react';

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
    getMyPayslips().then((r) => setPayslips(r.data)).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>My Payslips</h1>
          <p>Your finalized monthly payslips</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {payslips.map((p) => {
          const isOpen = expandedId === p.id;
          return (
            <div key={p.id} className="section-card">
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedId(isOpen ? null : p.id)}
              >
                <div>
                  <h3 style={{ marginBottom: 4 }}>{MONTH_NAMES[p.run_month - 1]} {p.run_year}</h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Net Pay: <strong style={{ color: 'var(--text-primary)' }}>₹{money(p.net_pay)}</strong>
                  </p>
                </div>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>

              {isOpen && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                  <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px 1fr', rowGap: 10, columnGap: 16, fontSize: '0.875rem', marginBottom: 16 }}>
                    <dt style={{ color: 'var(--text-muted)' }}>Basic Pay</dt>
                    <dd>₹{money(p.basic_pay)}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>Working Days</dt>
                    <dd>{p.working_days}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>Gross Earnings</dt>
                    <dd>₹{money(p.gross_earnings)}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>Loss of Pay Days</dt>
                    <dd>{p.lop_days}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>Gross Deductions</dt>
                    <dd>₹{money(p.gross_deductions)}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>LOP Amount</dt>
                    <dd>₹{money(p.lop_amount)}</dd>
                  </dl>

                  <table className="data-table">
                    <thead><tr><th>Component</th><th>Type</th><th>Amount</th></tr></thead>
                    <tbody>
                      {p.lines.map((line) => (
                        <tr key={line.id}>
                          <td>{line.component_name}</td>
                          <td>
                            <span className={`badge ${line.component_type === 'earning' ? 'badge-active' : 'badge-rejected'}`}>
                              {line.component_type}
                            </span>
                          </td>
                          <td style={{ color: line.component_type === 'earning' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                            {line.component_type === 'earning' ? '+' : '-'}₹{money(line.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, fontSize: '1rem', fontWeight: 700 }}>
                    Net Pay: ₹{money(p.net_pay)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {payslips.length === 0 && (
          <div className="section-card">
            <div className="empty-state"><Wallet size={48} /><p>No payslips available yet</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
