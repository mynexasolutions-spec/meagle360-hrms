import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getEmployeeOverview } from '../api/attendance';

const isoDate = (d) => d.toLocaleDateString('en-CA');

function dayNote(day) {
  if (day.leave?.status === 'approved') return 'On leave';
  if (day.sessions.some((s) => !s.clock_out)) return `${day.total_hours} h (not clocked out)`;
  if (day.sessions.length > 0) return `${day.total_hours} h`;
  return day.holiday ? 'Holiday' : 'No attendance';
}

function DayTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { date, note } = payload[0].payload;
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 12px', fontSize: 12 }}>
      <strong>{date}</strong><div>{note}</div>
    </div>
  );
}

// The employee's own last 7 days, in place of the company-wide chart.
export default function MyAttendanceChart({ employeeId }) {
  const [days, setDays] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!employeeId) return undefined;
    let stale = false;
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    const months = [from];
    if (from.getMonth() !== today.getMonth()) months.push(today);
    Promise.all(months.map((m) => getEmployeeOverview({
      employee_id: employeeId, year: m.getFullYear(), month: m.getMonth() + 1,
    })))
      .then((responses) => {
        if (stale) return;
        setDays(responses.flatMap((r) => r.data.days)
          .filter((d) => d.date >= isoDate(from) && d.date <= isoDate(today))
          .map((d) => ({ date: d.date, hours: d.total_hours, note: dayNote(d) })));
      })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [employeeId]);

  return (
    <div className="dashboard-card">
      <div className="attendance-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#047857', flexShrink: 0 }}>
            <Activity size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 className="dashboard-card-title">My Attendance (Last 7 Days)</h3>
            <p className="dashboard-card-sub">Hours worked each day</p>
          </div>
        </div>
        <Link to="/attendance" style={{ fontSize: '0.8125rem', color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none' }}>
          View all
        </Link>
      </div>
      <div className="dashboard-chart-box">
        {failed || !employeeId ? (
          <div className="empty-state"><p>{failed ? 'Could not load your attendance' : 'No employee record linked to this login'}</p></div>
        ) : days && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date" tick={{ fontSize: 12, fill: '#475569' }}
                tickFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} unit="h" width={56} domain={[0, (max) => Math.max(8, Math.ceil(max))]} />
              <Tooltip content={<DayTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="hours" name="Hours" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
