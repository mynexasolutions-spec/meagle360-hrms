import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEmployeeOverview, clockIn, clockOut } from '../api/attendance';
import {
  requestRegularization, getMyRegularizations, getPendingRegularizations, approveRegularization,
} from '../api/attendance';
import { requestOvertime, getMyOvertimeRequests, getPendingOvertimeRequests, approveOvertime } from '../api/overtime';
import { getDirectory, getDepartments, getSites } from '../api/employees';
import {
  Clock, CheckCircle2, Plus, Check, X, CalendarClock, Timer,
  ChevronLeft, ChevronRight, Users, Search,
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
    <div className="section-card">
      <h3><Clock size={18} style={{ color: 'var(--accent-blue)' }} /> Daily Overview</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th><th>Sessions</th><th>Total Hours</th><th>Leave</th><th>Holiday</th><th>Overtime</th><th>Status</th>
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
                      <span key={i} className={`session-pill ${!s.clock_out ? 'session-open' : ''}`}>
                        {s.source === 'regularization' && <span className="pill-source">(Regularized)</span>}
                        <span className="pill-in">{formatTime(s.clock_in)}</span>
                        <span className="pill-arrow">→</span>
                        <span className="pill-out">{s.clock_out ? formatTime(s.clock_out) : 'Active'}</span>
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td>
                {day.total_hours > 0 ? <span className="day-hours">{formatHours(day.total_hours)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td>
                {day.leave ? (
                  <span className={`badge badge-${day.leave.status}`}>{day.leave.leave_type_name || 'Leave'}</span>
                ) : '—'}
              </td>
              <td>
                {day.holiday ? <span className="badge badge-info">{day.holiday}</span> : '—'}
              </td>
              <td>
                {day.overtime.length === 0 ? '—' : day.overtime.map((o, i) => (
                  <span key={i} className={`badge badge-${o.status}`} style={{ marginRight: 4 }}>{o.hours}h</span>
                ))}
              </td>
              <td>
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
    loadRecords();
    loadRegularizations();
    loadOvertime();
    loadTimesheet();
    if (canApprove) {
      getDirectory().then((res) => setErEmployees(res.data)).catch(() => {});
      getDepartments().then((res) => setErDepartments(res.data)).catch(() => {});
      getSites().then((res) => setErSites(res.data)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadTimesheet();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (erEmployeeId) loadErData();
  }, [erEmployeeId, erYear, erMonth]);

  const loadRecords = async () => {
    try {
      const res = await getEmployeeOverview({ employee_id: user?.employee_id, year: now.getFullYear(), month: now.getMonth() + 1 });
      const today = now.toISOString().slice(0, 10);
      const todayRow = res.data?.days?.find((d) => d.date === today);
      const open = todayRow?.sessions?.some((s) => !s.clock_out);
      setClockedIn(!!open);
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

  const handleClock = async () => {
    setLoading(true);
    try {
      if (clockedIn) {
        await clockOut();
        setClockedIn(false);
      } else {
        await clockIn({ source: 'web' });
        setClockedIn(true);
      }
      loadRecords();
      loadTimesheet();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed');
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
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Attendance</h1>
          <p>Track your daily attendance and working hours</p>
        </div>
        <button
          className={`btn ${clockedIn ? 'btn-danger' : 'btn-success'}`}
          onClick={handleClock}
          disabled={loading}
          style={{ minWidth: 140 }}
        >
          <Clock size={16} />
          {loading ? 'Processing...' : clockedIn ? 'Clock Out' : 'Clock In'}
        </button>
      </div>

      {/* Status card */}
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: clockedIn ? 'var(--accent-emerald)' : 'var(--accent-rose)',
            boxShadow: `0 0 10px ${clockedIn ? 'rgba(16,185,129,0.5)' : 'rgba(244,63,94,0.5)'}`,
          }}
        />
        <div>
          <div style={{ fontWeight: 600 }}>{clockedIn ? 'Currently Clocked In' : 'Not Clocked In'}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>My Timesheet</button>
        <button className={`tab ${tab === 'regularization' ? 'active' : ''}`} onClick={() => setTab('regularization')}>
          Regularization {canApprove && pendingRegularizations.length > 0 && `(${pendingRegularizations.length})`}
        </button>
        <button className={`tab ${tab === 'overtime' ? 'active' : ''}`} onClick={() => setTab('overtime')}>
          Overtime {canApprove && pendingOvertime.length > 0 && `(${pendingOvertime.length})`}
        </button>
        {canApprove && (
          <button className={`tab ${tab === 'employee-records' ? 'active' : ''}`} onClick={() => setTab('employee-records')}>
            Employee Records
          </button>
        )}
      </div>

      {/* My Timesheet */}
      {tab === 'log' && (
        <div>
          <div className="timesheet-filter-bar">
            <div className="timesheet-month-nav">
              <button className="nav-btn" onClick={() => goToPrevMonth(setSelectedYear, setSelectedMonth, selectedYear, selectedMonth)}><ChevronLeft size={16} /></button>
              <span className="month-label">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
              <button className="nav-btn" onClick={() => goToNextMonth(setSelectedYear, setSelectedMonth, selectedYear, selectedMonth)}><ChevronRight size={16} /></button>
            </div>
            {timesheetData && (
              <div className="timesheet-summary">
                <div className="timesheet-stat">
                  <span className="stat-value">{formatHours(timesheetData.month_total_hours)}</span>
                  <span className="stat-label">Total Hours</span>
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
          <div className="section-card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}><Users size={18} style={{ color: 'var(--accent-violet)' }} /> View Employee Attendance</h3>

            {/* Filters — narrow down the employee list */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 34 }}
                  placeholder="Search by name or code..."
                  value={erSearch}
                  onChange={(e) => setErSearch(e.target.value)}
                />
              </div>
              <select className="input-field" style={{ flex: '0 1 180px' }} value={erDeptFilter} onChange={(e) => setErDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {erDepartments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
              <select className="input-field" style={{ flex: '0 1 180px' }} value={erSiteFilter} onChange={(e) => setErSiteFilter(e.target.value)}>
                <option value="">All Sites</option>
                {erSites.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
              <select className="input-field" style={{ flex: '0 1 160px' }} value={erStatusFilter} onChange={(e) => setErStatusFilter(e.target.value)}>
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
          <div className="section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ marginBottom: 0 }}><CalendarClock size={18} style={{ color: 'var(--accent-blue)' }} /> My Regularization Requests</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowRegularize(true)}><Plus size={14} /> New Request</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Requested In</th><th>Requested Out</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {myRegularizations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.record_date}</td>
                    <td>{formatTime(r.requested_clock_in)}</td>
                    <td>{formatTime(r.requested_clock_out)}</td>
                    <td>{r.reason}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {myRegularizations.length === 0 && <div className="empty-state"><CalendarClock size={48} /><p>No regularization requests yet</p></div>}
          </div>

          {canApprove && (
            <div className="section-card">
              <h3><CalendarClock size={18} style={{ color: 'var(--accent-amber)' }} /> Approval Queue</h3>
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Date</th><th>Requested In</th><th>Requested Out</th><th>Reason</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingRegularizations.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.employee_name}</td>
                      <td>{r.record_date}</td>
                      <td>{formatTime(r.requested_clock_in)}</td>
                      <td>{formatTime(r.requested_clock_out)}</td>
                      <td>{r.reason}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleRegularizeReview(r.id, 'approved')}><Check size={14} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleRegularizeReview(r.id, 'rejected')}><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pendingRegularizations.length === 0 && <div className="empty-state"><Clock size={48} /><p>No pending requests</p></div>}
            </div>
          )}
        </div>
      )}

      {/* Overtime */}
      {tab === 'overtime' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ marginBottom: 0 }}><Timer size={18} style={{ color: 'var(--accent-violet)' }} /> My Overtime Requests</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowOvertime(true)}><Plus size={14} /> New Request</button>
            </div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Hours</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {myOvertime.map((o) => (
                  <tr key={o.id}>
                    <td>{o.request_date}</td>
                    <td>{o.hours}</td>
                    <td>{o.reason}</td>
                    <td><span className={`badge badge-${o.status}`}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {myOvertime.length === 0 && <div className="empty-state"><Timer size={48} /><p>No overtime requests yet</p></div>}
          </div>

          {canApprove && (
            <div className="section-card">
              <h3><Timer size={18} style={{ color: 'var(--accent-amber)' }} /> Approval Queue</h3>
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Date</th><th>Hours</th><th>Reason</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingOvertime.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>{o.employee_name}</td>
                      <td>{o.request_date}</td>
                      <td>{o.hours}</td>
                      <td>{o.reason}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleOvertimeReview(o.id, 'approved')}><Check size={14} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleOvertimeReview(o.id, 'rejected')}><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pendingOvertime.length === 0 && <div className="empty-state"><Clock size={48} /><p>No pending requests</p></div>}
            </div>
          )}
        </div>
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
