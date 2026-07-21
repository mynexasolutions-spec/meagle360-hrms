import { useState, useEffect } from 'react';
import { getAttendanceOverview, getLeaveSummary } from '../api/dashboard';
import { getDirectory } from '../api/employees';
import { BarChart3, TrendingUp, PieChart as PieChartIcon, Calendar } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];

export default function ReportsAnalytics() {
  const [attendanceTrend, setAttendanceTrend] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState([]);
  const [deptCounts, setDeptCounts] = useState([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    getAttendanceOverview(30).then((r) => setAttendanceTrend(r.data)).catch(() => {});
    getLeaveSummary().then((r) => setLeaveSummary(r.data)).catch(() => {});
    getDirectory(0, 1000).then((r) => {
      const counts = {};
      r.data.forEach((e) => {
        const dept = e.department_name || 'Unassigned';
        counts[dept] = (counts[dept] || 0) + 1;
      });
      setDeptCounts(Object.entries(counts).map(([name, count]) => ({ name, count })));
    }).catch(() => {});
  }, []);

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
            <BarChart3 size={22} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Reports &amp; Analytics</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Company-wide workforce attendance trends, department distribution &amp; leave metrics</p>
          </div>
        </div>
      </div>

      {/* Grid Charts Section */}
      <div className="content-grid" style={{ marginBottom: 24 }}>
        {/* Attendance Bar Chart */}
        <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
          <h3 style={{ marginBottom: 4 }}><TrendingUp size={18} style={{ color: 'var(--accent-blue)' }} /> Attendance Trend (30 Days)</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16, marginLeft: 26 }}>Daily present, absent &amp; leave metrics</p>

          <ResponsiveContainer width="100%" height={isMobile ? 260 : 290}>
            <BarChart data={attendanceTrend} barGap={2} barCategoryGap={isMobile ? '12%' : '20%'} margin={{ top: 5, right: isMobile ? 0 : 10, left: 0, bottom: isMobile ? 24 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: isMobile ? 10 : 11, fill: '#64748b' }}
                tickFormatter={(d) => d.slice(5)}
                interval={isMobile ? 5 : 2}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? 'end' : 'middle'}
                height={isMobile ? 40 : 30}
              />
              <YAxis tick={{ fontSize: isMobile ? 10 : 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={isMobile ? 22 : 36} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }} />
              <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 12, paddingTop: 10 }} />
              {/* Stack the three series into one bar per day on mobile — three
                  side-by-side bars across 30 categories shrink to illegible
                  hairlines on a phone-width chart; stacking keeps each day's
                  bar at the full category width instead of splitting it 3 ways. */}
              <Bar dataKey="present" fill="#059669" name="Present" radius={isMobile ? [0, 0, 4, 4] : [4, 4, 0, 0]} maxBarSize={isMobile ? 22 : 28} stackId={isMobile ? 'attendance' : undefined} />
              <Bar dataKey="absent" fill="#ef4444" name="Absent" radius={isMobile ? [0, 0, 0, 0] : [4, 4, 0, 0]} maxBarSize={isMobile ? 22 : 28} stackId={isMobile ? 'attendance' : undefined} />
              <Bar dataKey="on_leave" fill="#2563eb" name="On Leave" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 22 : 28} stackId={isMobile ? 'attendance' : undefined} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Headcount Donut Chart */}
        <div className="section-card" style={{ borderTop: '3px solid #7c3aed' }}>
          <h3 style={{ marginBottom: 4 }}><PieChartIcon size={18} style={{ color: 'var(--accent-violet)' }} /> Headcount by Department</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16, marginLeft: 26 }}>Departmental employee breakdown</p>

          {deptCounts.length === 0 ? (
            <div className="empty-state"><p>No department data yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={deptCounts} dataKey="count" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {deptCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Leave Summary Table */}
      <div className="section-card" style={{ borderTop: '3px solid #059669' }}>
        <h3 style={{ marginBottom: 4 }}><Calendar size={18} style={{ color: 'var(--accent-emerald)' }} /> Leave Summary (Annual)</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 16, marginLeft: 26 }}>Distribution of employee leave types taken</p>

        {leaveSummary.length === 0 ? (
          <div className="empty-state"><p>No approved leave data this year yet</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Leave Type</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Days Taken</th>
                  <th style={{ whiteSpace: 'nowrap' }}>% of Total Leaves</th>
                </tr>
              </thead>
              <tbody>
                {leaveSummary.map((l) => (
                  <tr key={l.leave_type}>
                    <td style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{l.leave_type}</td>
                    <td style={{ fontWeight: 600, color: '#2563eb', whiteSpace: 'nowrap' }}>{l.days} Days</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#eff6ff', color: '#2563eb' }}>
                        {l.percentage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
