import { useState, useEffect } from 'react';
import { getAttendanceOverview, getLeaveSummary } from '../api/dashboard';
import { getDirectory } from '../api/employees';
import { BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-amber)', 'var(--accent-violet)', 'var(--accent-rose)'];

export default function ReportsAnalytics() {
  const [attendanceTrend, setAttendanceTrend] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState([]);
  const [deptCounts, setDeptCounts] = useState([]);

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
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1><BarChart3 size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Reports & Analytics</h1>
          <p>Company-wide attendance, leave, and headcount trends.</p>
        </div>
      </div>

      <div className="content-grid">
        <div className="section-card">
          <h3>Attendance Trend (30 Days)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={attendanceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={(d) => d.slice(5)} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="present" fill="var(--accent-emerald)" name="Present" radius={[3, 3, 0, 0]} />
              <Bar dataKey="absent" fill="var(--accent-rose)" name="Absent" radius={[3, 3, 0, 0]} />
              <Bar dataKey="on_leave" fill="var(--accent-blue)" name="On Leave" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="section-card">
          <h3>Headcount by Department</h3>
          {deptCounts.length === 0 ? (
            <div className="empty-state"><BarChart3 /><p>No department data yet</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={deptCounts} dataKey="count" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {deptCounts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="section-card" style={{ marginTop: 20 }}>
        <h3>Leave Summary (This Year)</h3>
        {leaveSummary.length === 0 ? (
          <div className="empty-state"><BarChart3 /><p>No approved leave this year yet</p></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Leave Type</th><th>Days Taken</th><th>% of Total</th></tr></thead>
            <tbody>
              {leaveSummary.map((l) => (
                <tr key={l.leave_type}>
                  <td>{l.leave_type}</td>
                  <td>{l.days}</td>
                  <td>{l.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
