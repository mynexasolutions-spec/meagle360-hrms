import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardSummary, getAttendanceOverview, getLeaveSummary, getLiveStatus, getLeaveInsight, getOnLeaveToday } from '../api/dashboard';
import { getAnnouncements, createAnnouncement } from '../api/announcements';
import { getLeaveBalance, getPendingRequests } from '../api/leave';
import { getHolidays, clockIn, clockOut, getEmployeeOverview, getClockStatus } from '../api/attendance';
import {
  Users, CheckCircle, Umbrella, FileClock, Megaphone, CalendarHeart,
  Clock, CalendarPlus, Upload, ArrowUpRight, Wifi, Plus,
  Palmtree, Heart, Ticket, Sparkles, Baby, Gift,
  CheckCircle2, AlertTriangle, Info, Sun, Sunset, Moon,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';

const DONUT_COLORS = ['var(--accent-emerald)', 'var(--accent-blue)', 'var(--accent-amber)', 'var(--accent-violet)', 'var(--accent-rose)'];

const LEAVE_TYPE_STYLES = [
  { match: /annual/i, icon: Palmtree, color: 'var(--accent-emerald)', bg: 'var(--accent-emerald-light)' },
  { match: /sick/i, icon: Heart, color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)' },
  { match: /casual/i, icon: Ticket, color: 'var(--accent-amber)', bg: 'var(--accent-amber-light)' },
  { match: /matern|patern/i, icon: Baby, color: 'var(--accent-rose)', bg: 'var(--accent-rose-light)' },
];
const DEFAULT_LEAVE_STYLE = { icon: Sparkles, color: 'var(--accent-violet)', bg: 'var(--accent-violet-light)' };

function getLeaveTypeStyle(name) {
  return LEAVE_TYPE_STYLES.find((s) => s.match.test(name || '')) || DEFAULT_LEAVE_STYLE;
}

function getAnnouncementStyle(title) {
  if (/birthday/i.test(title || '')) {
    return { icon: Gift, color: 'var(--accent-amber)', bg: 'var(--accent-amber-light)' };
  }
  return { icon: Megaphone, color: 'var(--accent-violet)', bg: 'var(--accent-violet-light)' };
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

const INSIGHT_STYLES = {
  good: { icon: CheckCircle2, color: 'var(--accent-emerald)', bg: 'var(--accent-emerald-light)' },
  neutral: { icon: Info, color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)' },
  warning: { icon: AlertTriangle, color: 'var(--accent-amber)', bg: 'var(--accent-amber-light)' },
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Dashboard() {
  const { user } = useAuth();
  const canApprove = !!user?.permissions?.['leave:approve'];
  const canSeeLiveStatus = !!user?.permissions?.['attendance:approve'];
  const canPostAnnouncement = !!user?.permissions?.['settings:write'];

  const [summary, setSummary] = useState(null);
  const [attendanceOverview, setAttendanceOverview] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState([]);
  const [leaveInsight, setLeaveInsight] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [balances, setBalances] = useState([]);
  const [pending, setPending] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [todayClockInTime, setTodayClockInTime] = useState(null);
  const [todayPunctuality, setTodayPunctuality] = useState('On Time');
  const [shiftInfo, setShiftInfo] = useState(null);
  const [liveStatus, setLiveStatus] = useState([]);
  const [onLeaveToday, setOnLeaveToday] = useState([]);
  const [whosOnlineExpanded, setWhosOnlineExpanded] = useState(false);
  const [announcementLimit, setAnnouncementLimit] = useState(5);
  const [showNewAnnouncement, setShowNewAnnouncement] = useState(false);

  const loadAnnouncements = (limit = announcementLimit) => getAnnouncements(limit).then((r) => setAnnouncements(r.data)).catch(() => { });

  useEffect(() => {
    getDashboardSummary().then((r) => setSummary(r.data)).catch(() => { });
    getAttendanceOverview(7).then((r) => setAttendanceOverview(r.data)).catch(() => { });
    getLeaveSummary().then((r) => setLeaveSummary(r.data)).catch(() => { });
    getLeaveInsight().then((r) => setLeaveInsight(r.data)).catch(() => { });
    getLeaveBalance().then((r) => setBalances(r.data)).catch(() => { });
    getHolidays().then((r) => setHolidays(r.data)).catch(() => { });
    if (canApprove) {
      getPendingRequests().then((r) => setPending(r.data)).catch(() => { });
    }
    if (canSeeLiveStatus) {
      getLiveStatus().then((r) => setLiveStatus(r.data)).catch(() => { });
      getOnLeaveToday().then((r) => setOnLeaveToday(r.data)).catch(() => { });
    }
    if (user?.employee_id) {
      const now = new Date();
      getClockStatus().then((r) => setClockedIn(!!r.data?.clocked_in)).catch(() => { });
      getEmployeeOverview({ employee_id: user.employee_id, year: now.getFullYear(), month: now.getMonth() + 1 })
        .then((r) => {
          setShiftInfo(r.data?.shift_info || null);
          const today = now.toISOString().slice(0, 10);
          const todayRow = r.data?.days?.find((d) => d.date === today);
          if (todayRow?.sessions?.length > 0) {
            setTodayClockInTime(todayRow.sessions[0].clock_in);
            setTodayPunctuality(todayRow.sessions[0].punctuality_status || 'On Time');
          } else {
            setTodayPunctuality('Not Clocked In');
          }
        })
        .catch(() => { });
    }
  }, [user]);

  useEffect(() => {
    loadAnnouncements(announcementLimit);
  }, [announcementLimit]);

  const handleCreateAnnouncement = async (title, body) => {
    await createAnnouncement({ title, body });
    await loadAnnouncements(announcementLimit);
    setShowNewAnnouncement(false);
  };

  const handleClock = async () => {
    setClockLoading(true);
    try {
      if (clockedIn) {
        await clockOut({});
        setClockedIn(false);
      } else {
        await clockIn({ source: 'web' });
        setClockedIn(true);
      }
    } catch (e) {
      alert(e.response?.data?.detail || `Failed to clock ${clockedIn ? 'out' : 'in'}`);
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

  const greetingStyle = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return { icon: Sun, color: '#f59e0b', bg: '#fffbeb' };
    if (hour < 17) return { icon: Sunset, color: '#2563eb', bg: '#eff6ff' };
    return { icon: Moon, color: '#7c3aed', bg: '#f5f3ff' };
  })();

  const today = new Date();
  const upcomingHolidays = holidays
    .filter((h) => new Date(h.holiday_date) >= new Date(today.toDateString()))
    .slice(0, 3);
  const totalLeaveDays = leaveSummary.reduce((sum, l) => sum + l.days, 0);
  const quickActions = [
    { label: clockedIn ? 'Clock Out' : 'Clock In', icon: Clock, onClick: handleClock, color: '#2563eb', bg: '#eff6ff' },
    { label: 'Apply Leave', icon: CalendarPlus, path: '/leave', color: '#059669', bg: '#ecfdf5' },
    { label: 'Upload Document', icon: Upload, path: '/documents', color: '#7c3aed', bg: '#f5f3ff' },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 16, flexShrink: 0,
              background: greetingStyle.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 14px ${greetingStyle.color}22`,
            }}
          >
            <greetingStyle.icon size={22} style={{ color: greetingStyle.color }} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800,
                background: 'linear-gradient(135deg, #0f172a, #2563eb)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}
            >
              {greeting()}, {user?.full_name?.split(' ')[0] || 'there'}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Here's what's happening in your organization today.</p>
          </div>
        </div>
        <div className="dashboard-date-block" style={{ textAlign: 'right', padding: '10px 16px', borderRadius: 14, background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
            {today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 2 }}>
            {today.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })}
          </div>
        </div>
      </div>

      <div className="clock-strip" style={{ background: '#ffffff', borderRadius: 24, padding: '18px 28px', marginBottom: 28, boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: todayClockInTime ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #94a3b8, #64748b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: todayClockInTime ? '0 4px 14px rgba(16, 185, 129, 0.3)' : '0 4px 14px rgba(100, 116, 139, 0.2)',
            }}
          >
            <Clock size={20} color="#ffffff" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {todayClockInTime ? new Date(todayClockInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:-- --'}
          </div>
          <div style={{ height: 28, width: 1, backgroundColor: '#e2e8f0', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shift Timing</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              {shiftInfo?.start_time ? `${shiftInfo.start_time} - ${shiftInfo.end_time}` : '09:00 AM - 06:00 PM (Default)'}
            </span>
          </div>
          {todayClockInTime && (
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, padding: '4px 14px', borderRadius: 12, backgroundColor: todayPunctuality === 'Late' ? '#fee2e2' : '#e0f2fe', color: todayPunctuality === 'Late' ? '#dc2626' : '#0369a1' }}>
              {todayPunctuality}
            </span>
          )}
        </div>
        <div className="clock-strip-badge" style={{ marginLeft: 'auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: todayClockInTime ? '#dcfce7' : '#f8fafc', color: todayClockInTime ? '#15803d' : '#64748b', border: `1px solid ${todayClockInTime ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 20, padding: '6px 16px', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            <CheckCircle2 size={15} />
            <span>{todayClockInTime ? 'Attendance Marked' : 'Pending Clock In'}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 28 }}>
        <StatCard icon={Users} label="Total Employees" value={summary?.total_employees ?? '—'} bgColor="#eff6ff" color="#2563eb" />
        <StatCard icon={CheckCircle} label="Present Today" value={summary?.present_today ?? '—'} bgColor="#ecfdf5" color="#059669" />
        <StatCard icon={Umbrella} label="On Leave Today" value={summary?.on_leave_today ?? '—'} bgColor="#fffbeb" color="#d97706" />
        <StatCard icon={FileClock} label="Pending Approvals" value={summary?.pending_approvals ?? '—'} bgColor="#f5f3ff" color="#7c3aed" />
      </div>

      <div className="dashboard-columns">
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="content-grid">
            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: '24px',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #059669',
                boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
              }}
            >
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Attendance Overview (Last 7 Days)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={attendanceOverview}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.05)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="present" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: '#059669' }} name="Present" />
                  <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: '#ef4444' }} name="Absent" />
                  <Line type="monotone" dataKey="on_leave" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb' }} name="On Leave" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: '24px',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #7c3aed',
                boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
              }}
            >
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Leave Summary</h3>
              {leaveSummary.length === 0 ? (
                <div className="empty-state"><Umbrella /><p>No approved leave this year yet</p></div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Total Leaves</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 140 }}>
                    {leaveSummary.map((l, i) => (
                      <div key={l.leave_type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                        <span className="truncate" style={{ flex: 1, minWidth: 0 }}>{l.leave_type}</span>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.percentage}% ({l.days})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {leaveInsight && (() => {
                const style = INSIGHT_STYLES[leaveInsight.level] || INSIGHT_STYLES.neutral;
                return (
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
                      padding: '10px 12px', borderRadius: 'var(--radius-md)',
                      background: style.bg, color: style.color, fontSize: '0.8125rem', fontWeight: 500,
                    }}
                  >
                    <style.icon size={16} style={{ flexShrink: 0 }} />
                    <span>{leaveInsight.message}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="content-grid">
            <div className="section-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h3 style={{ marginBottom: 0 }}>Recent Announcements</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {canPostAnnouncement && (
                    <button className="btn-icon btn-ghost" title="New Announcement" onClick={() => setShowNewAnnouncement(true)}>
                      <Plus size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setAnnouncementLimit((n) => (n > 5 ? 5 : 15))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.8125rem', fontWeight: 500, padding: 0 }}
                  >
                    {announcementLimit > 5 ? 'Show less' : 'View all'}
                  </button>
                </div>
              </div>
              {announcements.length === 0 ? (
                <div className="empty-state"><Megaphone /><p>No announcements yet</p></div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {announcements.map((a) => {
                    const style = getAnnouncementStyle(a.title);
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex', gap: 12, padding: 12,
                          borderRadius: 'var(--radius-md)', background: 'var(--bg-input)',
                        }}
                      >
                        <div
                          style={{
                            width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: style.bg, color: style.color,
                          }}
                        >
                          <style.icon size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.title}</div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>{a.body}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            {timeAgo(a.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="section-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h3 style={{ marginBottom: 0 }}>My Leave Balance</h3>
                <Link to="/leave" style={{ color: 'var(--accent-blue)', fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none' }}>
                  View all
                </Link>
              </div>
              {balances.length === 0 ? (
                <div className="empty-state"><Umbrella /><p>No leave balances configured</p></div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {balances.map((b) => {
                    const style = getLeaveTypeStyle(b.leave_type_name);
                    const total = b.annual_entitlement && Number(b.annual_entitlement) > 0 ? Number(b.annual_entitlement) : null;
                    const balanceNum = Number(b.balance);
                    const pct = total ? Math.max(0, Math.min(100, (balanceNum / total) * 100)) : 100;
                    return (
                      <div key={b.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: style.bg, color: style.color,
                          }}
                        >
                          <style.icon size={17} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 6 }}>
                            <span style={{ fontWeight: 500 }}>{b.leave_type_name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {balanceNum.toFixed(0)}{total ? ` / ${total.toFixed(0)}` : ''} days
                            </span>
                          </div>
                          <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-input)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: style.color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                  className="quick-action-row"
                  onClick={(e) => {
                    if (action.onClick) {
                      e.preventDefault();
                      if (!clockLoading) action.onClick();
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: action.bg, border: '1px solid transparent',
                    color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.8125rem',
                    fontWeight: 500,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <action.icon size={15} style={{ color: action.color }} /> {action.label}
                  </span>
                  <ArrowUpRight size={14} style={{ color: action.color }} />
                </a>
              ))}
            </div>
          </div>

          {canSeeLiveStatus && (() => {
            const statusColor = { online: 'var(--accent-emerald)', present: 'var(--accent-amber)', offline: 'var(--text-muted)' };
            const present = (typeof liveStatus !== 'undefined' && Array.isArray(liveStatus)) ? liveStatus.filter((e) => e.status !== 'offline') : [];
            const shown = present.slice(0, 5);
            const overflow = present.length - shown.length;
            return (
              <div className="section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ marginBottom: 0 }}>
                    <Wifi size={18} style={{ color: 'var(--accent-emerald)' }} /> Present Today
                  </h3>
                  <button
                    onClick={() => setWhosOnlineExpanded((v) => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.8125rem', fontWeight: 500, padding: 0 }}
                  >
                    {whosOnlineExpanded ? 'Show less' : 'View all'}
                  </button>
                </div>
                {liveStatus.length === 0 ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No employees found</div>
                ) : !whosOnlineExpanded ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                      {shown.map((e, i) => (
                        <div
                          key={e.employee_id}
                          title={`${e.full_name} — ${e.status === 'online' ? 'clocked in' : 'present, clocked out'}`}
                          style={{
                            position: 'relative', width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                            marginLeft: i === 0 ? 0 : -10,
                            border: '2px solid var(--bg-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: e.photo_url ? `center/cover no-repeat url(${e.photo_url})` : 'var(--accent-emerald-light)',
                            color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 600,
                          }}
                        >
                          {!e.photo_url && initials(e.full_name)}
                          <span
                            style={{
                              position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%',
                              background: statusColor[e.status], border: '2px solid var(--bg-secondary)',
                            }}
                          />
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div
                          style={{
                            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginLeft: -10,
                            border: '2px solid var(--bg-secondary)', background: 'var(--bg-input)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', fontSize: '0.6875rem', fontWeight: 600,
                          }}
                        >
                          +{overflow}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 10 }}>
                      {present.length} of {liveStatus.length} employees present today
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'grid', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
                    {liveStatus.map((e) => (
                      <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8125rem' }}>
                        <span
                          style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: statusColor[e.status],
                          }}
                        />
                        <span style={{ flex: 1, fontWeight: 500 }}>{e.full_name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {e.status === 'online' && `Since ${new Date(e.online_since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          {e.status === 'present' && 'Clocked out'}
                          {e.status === 'offline' && 'Offline'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {canApprove && (
            <div className="section-card">
              <h3>My Approvals {pending.length > 0 && <span className="badge badge-pending">{pending.length}</span>}</h3>
              {pending.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Nothing pending</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {pending.slice(0, 4).map((r) => (
                    <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8125rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>{r.employee_name || 'Unknown employee'}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{r.start_date}</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.leave_type_name}</span>
                    </div>
                  ))}
                  <a href="/leave" style={{ fontSize: '0.8125rem', color: 'var(--accent-blue)' }}>View all approvals</a>
                </div>
              )}
            </div>
          )}

          {canSeeLiveStatus && (
            <div className="section-card">
              <h3>
                <Umbrella size={18} style={{ color: 'var(--accent-amber)' }} /> On Leave Today
                {onLeaveToday.length > 0 && <span className="badge badge-pending">{onLeaveToday.length}</span>}
              </h3>
              {onLeaveToday.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No one is on leave today</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {onLeaveToday.map((e) => (
                    <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8125rem' }}>
                      <div
                        style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: e.photo_url ? `center/cover no-repeat url(${e.photo_url})` : 'var(--accent-amber-light)',
                          color: 'var(--accent-amber)', fontSize: '0.6875rem', fontWeight: 600,
                        }}
                      >
                        {!e.photo_url && initials(e.full_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{e.full_name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{e.department_name || '—'}</div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'right' }}>{e.leave_type_name}</span>
                    </div>
                  ))}
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

      {showNewAnnouncement && (
        <NewAnnouncementModal
          onClose={() => setShowNewAnnouncement(false)}
          onSubmit={handleCreateAnnouncement}
        />
      )}
    </div>
  );
}

function NewAnnouncementModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(title, body);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to post announcement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Announcement" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ marginBottom: 12, color: 'var(--accent-rose)', fontSize: '0.875rem' }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Title</label>
          <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="input-group">
          <label className="input-label">Message</label>
          <textarea
            className="input-field"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Visible to every employee at this company on their Dashboard.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Posting...' : 'Post Announcement'}</button>
        </div>
      </form>
    </Modal>
  );
}
