import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEmployeeOverview, clockIn, clockOut, getClockStatus } from '../api/attendance';
import {
  requestRegularization, getMyRegularizations, getPendingRegularizations, approveRegularization,
} from '../api/attendance';
import { requestOvertime, getMyOvertimeRequests, getPendingOvertimeRequests, approveOvertime } from '../api/overtime';
import { getDirectory, getDepartments, getSites } from '../api/employees';
import {
  Clock, CheckCircle2, Plus, Check, X, CalendarClock, Timer,
  ChevronLeft, ChevronRight, Users, Search, FileText,
} from 'lucide-react';
import Modal from '../components/Modal';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Shared month-view table — used by both "My Timesheet" (self) and
// "Employee Records" (Admin/Manager looking up anyone). Every calendar day
// of the month is a row; leave/holiday/overtime are overlaid alongside
// attendance sessions rather than being separate screens.
function MonthOverviewTable({ data }) {
  return (
    <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
      <h3><Clock size={18} style={{ color: 'var(--accent-blue)' }} /> Daily Overview</h3>
      <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ whiteSpace: 'nowrap' }}>Date</th><th style={{ whiteSpace: 'nowrap' }}>Sessions</th><th style={{ whiteSpace: 'nowrap' }}>Total Hours</th><th style={{ whiteSpace: 'nowrap' }}>Leave</th><th style={{ whiteSpace: 'nowrap' }}>Holiday</th><th style={{ whiteSpace: 'nowrap' }}>Overtime</th><th style={{ whiteSpace: 'nowrap' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.days?.map((day) => (
            <tr key={day.date}>
              <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </td>
              <td>
                {day.sessions.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                ) : (
                  <div className="session-pills">
                    {day.sessions.map((s, i) => (
                      <div key={i} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                        <span className={`session-pill ${!s.clock_out ? 'session-open' : ''}`}>
                          {s.source === 'regularization' && <span className="pill-source">(Regularized)</span>}
                          <span className="pill-in">{formatTime(s.clock_in)}</span>
                          <span className="pill-arrow">→</span>
                          <span className="pill-out">{s.clock_out ? formatTime(s.clock_out) : 'Active'}</span>
                        </span>
                        {s.summary && (
                          <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, paddingLeft: 4, fontStyle: 'italic' }}>
                            <FileText size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                            {s.summary}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {day.total_hours > 0 ? <span className="day-hours">{formatHours(day.total_hours)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {day.leave ? (
                  <span className={`badge badge-${day.leave.status}`}>{day.leave.leave_type_name || 'Leave'}</span>
                ) : '—'}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {day.holiday ? <span className="badge badge-info">{day.holiday}</span> : '—'}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {day.overtime.length === 0 ? '—' : day.overtime.map((o, i) => (
                  <span key={i} className={`badge badge-${o.status}`} style={{ marginRight: 4 }}>{o.hours}h</span>
                ))}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {day.is_complete === null ? (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                ) : day.is_complete ? (
                  <span className="day-status complete"><CheckCircle2 size={12} /> Complete</span>
                ) : (
                  <span className="day-status in-progress"><Clock size={12} /> In Progress</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {(!data?.days || data.days.length === 0) && (
        <div className="empty-state"><Clock size={48} /><p>No data for this month</p></div>
      )}
    </div>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const canApprove = !!user?.permissions?.['attendance:approve'];
  const [tab, setTab] = useState('log');

  const [clockedIn, setClockedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  // My Timesheet state
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [timesheetData, setTimesheetData] = useState(null);

  // Employee Records state (Admin/Manager only)
  const [erEmployees, setErEmployees] = useState([]);
  const [erDepartments, setErDepartments] = useState([]);
  const [erSites, setErSites] = useState([]);
  const [erSearch, setErSearch] = useState('');
  const [erDeptFilter, setErDeptFilter] = useState('');
  const [erSiteFilter, setErSiteFilter] = useState('');
  const [erStatusFilter, setErStatusFilter] = useState('active');
  const [erEmployeeId, setErEmployeeId] = useState('');
  const [erYear, setErYear] = useState(now.getFullYear());
  const [erMonth, setErMonth] = useState(now.getMonth() + 1);
  const [erData, setErData] = useState(null);

  const [myRegularizations, setMyRegularizations] = useState([]);
  const [pendingRegularizations, setPendingRegularizations] = useState([]);
  const [showRegularize, setShowRegularize] = useState(false);
  const [regForm, setRegForm] = useState({ record_date: '', requested_clock_in: '', requested_clock_out: '', reason: '' });

  const [myOvertime, setMyOvertime] = useState([]);
  const [pendingOvertime, setPendingOvertime] = useState([]);
  const [showOvertime, setShowOvertime] = useState(false);
  const [otForm, setOtForm] = useState({ request_date: '', hours: '', reason: '' });

  useEffect(() => {
    if (user?.employee_id) {
      loadRecords();
    }
    loadRegularizations();
    loadOvertime();
    loadTimesheet();
    if (canApprove) {
      getDirectory().then((res) => setErEmployees(res.data)).catch(() => {});
      getDepartments().then((res) => setErDepartments(res.data)).catch(() => {});
      getSites().then((res) => setErSites(res.data)).catch(() => {});
    }
  }, [user?.employee_id]);

  useEffect(() => {
    loadTimesheet();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (erEmployeeId) loadErData();
  }, [erEmployeeId, erYear, erMonth]);

  const [todayClockInTime, setTodayClockInTime] = useState(null);
  const [todayPunctuality, setTodayPunctuality] = useState('On Time');
  const [shiftInfo, setShiftInfo] = useState(null);

  const loadRecords = async () => {
    try {
      getClockStatus().then((r) => setClockedIn(!!r.data?.clocked_in)).catch(() => {});
      const res = await getEmployeeOverview({ employee_id: user?.employee_id, year: now.getFullYear(), month: now.getMonth() + 1 });
      setShiftInfo(res.data?.shift_info || null);
      const today = now.toISOString().slice(0, 10);
      const todayRow = res.data?.days?.find((d) => d.date === today);
      if (todayRow?.sessions?.length > 0) {
        setTodayClockInTime(todayRow.sessions[0].clock_in);
        setTodayPunctuality(todayRow.sessions[0].punctuality_status || 'On Time');
      } else {
        setTodayClockInTime(null);
        setTodayPunctuality('Not Clocked In');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTimesheet = async () => {
    try {
      const res = await getEmployeeOverview({ employee_id: user?.employee_id, year: selectedYear, month: selectedMonth });
      setTimesheetData(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadErData = async () => {
    try {
      const res = await getEmployeeOverview({ employee_id: erEmployeeId, year: erYear, month: erMonth });
      setErData(res.data);
    } catch (e) {
      console.error(e);
      setErData(null);
    }
  };

  const filteredErEmployees = erEmployees.filter((e) => {
    const matchesSearch =
      e.full_name.toLowerCase().includes(erSearch.toLowerCase()) ||
      e.employee_code.toLowerCase().includes(erSearch.toLowerCase());
    const matchesDept = !erDeptFilter || e.department_name === erDeptFilter;
    const matchesSite = !erSiteFilter || e.site_name === erSiteFilter;
    const matchesStatus = erStatusFilter === 'all' || e.employment_status === erStatusFilter;
    return matchesSearch && matchesDept && matchesSite && matchesStatus;
  });

  const goToPrevMonth = (setYear, setMonth, year, month) => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else { setMonth(month - 1); }
  };
  const goToNextMonth = (setYear, setMonth, year, month) => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else { setMonth(month + 1); }
  };

  const loadRegularizations = async () => {
    try {
      const mine = await getMyRegularizations();
      setMyRegularizations(mine.data);
      if (canApprove) {
        const pending = await getPendingRegularizations();
        setPendingRegularizations(pending.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadOvertime = async () => {
    try {
      const mine = await getMyOvertimeRequests();
      setMyOvertime(mine.data);
      if (canApprove) {
        const pending = await getPendingOvertimeRequests();
        setPendingOvertime(pending.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [showClockModal, setShowClockModal] = useState(false);
  const [daySummary, setDaySummary] = useState('');

  const triggerClock = async () => {
    if (!clockedIn) {
      // Clock In directly without showing summary modal
      setLoading(true);
      try {
        await clockIn({ source: 'web' });
        setClockedIn(true);
        loadRecords();
        loadTimesheet();
      } catch (e) {
        alert(e.response?.data?.detail || 'Failed to clock in');
      } finally {
        setLoading(false);
      }
    } else {
      // Clock Out: Open optional summary modal
      setDaySummary('');
      setShowClockModal(true);
    }
  };

  const handleClockOutSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setShowClockModal(false);
    try {
      await clockOut({ summary: daySummary || null });
      setClockedIn(false);
      loadRecords();
      loadTimesheet();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to clock out');
    } finally {
      setLoading(false);
    }
  };

  const handleRegularizeSubmit = async (e) => {
    e.preventDefault();
    try {
      await requestRegularization({
        record_date: regForm.record_date,
        requested_clock_in: new Date(regForm.requested_clock_in).toISOString(),
        requested_clock_out: regForm.requested_clock_out ? new Date(regForm.requested_clock_out).toISOString() : null,
        reason: regForm.reason,
      });
      setShowRegularize(false);
      setRegForm({ record_date: '', requested_clock_in: '', requested_clock_out: '', reason: '' });
      loadRegularizations();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit request');
    }
  };

  const handleRegularizeReview = async (id, status) => {
    try {
      await approveRegularization(id, status);
      loadRegularizations();
      loadTimesheet();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

  const handleOvertimeSubmit = async (e) => {
    e.preventDefault();
    try {
      await requestOvertime({ ...otForm, hours: Number(otForm.hours) });
      setShowOvertime(false);
      setOtForm({ request_date: '', hours: '', reason: '' });
      loadOvertime();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit request');
    }
  };

  const handleOvertimeReview = async (id, status) => {
    try {
      await approveOvertime(id, status);
      loadOvertime();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed');
    }
  };

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
            <Clock size={22} style={{ color: '#2563eb' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 'clamp(1.25rem, 4.5vw, 1.75rem)', fontWeight: 800, color: '#0f172a' }}>Attendance</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Track your daily work hours, punctuality & regularization requests</p>
          </div>
        </div>
        <button
          onClick={triggerClock}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 22px',
            borderRadius: 14,
            border: 'none',
            background: clockedIn
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #10b981, #059669)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: clockedIn
              ? '0 4px 14px rgba(239, 68, 68, 0.25)'
              : '0 4px 14px rgba(16, 185, 129, 0.25)',
            minWidth: 140,
            transition: 'all 0.15s ease',
          }}
        >
          <Clock size={18} />
          {loading ? 'Processing...' : clockedIn ? 'Clock Out' : 'Clock In'}
        </button>
      </div>

      {/* Status Banner — Executive clean layout */}
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
            {todayClockInTime ? formatTime(todayClockInTime) : '--:-- --'}
          </div>
          <div style={{ height: 28, width: 1, backgroundColor: '#e2e8f0', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shift Timing</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              {shiftInfo?.start_time ? `${shiftInfo.start_time} - ${shiftInfo.end_time}` : '09:00 AM - 06:00 PM (Default)'}
            </span>
          </div>
          {todayClockInTime && (
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                padding: '4px 14px',
                borderRadius: 12,
                backgroundColor: todayPunctuality === 'Late' ? '#fee2e2' : '#e0f2fe',
                color: todayPunctuality === 'Late' ? '#dc2626' : '#0369a1',
                whiteSpace: 'nowrap',
              }}
            >
              {todayPunctuality}
            </span>
          )}
        </div>

        <div className="clock-strip-badge" style={{ marginLeft: 'auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: todayClockInTime ? '#dcfce7' : '#f8fafc',
              color: todayClockInTime ? '#15803d' : '#64748b',
              border: `1px solid ${todayClockInTime ? '#bbf7d0' : '#e2e8f0'}`,
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <CheckCircle2 size={15} style={{ color: todayClockInTime ? '#16a34a' : '#94a3b8' }} />
            <span>{todayClockInTime ? 'Attendance Marked' : 'Pending Clock In'}</span>
          </div>
        </div>
      </div>

      {/* Modern Pill Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'log', label: 'My Timesheet', icon: Clock },
          { key: 'regularization', label: `Regularization ${canApprove && pendingRegularizations.length > 0 ? `(${pendingRegularizations.length})` : ''}`, icon: CalendarClock },
          { key: 'overtime', label: `Overtime ${canApprove && pendingOvertime.length > 0 ? `(${pendingOvertime.length})` : ''}`, icon: Timer },
          ...(canApprove ? [{ key: 'employee-records', label: 'Employee Records', icon: Users }] : []),
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 14,
              fontSize: '0.875rem',
              fontWeight: 700,
              border: tab === item.key ? 'none' : '1px solid #cbd5e1',
              background: tab === item.key ? '#0f172a' : '#ffffff',
              color: tab === item.key ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              boxShadow: tab === item.key ? '0 4px 12px rgba(15, 23, 42, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {/* My Timesheet Tab */}
      {tab === 'log' && (
        <div>
          <div className="timesheet-filter-bar" style={{ marginBottom: 20 }}>
            <div className="timesheet-month-nav">
              <button className="nav-btn" onClick={() => goToPrevMonth(setSelectedYear, setSelectedMonth, selectedYear, selectedMonth)}><ChevronLeft size={16} /></button>
              <span className="month-label" style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
              <button className="nav-btn" onClick={() => goToNextMonth(setSelectedYear, setSelectedMonth, selectedYear, selectedMonth)}><ChevronRight size={16} /></button>
            </div>
            {timesheetData && (
              <div className="timesheet-summary">
                <div className="timesheet-stat" style={{ background: '#eff6ff', borderRadius: 14, padding: '8px 16px' }}>
                  <span className="stat-value" style={{ color: '#2563eb', fontWeight: 800 }}>{formatHours(timesheetData.month_total_hours)}</span>
                  <span className="stat-label" style={{ color: '#64748b', fontWeight: 600 }}>Total Hours</span>
                </div>
              </div>
            )}
          </div>
          <MonthOverviewTable data={timesheetData} />
        </div>
      )}

      {/* Employee Records (Admin/Manager) */}
      {tab === 'employee-records' && (
        <div>
          <div className="section-card" style={{ marginBottom: 20, borderTop: '3px solid #7c3aed' }}>
            <h3 style={{ marginBottom: 16 }}><Users size={18} style={{ color: 'var(--accent-violet)' }} /> View Employee Attendance</h3>

            {/* Filters — narrow down the employee list */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 34 }}
                  placeholder="Search by name or code..."
                  value={erSearch}
                  onChange={(e) => setErSearch(e.target.value)}
                />
              </div>
              <select className="input-field" style={{ flex: '1 1 160px', minWidth: 0 }} value={erDeptFilter} onChange={(e) => setErDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {erDepartments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
              <select className="input-field" style={{ flex: '1 1 160px', minWidth: 0 }} value={erSiteFilter} onChange={(e) => setErSiteFilter(e.target.value)}>
                <option value="">All Sites</option>
                {erSites.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              <select className="input-field" style={{ flex: '1 1 140px', minWidth: 0 }} value={erStatusFilter} onChange={(e) => setErStatusFilter(e.target.value)}>
                <option value="active">Active Only</option>
                <option value="all">All Statuses</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            {/* Employee + month selection */}
            <div className="timesheet-filter-bar">
              <select
                className="input-field"
                style={{ maxWidth: 280 }}
                value={erEmployeeId}
                onChange={(e) => setErEmployeeId(e.target.value)}
              >
                <option value="">
                  {filteredErEmployees.length === 0 ? 'No employees match filters' : `Select an employee... (${filteredErEmployees.length})`}
                </option>
                {filteredErEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
                ))}
              </select>
              <div className="timesheet-month-nav">
                <button className="nav-btn" onClick={() => goToPrevMonth(setErYear, setErMonth, erYear, erMonth)}><ChevronLeft size={16} /></button>
                <span className="month-label">{MONTH_NAMES[erMonth - 1]} {erYear}</span>
                <button className="nav-btn" onClick={() => goToNextMonth(setErYear, setErMonth, erYear, erMonth)}><ChevronRight size={16} /></button>
              </div>
              {erData ? (
                <div className="timesheet-summary">
                  <div className="timesheet-stat">
                    <span className="stat-value">{formatHours(erData.month_total_hours)}</span>
                    <span className="stat-label">Total Hours</span>
                  </div>
                </div>
              ) : (
                <div style={{ width: 1 }} />
              )}
            </div>
          </div>

          {!erEmployeeId ? (
            <div className="section-card">
              <div className="empty-state"><Users size={48} /><p>Select an employee to view their attendance</p></div>
            </div>
          ) : (
            <MonthOverviewTable data={erData} />
          )}
        </div>
      )}

      {/* Regularization */}
      {tab === 'regularization' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ marginBottom: 0 }}><CalendarClock size={18} style={{ color: 'var(--accent-blue)' }} /> My Regularization Requests</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowRegularize(true)}><Plus size={14} /> New Request</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Date</th><th style={{ whiteSpace: 'nowrap' }}>Requested In</th><th style={{ whiteSpace: 'nowrap' }}>Requested Out</th><th style={{ whiteSpace: 'nowrap' }}>Reason</th><th style={{ whiteSpace: 'nowrap' }}>Status</th></tr></thead>
              <tbody>
                {myRegularizations.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.record_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatTime(r.requested_clock_in)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatTime(r.requested_clock_out)}</td>
                    <td>{r.reason}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {myRegularizations.length === 0 && <div className="empty-state"><CalendarClock size={48} /><p>No regularization requests yet</p></div>}
          </div>

          {canApprove && (
            <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
              <h3><CalendarClock size={18} style={{ color: 'var(--accent-amber)' }} /> Approval Queue</h3>
              <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Employee</th><th style={{ whiteSpace: 'nowrap' }}>Date</th><th style={{ whiteSpace: 'nowrap' }}>Requested In</th><th style={{ whiteSpace: 'nowrap' }}>Requested Out</th><th style={{ whiteSpace: 'nowrap' }}>Reason</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
                <tbody>
                  {pendingRegularizations.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.employee_name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.record_date}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatTime(r.requested_clock_in)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatTime(r.requested_clock_out)}</td>
                      <td>{r.reason}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleRegularizeReview(r.id, 'approved')}><Check size={14} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleRegularizeReview(r.id, 'rejected')}><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {pendingRegularizations.length === 0 && <div className="empty-state"><Clock size={48} /><p>No pending requests</p></div>}
            </div>
          )}
        </div>
      )}

      {/* Overtime */}
      {tab === 'overtime' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="section-card" style={{ borderTop: '3px solid #7c3aed' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ marginBottom: 0 }}><Timer size={18} style={{ color: 'var(--accent-violet)' }} /> My Overtime Requests</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowOvertime(true)}><Plus size={14} /> New Request</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Date</th><th style={{ whiteSpace: 'nowrap' }}>Hours</th><th style={{ whiteSpace: 'nowrap' }}>Reason</th><th style={{ whiteSpace: 'nowrap' }}>Status</th></tr></thead>
              <tbody>
                {myOvertime.map((o) => (
                  <tr key={o.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{o.request_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{o.hours}</td>
                    <td>{o.reason}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className={`badge badge-${o.status}`}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {myOvertime.length === 0 && <div className="empty-state"><Timer size={48} /><p>No overtime requests yet</p></div>}
          </div>

          {canApprove && (
            <div className="section-card" style={{ borderTop: '3px solid #d97706' }}>
              <h3><Timer size={18} style={{ color: 'var(--accent-amber)' }} /> Approval Queue</h3>
              <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th style={{ whiteSpace: 'nowrap' }}>Employee</th><th style={{ whiteSpace: 'nowrap' }}>Date</th><th style={{ whiteSpace: 'nowrap' }}>Hours</th><th style={{ whiteSpace: 'nowrap' }}>Reason</th><th style={{ whiteSpace: 'nowrap' }}>Actions</th></tr></thead>
                <tbody>
                  {pendingOvertime.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{o.employee_name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.request_date}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{o.hours}</td>
                      <td>{o.reason}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleOvertimeReview(o.id, 'approved')}><Check size={14} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleOvertimeReview(o.id, 'rejected')}><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {pendingOvertime.length === 0 && <div className="empty-state"><Clock size={48} /><p>No pending requests</p></div>}
            </div>
          )}
        </div>
      )}

      {showClockModal && (
        <Modal
          title="Clock Out — Day's Summary"
          onClose={() => setShowClockModal(false)}
        >
          <form onSubmit={handleClockOutSubmit}>
            <div className="input-group">
              <label className="input-label">
                Day's Summary / Work Done <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                className="input-field"
                rows={4}
                placeholder="e.g. Completed feature X, attended team sync, fixed bug Y..."
                value={daySummary}
                onChange={(e) => setDaySummary(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClockOutSubmit}
                disabled={loading}
              >
                Skip & Clock Out
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Save & Clock Out'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showRegularize && (
        <Modal title="Request Attendance Regularization" onClose={() => setShowRegularize(false)}>
          <form onSubmit={handleRegularizeSubmit}>
            <div className="input-group">
              <label className="input-label">Date</label>
              <input type="date" className="input-field" value={regForm.record_date} onChange={(e) => setRegForm({ ...regForm, record_date: e.target.value })} required />
            </div>
            <div className="input-group">
              <label className="input-label">Requested Clock In</label>
              <input type="datetime-local" className="input-field" value={regForm.requested_clock_in} onChange={(e) => setRegForm({ ...regForm, requested_clock_in: e.target.value })} required />
            </div>
            <div className="input-group">
              <label className="input-label">Requested Clock Out (optional)</label>
              <input type="datetime-local" className="input-field" value={regForm.requested_clock_out} onChange={(e) => setRegForm({ ...regForm, requested_clock_out: e.target.value })} />
            </div>
            <div className="input-group">
              <label className="input-label">Reason</label>
              <input className="input-field" placeholder="e.g. Forgot to clock in" value={regForm.reason} onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>Submit Request</button>
          </form>
        </Modal>
      )}

      {showOvertime && (
        <Modal title="Request Overtime" onClose={() => setShowOvertime(false)}>
          <form onSubmit={handleOvertimeSubmit}>
            <div className="input-group">
              <label className="input-label">Date</label>
              <input type="date" className="input-field" value={otForm.request_date} onChange={(e) => setOtForm({ ...otForm, request_date: e.target.value })} required />
            </div>
            <div className="input-group">
              <label className="input-label">Hours</label>
              <input type="number" step="0.5" min="0.5" max="24" className="input-field" value={otForm.hours} onChange={(e) => setOtForm({ ...otForm, hours: e.target.value })} required />
            </div>
            <div className="input-group">
              <label className="input-label">Reason</label>
              <input className="input-field" placeholder="e.g. Released a hotfix" value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>Submit Request</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
