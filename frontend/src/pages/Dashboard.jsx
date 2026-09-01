import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardSummary, getAttendanceOverview, getLeaveSummary, getLiveStatus, getLeaveInsight, getOnLeaveToday } from '../api/dashboard';
import { getAnnouncements, createAnnouncement } from '../api/announcements';
import { getLeaveBalance, getPendingRequests } from '../api/leave';
import { getHolidays, clockIn, clockOut, getEmployeeOverview, getClockStatus } from '../api/attendance';
import {
  Users, CheckCircle, Umbrella, FileClock, Megaphone, CalendarHeart,
  Clock, CalendarPlus, Upload, Wifi, Plus, UserPlus, DollarSign,
  Palmtree, Heart, Ticket, Sparkles, Baby, Gift, Activity,
  CheckCircle2, AlertTriangle, Info, Sun, Sunset, Moon,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';

const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

const LEAVE_TYPE_STYLES = [
  { match: /annual/i, icon: Palmtree, color: 'var(--accent-emerald)', bg: 'var(--accent-emerald-light)' },
  { match: /sick/i, icon: Heart, color: 'var(--accent-blue)', bg: 'var(--accent-blue-light)' },
  { match: /casual/i, icon: Ticket, color: 'var(--accent-amber)', bg: 'var(--accent-amber-light)' },
  { match: /parent|matern|patern/i, icon: Baby, color: 'var(--accent-rose)', bg: 'var(--accent-rose-light)' },
];
const DEFAULT_LEAVE_STYLE = { icon: Sparkles, color: 'var(--accent-violet)', bg: 'var(--accent-violet-light)' };

function formatLeaveTypeName(name) {
  if (!name) return 'Other';
  const clean = name.trim();
  if (/matern|patern|parent/i.test(clean)) return 'Parental Leave';
  if (/personal/i.test(clean)) return 'Personal Leave';
  if (/sick/i.test(clean)) return 'Sick Leave';
  if (/annual/i.test(clean)) return 'Annual Leave';
  if (/casual/i.test(clean)) return 'Casual Leave';
  if (/loss\s*of\s*pay|lop/i.test(clean)) return 'Loss of Pay';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

function processLeaveSummary(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const map = new Map();
  let totalDays = 0;

  data.forEach((item) => {
    const formattedName = formatLeaveTypeName(item.leave_type);
    const days = Number(item.days) || 0;
    totalDays += days;
    if (map.has(formattedName)) {
      map.get(formattedName).days += days;
    } else {
      map.set(formattedName, { leave_type: formattedName, days });
    }
  });

  const merged = Array.from(map.values());
  return merged.map((item) => ({
    ...item,
    percentage: totalDays > 0 ? ((item.days / totalDays) * 100).toFixed(1) : '0.0',
  }));
}

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
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'super_admin' || canApprove;

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
  const [workforceTab, setWorkforceTab] = useState('present');
  const [announcementLimit, setAnnouncementLimit] = useState(50);
  const [showNewAnnouncement, setShowNewAnnouncement] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);

  const loadAnnouncements = (limit = announcementLimit) => getAnnouncements(limit).then((r) => setAnnouncements(r.data)).catch(() => { });

  useEffect(() => {
    getDashboardSummary().then((r) => setSummary(r.data)).catch(() => { });
    getAttendanceOverview(7).then((r) => setAttendanceOverview(r.data)).catch(() => { });
    getLeaveSummary().then((r) => setLeaveSummary(processLeaveSummary(r.data))).catch(() => { });
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
    .slice(0, 4);
  const totalLeaveDays = leaveSummary.reduce((sum, l) => sum + l.days, 0);

  const presentList = Array.isArray(liveStatus) ? liveStatus.filter((e) => e.status !== 'offline') : [];

  const quickActions = isAdminOrManager ? [
    { label: 'Add New Employee', icon: UserPlus, path: '/employees', color: '#2563eb', bg: '#eff6ff' },
    { label: `Review Approvals ${pending.length > 0 ? `(${pending.length})` : ''}`, icon: FileClock, path: '/leave', color: '#d97706', bg: '#fffbeb' },
    { label: 'Payroll Overview', icon: DollarSign, path: '/payroll', color: '#059669', bg: '#ecfdf5' },
    { label: 'Apply Leave', icon: CalendarPlus, path: '/leave', color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Upload Document', icon: Upload, path: '/documents', color: '#0891b2', bg: '#ecfeff' },
  ] : [
    { label: clockedIn ? 'Clock Out' : 'Clock In', icon: Clock, onClick: handleClock, color: '#2563eb', bg: '#eff6ff' },
    { label: 'Apply Leave', icon: CalendarPlus, path: '/leave', color: '#059669', bg: '#ecfdf5' },
    { label: 'My Payslips', icon: DollarSign, path: '/my-payslips', color: '#d97706', bg: '#fffbeb' },
    { label: 'Employee Directory', icon: Users, path: '/employees', color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Upload Document', icon: Upload, path: '/documents', color: '#0891b2', bg: '#ecfeff' },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1400, margin: '0 auto' }}>
      
      {/* 1. Header with integrated Clock In / Status */}
      <div className="page-header" style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
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
                color: '#0f172a',
                WebkitTextFillColor: '#0f172a',
                margin: 0,
              }}
            >
              {greeting()}, {user?.full_name?.split(' ')[0] || 'there'}
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '2px 0 0 0' }}>Here's what's happening in your organization today.</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {user?.employee_id && (
            <button
              onClick={handleClock}
              disabled={clockLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 16px', borderRadius: 12,
                background: clockedIn ? '#fee2e2' : '#eff6ff',
                color: clockedIn ? '#dc2626' : '#2563eb',
                border: `1.5px solid ${clockedIn ? '#fca5a5' : '#bfdbfe'}`,
                fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                transition: 'all 0.2s ease',
              }}
              title={shiftInfo?.start_time ? `Shift: ${shiftInfo.start_time} - ${shiftInfo.end_time}` : '09:00 AM - 06:00 PM'}
            >
              <Clock size={16} />
              <span>{clockLoading ? 'Processing...' : clockedIn ? 'Clock Out' : 'Clock In'}</span>
              {todayClockInTime && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.85, paddingLeft: 6, borderLeft: `1px solid ${clockedIn ? '#fca5a5' : '#bfdbfe'}` }}>
                  {new Date(todayClockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </button>
          )}

          <div className="dashboard-date-block" style={{ textAlign: 'right', padding: '8px 16px', borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
              {today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 1 }}>
              {today.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top 4 Rich KPI Stat Cards */}
      <div className="dashboard-stats-grid">
        <StatCard
          icon={Users}
          label="Total Employees"
          value={summary?.total_employees ?? '—'}
          trend="Active workforce"
          trendDirection="up"
          bgColor="#eff6ff"
          color="#2563eb"
        />
        <StatCard
          icon={CheckCircle}
          label="Present Today"
          value={summary?.present_today ?? 0}
          trend={summary?.total_employees ? `${Math.round(((summary?.present_today || 0) / (summary?.total_employees || 1)) * 100)}% attendance rate` : 'Today'}
          trendDirection={(summary?.present_today || 0) > 0 ? 'up' : 'down'}
          bgColor="#ecfdf5"
          color="#059669"
        />
        <StatCard
          icon={Umbrella}
          label="On Leave Today"
          value={summary?.on_leave_today ?? 0}
          trend="Approved leaves"
          trendDirection="up"
          bgColor="#fffbeb"
          color="#d97706"
        />
        <StatCard
          icon={FileClock}
          label="Pending Approvals"
          value={summary?.pending_approvals ?? 0}
          trend={summary?.pending_approvals > 0 ? 'Requires attention' : 'All clear'}
          trendDirection={summary?.pending_approvals > 0 ? 'down' : 'up'}
          bgColor="#f5f3ff"
          color="#7c3aed"
        />
      </div>

      {/* 3. Main Dashboard Rows (Symmetrical Row Architecture) */}
      <div style={{ display: 'grid', gap: 20 }}>
        
        {/* Row 1: Attendance Hero Chart (Left) + Quick Actions (Right) */}
        <div className="dashboard-columns">
          {/* Attendance Overview Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: '22px 24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                  <Activity size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Attendance Overview (Last 7 Days)</h3>
                  <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '2px 0 0 0' }}>Daily presence, absence, and leave trends across your organization</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#059669', background: '#ecfdf5', padding: '4px 12px', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                  Present: {summary?.present_today ?? 0}
                </span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#d97706', background: '#fffbeb', padding: '4px 12px', borderRadius: 8, border: '1px solid #fde68a' }}>
                  On Leave: {summary?.on_leave_today ?? 0}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={attendanceOverview} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="absentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.18}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="leaveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area type="monotone" dataKey="present" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#presentGrad)" name="Present" />
                <Area type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#absentGrad)" name="Absent" />
                <Area type="monotone" dataKey="on_leave" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#leaveGrad)" name="On Leave" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Actions (Admin / Manager Tailored) */}
          <div className="section-card" style={{ borderRadius: 20, padding: '20px 22px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Quick Actions</h3>
            <div style={{ display: 'grid', gap: 8, flex: 1, alignContent: 'space-between' }}>
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
                    padding: '9px 13px', borderRadius: 12,
                    background: action.bg, border: '1px solid transparent',
                    color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.8125rem',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <action.icon size={15} style={{ color: action.color }} /> {action.label}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Mid Content -> [Leave Summary + Announcements] (Left) & [Workforce Pulse + Approvals] (Right) */}
        <div className="dashboard-columns">
          
          {/* Left: Content Grid for Leave Summary & Announcements */}
          <div className="content-grid" style={{ height: '100%' }}>
            
            {/* Left Card: Leave Summary (Rich Executive Distribution Card) */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: '22px 24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                      <Umbrella size={17} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Leave Summary</h3>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '1px 0 0 0' }}>YTD organization-wide leaves</p>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '3px 10px', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    Active Year
                  </span>
                </div>

                {leaveSummary.length === 0 ? (
                  <div className="empty-state"><Umbrella /><p>No approved leave this year yet</p></div>
                ) : (
                  <div>
                    {/* Top: Donut Chart + Segmented Distribution Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                      <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={leaveSummary} dataKey="days" nameKey="leave_type" innerRadius={42} outerRadius={51} paddingAngle={3} stroke="none">
                              {leaveSummary.map((_, i) => (
                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>{totalLeaveDays}</div>
                          <div style={{ fontSize: '0.625rem', color: '#64748b', fontWeight: 700, marginTop: 3 }}>Total Days</div>
                        </div>
                      </div>

                      {/* Segmented Color Bar & Top Utilization */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Distribution</span>
                          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 5 }}>
                            {leaveSummary.length} Types
                          </span>
                        </div>
                        {/* Segmented Bar */}
                        <div style={{ height: 8, borderRadius: 8, background: '#f1f5f9', display: 'flex', overflow: 'hidden', gap: 2 }}>
                          {leaveSummary.map((l, i) => (
                            <div
                              key={l.leave_type}
                              style={{
                                width: `${Math.max(6, l.percentage)}%`,
                                height: '100%',
                                background: DONUT_COLORS[i % DONUT_COLORS.length],
                                borderRadius: 4,
                              }}
                              title={`${l.leave_type}: ${l.days}d (${l.percentage}%)`}
                            />
                          ))}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Top: <strong style={{ color: '#0f172a' }}>{formatLeaveTypeName(leaveSummary[0]?.leave_type).replace(' Leave', '')} ({leaveSummary[0]?.percentage}%)</strong>
                        </div>
                      </div>
                    </div>

                    {/* Middle: 4 Rich Colored Category Tiles (Neat & Non-Overflowing) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      {leaveSummary.map((l, i) => {
                        const style = getLeaveTypeStyle(l.leave_type);
                        const color = DONUT_COLORS[i % DONUT_COLORS.length];
                        return (
                          <div
                            key={l.leave_type}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              padding: '8px 10px',
                              borderRadius: 11,
                              background: style.bg || 'var(--bg-input)',
                              border: `1px solid ${color}35`,
                              minHeight: 60,
                              boxSizing: 'border-box',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            }}
                          >
                            {/* Line 1: Icon + Full Category Title */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', minWidth: 0 }}>
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: 5,
                                  background: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: color,
                                  flexShrink: 0,
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                              >
                                <style.icon size={10} />
                              </div>
                              <span
                                style={{
                                  fontSize: '0.69rem',
                                  fontWeight: 700,
                                  color: '#0f172a',
                                  whiteSpace: 'nowrap',
                                  letterSpacing: '-0.02em',
                                }}
                              >
                                {l.leave_type}
                              </span>
                            </div>

                            {/* Line 2: Big Bold Days Count + Percentage Badge */}
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4, width: '100%' }}>
                              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                                {l.days} <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>days</span>
                              </span>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  color: color,
                                  background: '#ffffff',
                                  padding: '1px 5px',
                                  borderRadius: 5,
                                  border: `1px solid ${color}30`,
                                }}
                              >
                                {l.percentage}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}
              </div>

              {/* Organization Leave Health Insight Strip */}
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.73rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Org Balance: <strong style={{ color: '#059669' }}>88% intact</strong>
                  </span>
                </div>
                <Link to="/leave" style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--accent-blue)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Leave Policy
                </Link>
              </div>
            </div>

            {/* Right Card: Recent Announcements */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: 20,
                padding: '22px 24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#db2777', flexShrink: 0 }}>
                      <Megaphone size={17} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Announcements</h3>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '1px 0 0 0' }}>Recent company broadcasts</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 16 }}>
                    {isAdminOrManager && (
                      <button
                        onClick={() => setShowNewAnnouncement(true)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '4px 8px', borderRadius: 8, border: '1px solid #cbd5e1',
                          background: '#ffffff', color: '#334155', cursor: 'pointer',
                          fontSize: '0.75rem', fontWeight: 600,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                        title="Post Announcement"
                      >
                        <Plus size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setShowAllAnnouncements(true)}
                      style={{
                        color: 'var(--accent-blue)', fontSize: '0.8125rem', fontWeight: 600,
                        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                      }}
                    >
                      View all
                    </button>
                  </div>
                </div>

                {announcements.length === 0 ? (
                  <div className="empty-state"><Megaphone /><p>No announcements posted yet</p></div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {announcements.slice(0, 2).map((a) => (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAnnouncement(a)}
                        style={{
                          display: 'flex', gap: 12, alignItems: 'flex-start',
                          padding: '10px 14px', borderRadius: 12,
                          background: 'var(--bg-input)', border: '1px solid #f1f5f9',
                          cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        className="quick-action-row"
                        title="Click to view full announcement"
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0, marginTop: 2 }}>
                          <Megaphone size={13} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.title}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.body}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.6875rem', marginTop: 4 }}>
                            {new Date(a.created_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Broadcast Footer */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 8,
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: '0.71rem', color: '#94a3b8' }}>Latest updates</span>
                <button
                  onClick={() => setShowAllAnnouncements(true)}
                  style={{
                    fontSize: '0.73rem', fontWeight: 700, color: 'var(--accent-blue)',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  Broadcast Center
                </button>
              </div>
            </div>

          </div>

          {/* Right: Workforce Pulse + My Approvals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', justifyContent: 'space-between' }}>
            
            {/* Unified Workforce Pulse */}
            {canSeeLiveStatus && (
              <div className="section-card" style={{ borderRadius: 20, padding: '20px 22px', border: '1px solid #e2e8f0', background: '#ffffff', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Workforce Pulse</h3>
                  <div style={{ display: 'flex', background: 'var(--bg-input)', padding: 3, borderRadius: 10, gap: 3 }}>
                    <button
                      onClick={() => setWorkforceTab('present')}
                      style={{
                        border: 'none', background: workforceTab === 'present' ? '#ffffff' : 'transparent',
                        color: workforceTab === 'present' ? '#059669' : '#64748b',
                        padding: '3px 9px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: workforceTab === 'present' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      Present
                    </button>
                    <button
                      onClick={() => setWorkforceTab('leave')}
                      style={{
                        border: 'none', background: workforceTab === 'leave' ? '#ffffff' : 'transparent',
                        color: workforceTab === 'leave' ? '#d97706' : '#64748b',
                        padding: '3px 9px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: workforceTab === 'leave' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      On Leave
                    </button>
                  </div>
                </div>

                {workforceTab === 'present' ? (
                  <div>
                    {presentList.length === 0 ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                        No employees clocked in yet today.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10, maxHeight: 180, overflowY: 'auto' }}>
                        {presentList.map((e) => (
                          <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8125rem' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontWeight: 600 }}>{e.full_name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {e.online_since ? `Since ${new Date(e.online_since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Clocked in'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {onLeaveToday.length === 0 ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                        No one is on leave today.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10, maxHeight: 180, overflowY: 'auto' }}>
                        {onLeaveToday.map((e) => (
                          <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8125rem' }}>
                            <div
                              style={{
                                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: e.photo_url ? `center/cover no-repeat url(${e.photo_url})` : '#fffbeb',
                                color: '#d97706', fontSize: '0.6875rem', fontWeight: 700, border: '1px solid #fde68a',
                              }}
                            >
                              {!e.photo_url && initials(e.full_name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{e.full_name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{e.department_name || 'Staff'}</div>
                            </div>
                            <span style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: 600, background: '#fffbeb', padding: '2px 8px', borderRadius: 6 }}>
                              {formatLeaveTypeName(e.leave_type_name)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Pending Approvals */}
            {canApprove && (
              <div className="section-card" style={{ borderRadius: 20, padding: '20px 22px', border: '1px solid #e2e8f0', background: '#ffffff', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      My Approvals
                    </h3>
                    {pending.length > 0 && <span className="badge badge-pending">{pending.length}</span>}
                  </div>
                  {pending.length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Nothing pending review</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {pending.slice(0, 3).map((r) => (
                        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8125rem', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-input)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600 }}>{r.employee_name || 'Unknown employee'}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.start_date}</span>
                          </div>
                          <span style={{ color: '#7c3aed', fontSize: '0.75rem', fontWeight: 600 }}>{formatLeaveTypeName(r.leave_type_name)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {pending.length > 0 && (
                  <Link to="/leave" style={{ fontSize: '0.8125rem', color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none', marginTop: 8 }}>
                    View all approvals
                  </Link>
                )}
              </div>
            )}

          </div>

        </div>

        {/* Row 3: Bottom Row -> My Leave Balance (Left) & Upcoming Holidays (Right) */}
        <div className="dashboard-columns">
          
          {/* Left: My Leave Balance (Clean 3+2 Symmetrical Grid) */}
          <div className="section-card" style={{ borderRadius: 20, padding: '22px 24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <Sparkles size={17} />
                </div>
                <div>
                  <h3 style={{ marginBottom: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>My Leave Balance</h3>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '1px 0 0 0' }}>Your personal allocated leave entitlements</p>
                </div>
              </div>
              <Link to="/leave" style={{ color: 'var(--accent-blue)', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'none' }}>
                View all
              </Link>
            </div>
            {balances.length === 0 ? (
              <div className="empty-state"><Umbrella /><p>No leave balances configured</p></div>
            ) : (
              <div className="leave-balance-grid">
                {[...balances]
                  .sort((a, b) => {
                    const order = { 'Annual Leave': 1, 'Sick Leave': 2, 'Personal Leave': 3, 'Parental Leave': 4, 'Loss of Pay': 5 };
                    const nameA = formatLeaveTypeName(a.leave_type_name);
                    const nameB = formatLeaveTypeName(b.leave_type_name);
                    return (order[nameA] || 99) - (order[nameB] || 99);
                  })
                  .map((b) => {
                  const displayName = formatLeaveTypeName(b.leave_type_name);
                  const style = getLeaveTypeStyle(displayName);
                  const total = b.annual_entitlement && Number(b.annual_entitlement) > 0 ? Number(b.annual_entitlement) : null;
                  const balanceNum = Number(b.balance);
                  const pct = total ? Math.max(0, Math.min(100, (balanceNum / total) * 100)) : 100;
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'var(--bg-input)',
                        border: '1px solid #eef2f6',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        minWidth: 0,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: style.bg,
                              color: style.color,
                            }}
                          >
                            <style.icon size={12} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                letterSpacing: '-0.02em',
                              }}
                              title={displayName}
                            >
                              {displayName}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.70rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            background: '#ffffff',
                            padding: '1px 5px',
                            borderRadius: 5,
                            border: '1px solid #e2e8f0',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          }}
                        >
                          {balanceNum} {total ? `/ ${total}` : ''} d
                        </span>
                      </div>

                      {/* Progress Bar & Allocation Info */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.675rem', color: '#64748b', marginBottom: 4 }}>
                          <span>Allocated</span>
                          <span style={{ fontWeight: 600, color: total ? '#334155' : '#64748b' }}>
                            {total ? `${Math.round(pct)}% remaining` : 'Unlimited'}
                          </span>
                        </div>
                        <div style={{ width: '100%', height: 4, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: total ? `${pct}%` : '100%',
                              height: '100%',
                              background: total ? style.color : '#8b5cf6',
                              borderRadius: 99,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Row: Carry-Forward Policy & Planning */}
            <div
              style={{
                marginTop: 14,
                padding: '9px 14px',
                borderRadius: 12,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', flexShrink: 0 }}>
                  <CalendarPlus size={13} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d' }}>
                    Carry-Forward Policy & Entitlement Planning
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#166534', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Up to 5 unused Annual Leaves rollover automatically to fiscal year {today.getFullYear() + 1}.
                  </div>
                </div>
              </div>
              <Link
                to="/leave"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: '#2563eb',
                  padding: '5px 12px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  boxShadow: '0 2px 5px rgba(37,99,235,0.18)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Apply
              </Link>
            </div>
          </div>

          {/* Right: Upcoming Holidays */}
          <div className="section-card" style={{ borderRadius: 20, padding: '20px 22px', border: '1px solid #e2e8f0', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                    <CalendarHeart size={16} />
                  </div>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap' }}>Upcoming Holidays</h3>
                </div>
                <Link to="/attendance" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-blue)', textDecoration: 'none', marginLeft: 'auto', flexShrink: 0 }}>
                  Calendar
                </Link>
              </div>
              {upcomingHolidays.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                  No upcoming holidays scheduled
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {upcomingHolidays.map((h) => {
                    const hDate = new Date(h.holiday_date);
                    const diffDays = Math.ceil((hDate - new Date(today.toDateString())) / (1000 * 60 * 60 * 24));
                    const monthName = hDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
                    const dayNum = hDate.getDate();
                    const weekday = hDate.toLocaleDateString(undefined, { weekday: 'short' });
                    return (
                      <div
                        key={h.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: 'var(--bg-input)',
                          border: '1px solid #f1f5f9',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 40,
                              height: 42,
                              borderRadius: 10,
                              background: '#ffffff',
                              border: '1px solid #fee2e2',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            }}
                          >
                            <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>{monthName}</span>
                            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{dayNum}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{h.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {weekday}, {hDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: diffDays <= 7 ? '#ef4444' : '#64748b',
                            background: diffDays <= 7 ? '#fee2e2' : '#ffffff',
                            padding: '3px 8px',
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {showNewAnnouncement && (
        <NewAnnouncementModal
          onClose={() => setShowNewAnnouncement(false)}
          onSubmit={handleCreateAnnouncement}
        />
      )}

      {selectedAnnouncement && (
        <AnnouncementDetailModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      )}

      {showAllAnnouncements && (
        <AllAnnouncementsModal
          announcements={announcements}
          isAdminOrManager={isAdminOrManager}
          onClose={() => setShowAllAnnouncements(false)}
          onNewAnnouncement={() => setShowNewAnnouncement(true)}
          onSelectAnnouncement={(a) => setSelectedAnnouncement(a)}
        />
      )}
    </div>
  );
}

function AnnouncementDetailModal({ announcement, onClose }) {
  if (!announcement) return null;
  return (
    <Modal title="Announcement" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
            <Megaphone size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{announcement.title}</h3>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Posted on {new Date(announcement.created_at).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--bg-input)', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0', color: '#334155', fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {announcement.body}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function AllAnnouncementsModal({ announcements, onClose, onNewAnnouncement, isAdminOrManager, onSelectAnnouncement }) {
  const [search, setSearch] = useState('');
  const filtered = announcements.filter((a) =>
    a.title?.toLowerCase().includes(search.toLowerCase()) ||
    a.body?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal title="Company Broadcasts & Announcements" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '7px 12px', fontSize: '0.8125rem' }}
          />
          {isAdminOrManager && (
            <button
              onClick={() => {
                onClose();
                onNewAnnouncement();
              }}
              className="btn btn-primary"
              style={{ padding: '7px 12px', fontSize: '0.8125rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Plus size={14} /> Post
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gap: 10, overflowY: 'auto', maxHeight: '55vh', paddingRight: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No announcements found.
            </div>
          ) : (
            filtered.map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  onClose();
                  onSelectAnnouncement(a);
                }}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '12px 14px', borderRadius: 12,
                  background: 'var(--bg-input)', border: '1px solid #e2e8f0',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
                className="quick-action-row"
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0, marginTop: 2 }}>
                  <Megaphone size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>{a.title}</div>
                    <span style={{ fontSize: '0.70rem', color: '#94a3b8', flexShrink: 0 }}>
                      {new Date(a.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.775rem', marginTop: 3, lineHeight: 1.4 }}>
                    {a.body}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
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
