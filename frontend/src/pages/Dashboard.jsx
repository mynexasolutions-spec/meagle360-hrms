import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDashboardSummary, getAttendanceOverview, getLeaveSummary, getLiveStatus } from '../api/dashboard';
import { getAnnouncements } from '../api/announcements';
import { getLeaveBalance, getPendingRequests } from '../api/leave';
import { getHolidays, clockIn, clockOut } from '../api/attendance';
import {
  Users, CheckCircle, Umbrella, FileClock, Megaphone, CalendarHeart,
  Clock, CalendarPlus, Upload, ArrowUpRight, Wifi,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import StatCard from '../components/StatCard';

const DONUT_COLORS = ['var(--accent-emerald)', 'var(--accent-blue)', 'var(--accent-amber)', 'var(--accent-violet)', 'var(--accent-rose)'];

export default function Dashboard() {
  const { user } = useAuth();
  const canApprove = !!user?.permissions?.['leave:approve'];
  const canSeeLiveStatus = !!user?.permissions?.['attendance:approve'];

  const [summary, setSummary] = useState(null);
  const [attendanceOverview, setAttendanceOverview] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [balances, setBalances] = useState([]);
  const [pending, setPending] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [liveStatus, setLiveStatus] = useState([]);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);

  useEffect(() => {
    getDashboardSummary().then((r) => setSummary(r.data)).catch(() => {});
    getAttendanceOverview(7).then((r) => setAttendanceOverview(r.data)).catch(() => {});
    getLeaveSummary().then((r) => setLeaveSummary(r.data)).catch(() => {});
    getAnnouncements(5).then((r) => setAnnouncements(r.data)).catch(() => {});
    getLeaveBalance().then((r) => setBalances(r.data)).catch(() => {});
    getHolidays().then((r) => setHolidays(r.data)).catch(() => {});
    if (canApprove) {
      getPendingRequests().then((r) => setPending(r.data)).catch(() => {});
    }
    if (canSeeLiveStatus) {
      getLiveStatus().then((r) => setLiveStatus(r.data)).catch(() => {});
    }
  }, [canApprove, canSeeLiveStatus]);

  const handleClock = async () => {
    setClockLoading(true);
    try {
      if (clockedIn) {
        await clockOut();
        setClockedIn(false);
      } else {
        await clockIn({ source: 'web' });
        setClockedIn(true);
      }
    } catch (e) {
      const msg = e.response?.data?.detail || '';
      if (msg.includes('already clocked in')) setClockedIn(true);
      else if (msg.includes('No open')) setClockedIn(false);
    } finally {
      setClockLoading(false);
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const today = new Date();
  const upcomingHolidays = holidays
    .filter((h) => new Date(h.holiday_date) >= new Date(today.toDateString()))
    .slice(0, 3);

  const totalLeaveDays = leaveSummary.reduce((sum, l) => sum + l.days, 0);

  const quickActions = [
    { label: clockedIn ? 'Clock Out' : 'Clock In', icon: Clock, onClick: handleClock, color: 'var(--accent-blue)' },
    { label: 'Apply Leave', icon: CalendarPlus, path: '/leave', color: 'var(--accent-emerald)' },
    { label: 'Upload Document', icon: Upload, path: '/documents', color: 'var(--accent-violet)' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>{greeting()}, {user?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p>Here's what's happening in your organization today.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {today.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid stagger-children">
        <StatCard icon={Users} label="Total Employees" value={summary?.total_employees ?? '—'} color="var(--accent-blue)" bgColor="var(--accent-blue-light)" />
        <StatCard icon={CheckCircle} label="Present Today" value={summary?.present_today ?? '—'} color="var(--accent-emerald)" bgColor="var(--accent-emerald-light)" />
        <StatCard icon={Umbrella} label="On Leave Today" value={summary?.on_leave_today ?? '—'} color="var(--accent-amber)" bgColor="var(--accent-amber-light)" />
        <StatCard icon={FileClock} label="Pending Approvals" value={summary?.pending_approvals ?? '—'} color="var(--accent-violet)" bgColor="var(--accent-violet-light)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.4fr) minmax(280px, 1fr)', gap: 20 }}>
        {/* Main column */}
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="content-grid">
            <div className="section-card">
              <h3>Attendance Overview (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={attendanceOverview}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="present" stroke="var(--accent-emerald)" strokeWidth={2} dot={{ r: 3 }} name="Present" />
                  <Line type="monotone" dataKey="absent" stroke="var(--accent-rose)" strokeWidth={2} dot={{ r: 3 }} name="Absent" />
                  <Line type="monotone" dataKey="on_leave" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 3 }} name="On Leave" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="section-card">
              <h3>Leave Summary</h3>
              {leaveSummary.length === 0 ? (
                <div className="empty-state"><Umbrella /><p>No approved leave this year yet</p></div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={leaveSummary} dataKey="days" nameKey="leave_type" innerRadius={48} outerRadius={72} paddingAngle={2}>
                          {leaveSummary.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totalLeaveDays}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Total Days</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8, flex: 1 }}>
                    {leaveSummary.map((l, i) => (
                      <div key={l.leave_type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                        <span style={{ flex: 1 }}>{l.leave_type}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{l.days} ({l.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="content-grid">
            <div className="section-card">
              <h3><Megaphone size={18} style={{ color: 'var(--accent-blue)' }} /> Recent Announcements</h3>
              {announcements.length === 0 ? (
                <div className="empty-state"><Megaphone /><p>No announcements yet</p></div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {announcements.map((a) => (
                    <div key={a.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.title}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>{a.body}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {new Date(a.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="section-card">
              <h3>My Leave Balance</h3>
              {balances.length === 0 ? (
                <div className="empty-state"><Umbrella /><p>No leave balances configured</p></div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {balances.map((b) => (
                    <div key={b.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 4 }}>
                        <span>{b.leave_type_name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{b.balance} Days</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-input)', overflow: 'hidden' }}>
                        <div style={{ width: '60%', height: '100%', background: 'var(--gradient-primary)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          <div className="section-card">
            <h3>Quick Actions</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {quickActions.map((action) => (
                <a
                  key={action.label}
                  href={action.path || '#'}
                  onClick={(e) => {
                    if (action.onClick) {
                      e.preventDefault();
                      if (!clockLoading) action.onClick();
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.8125rem',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <action.icon size={15} style={{ color: action.color }} /> {action.label}
                  </span>
                  <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
                </a>
              ))}
            </div>
          </div>

          {canSeeLiveStatus && (
            <div className="section-card">
              <h3>
                <Wifi size={18} style={{ color: 'var(--accent-emerald)' }} /> Who's Online
                {' '}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  ({liveStatus.filter((e) => e.status === 'online').length}/{liveStatus.length})
                </span>
              </h3>
              {liveStatus.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No employees found</div>
              ) : (
                <div style={{ display: 'grid', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
                  {liveStatus.map((e) => (
                    <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8125rem' }}>
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: e.status === 'online' ? 'var(--accent-emerald)' : 'var(--text-muted)',
                        }}
                      />
                      <span style={{ flex: 1, fontWeight: 500 }}>{e.full_name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {e.status === 'online'
                          ? `Since ${new Date(e.online_since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Offline'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {canApprove && (
            <div className="section-card">
              <h3>My Approvals {pending.length > 0 && <span className="badge badge-pending">{pending.length}</span>}</h3>
              {pending.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Nothing pending</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {pending.slice(0, 4).map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                      <span>{r.leave_type_name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.start_date}</span>
                    </div>
                  ))}
                  <a href="/leave" style={{ fontSize: '0.8125rem', color: 'var(--accent-blue)' }}>View all approvals</a>
                </div>
              )}
            </div>
          )}

          <div className="section-card">
            <h3><CalendarHeart size={18} style={{ color: 'var(--accent-rose)' }} /> Upcoming Holidays</h3>
            {upcomingHolidays.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No upcoming holidays</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {upcomingHolidays.map((h) => (
                  <div key={h.id}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{h.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(h.holiday_date).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
