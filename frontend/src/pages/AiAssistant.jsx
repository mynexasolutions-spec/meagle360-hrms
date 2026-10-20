import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  CheckCircle2,
  Bot,
  User,
  Square,
  Trash2,
  Building2,
  Users,
  CalendarOff,
  CalendarPlus,
  Clock,
  ClipboardCheck,
  ArrowUpRight,
  Check,
  X,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import {
  sendAiChat,
  getAiDailyDigest,
  getAiQuota,
  transcribeVoiceAudio,
  executeAiAction,
} from '../api/ai';
import { useAuth } from '../context/AuthContext';
import botAvatarVideo from '../assets/meagle-bot-bust-transparent.webm';

function BotAvatar({ size = 36, glow = false, isSpeaking = false }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <style>{`
        @keyframes appleAuraRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes appleAuraPulse {
          0%, 100% {
            opacity: 0.65;
            transform: scale(0.98);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.10);
          }
        }
        @keyframes miniBarPulse {
          0%, 100% { height: 3px; }
          50% { height: 11px; }
        }
      `}</style>

      {/* Apple Intelligence / Siri Style Chameleon Aura Glow */}
      {isSpeaking && (
        <div
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: Math.round(size * 0.36),
            background:
              'conic-gradient(from 0deg, #6366f1, #06b6d4, #a855f7, #ec4899, #3b82f6, #6366f1)',
            filter: `blur(${Math.max(8, Math.round(size * 0.18))}px)`,
            opacity: 0.85,
            animation: 'appleAuraRotate 4s linear infinite, appleAuraPulse 2s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Main Avatar Container (Clean, Stable, Sharp) */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          borderRadius: Math.round(size * 0.28),
          background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)',
          border: isSpeaking
            ? '2px solid #818cf8'
            : glow
            ? '2px solid #818cf8'
            : '1px solid #bfdbfe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: isSpeaking
            ? '0 0 0 3px rgba(129, 140, 248, 0.35), 0 10px 28px -4px rgba(99, 102, 241, 0.40)'
            : glow
            ? '0 10px 30px -4px rgba(79, 70, 229, 0.32), 0 0 0 6px rgba(99, 102, 241, 0.10)'
            : '0 2px 8px rgba(37, 99, 235, 0.14)',
          transition: 'border 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        <video
          src={botAvatarVideo}
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
}

// ── Admin / Manager Prompts & Hero Pills ──────────────────────────────────
const ADMIN_QUICK_PROMPTS = [
  {
    label: 'Generate payroll & salaries',
    query: 'Is mahine ka payroll bana do aur batao kiske payroll mein kitni salary bani hai',
  },
  { label: 'Who is present today?', query: 'Who is present today' },
  { label: 'Who is on leave today?', query: 'Who is on leave today' },
  { label: "Today's late comers", query: 'Who clocked in late today' },
  { label: 'Pending approvals', query: 'What leave approvals are pending?' },
];

const ADMIN_HERO_PILLS = [
  {
    id: 'present',
    label: 'Who is present today in Engineering?',
    query: 'Who is present today in the Engineering department?',
    tag: 'Live',
    icon: Users,
    iconBg: '#dcfce7',
    iconColor: '#15803d',
    borderHover: '#4ade80',
    glowHover: 'rgba(34, 197, 94, 0.16)',
    badgeBg: '#f0fdf4',
    badgeColor: '#166534',
    digestKey: 'present_today',
    digestSuffix: 'Present',
  },
  {
    id: 'leave',
    label: 'Who is on leave today?',
    query: 'Who is on leave today?',
    tag: 'Leaves',
    icon: CalendarOff,
    iconBg: '#e0e7ff',
    iconColor: '#4338ca',
    borderHover: '#818cf8',
    glowHover: 'rgba(99, 102, 241, 0.18)',
    badgeBg: '#eef2ff',
    badgeColor: '#3730a3',
    digestKey: 'on_leave_today',
    digestSuffix: 'On Leave',
  },
  {
    id: 'late',
    label: 'Who came late today?',
    query: 'Who came late today?',
    tag: 'Shifts',
    icon: Clock,
    iconBg: '#fef3c7',
    iconColor: '#b45309',
    borderHover: '#fbbf24',
    glowHover: 'rgba(245, 158, 11, 0.16)',
    badgeBg: '#fffbeb',
    badgeColor: '#92400e',
    digestKey: 'late_today',
    digestSuffix: 'Late',
  },
  {
    id: 'approvals',
    label: 'What leave approvals are pending?',
    query: 'What leave approvals are pending?',
    tag: 'Approvals',
    icon: ClipboardCheck,
    iconBg: '#dbeafe',
    iconColor: '#1d4ed8',
    borderHover: '#60a5fa',
    glowHover: 'rgba(37, 99, 235, 0.16)',
    badgeBg: '#eff6ff',
    badgeColor: '#1e40af',
    digestKey: 'pending_leave_approvals',
    digestSuffix: 'Pending',
  },
];

// ── Employee Personal Self-Service Prompts & Hero Pills ───────────────────
const EMPLOYEE_QUICK_PROMPTS = [
  { label: 'My salary / payslip', query: 'Meri is mahine ki salary kitni bani hai?' },
  { label: 'My leave balance', query: 'What is my leave balance?' },
  { label: 'My attendance this month', query: 'How is my attendance this month?' },
  { label: 'Apply sick leave tomorrow', query: 'Apply sick leave for tomorrow' },
  { label: 'My applied leaves status', query: 'What is the status of my applied leaves?' },
];

const EMPLOYEE_HERO_PILLS = [
  {
    id: 'my_balance',
    label: 'What is my leave balance?',
    query: 'What is my leave balance?',
    tag: 'My Leaves',
    icon: CalendarDays,
    iconBg: '#e0e7ff',
    iconColor: '#4338ca',
    borderHover: '#818cf8',
    glowHover: 'rgba(99, 102, 241, 0.18)',
    badgeBg: '#eef2ff',
    badgeColor: '#3730a3',
    digestKey: 'my_leave_balance',
    digestSuffix: 'Days Left',
  },
  {
    id: 'my_attendance',
    label: 'How is my attendance this month?',
    query: 'How is my attendance this month?',
    tag: 'My Attendance',
    icon: Clock,
    iconBg: '#dcfce7',
    iconColor: '#15803d',
    borderHover: '#4ade80',
    glowHover: 'rgba(34, 197, 94, 0.16)',
    badgeBg: '#f0fdf4',
    badgeColor: '#166534',
    digestKey: 'my_days_present',
    digestSuffix: 'Days Present',
  },
  {
    id: 'apply_leave',
    label: 'Apply leave for tomorrow',
    query: 'I want to apply for leave tomorrow',
    tag: 'Apply Leave',
    icon: CalendarPlus,
    iconBg: '#dbeafe',
    iconColor: '#1d4ed8',
    borderHover: '#60a5fa',
    glowHover: 'rgba(37, 99, 235, 0.16)',
    badgeBg: '#eff6ff',
    badgeColor: '#1e40af',
    digestKey: null,
    digestSuffix: '',
  },
  {
    id: 'my_leave_status',
    label: 'What is the status of my applied leaves?',
    query: 'What is the status of my applied leaves?',
    tag: 'Status',
    icon: ClipboardCheck,
    iconBg: '#fef3c7',
    iconColor: '#b45309',
    borderHover: '#fbbf24',
    glowHover: 'rgba(245, 158, 11, 0.16)',
    badgeBg: '#fffbeb',
    badgeColor: '#92400e',
    digestKey: 'my_pending_leaves',
    digestSuffix: 'Pending',
  },
];

const TOOL_LABELS = {
  get_daily_attendance: 'Daily Attendance Record',
  get_late_comers: 'Shift & Punctuality Check',
  get_employees_on_leave: 'Leave Calendar & Requests',
  find_employee: 'Fuzzy Employee Lookup',
  get_pending_approvals: 'Approval Queue',
  prepare_leave_approval_action: 'Leave Approval Action',
  run_or_get_monthly_payroll: 'Payroll Engine & Salary Breakdown',
  get_my_leave_summary: 'My Leave Balance & Requests',
  get_my_attendance_summary: 'My Personal Attendance',
  prepare_my_leave_application: 'Leave Application Assistant',
  get_my_payslip_summary: 'My Payslip & Salary Breakdown',
};

const createWelcomeMessage = () => ({
  id: 'welcome',
  role: 'assistant',
  content: 'Welcome to Meagle 360 AI',
  tools_used: [],
  pending_actions: [],
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
});

function formatMessageHtml(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const htmlLines = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^[|\s:\-_]{3,}$/.test(trimmed)) continue;

    let processedLine = rawLine;
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (!cells.length) continue;
      const lower = cells.map((c) => c.replace(/\*+/g, '').trim().toLowerCase());
      if (
        lower.some((h) => ['employee', 'employee name', 'name'].includes(h)) &&
        lower.some((h) => ['department', 'status', 'check-in', 'late by', 'leave type'].includes(h))
      ) {
        continue;
      }
      const first = cells[0].startsWith('**') ? cells[0] : `**${cells[0]}**`;
      const rest = cells.slice(1).join(' • ');
      processedLine = `- ${first}${rest ? ` — ${rest}` : ''}`;
    }

    const escaped = processedLine
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:0.84em;color:#0f172a;">$1</code>'
      )
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    const bulletMatch = escaped.match(/^\s*[-•]\s+(.+)$/);
    if (bulletMatch) {
      htmlLines.push(
        `<div style="display:flex;align-items:flex-start;gap:8px;margin:4px 0;padding:4px 8px;border-radius:8px;background:rgba(241,245,249,0.65);">` +
          `<span style="color:#2563eb;font-weight:800;line-height:1.4;">•</span>` +
          `<span style="flex:1;">${bulletMatch[1]}</span>` +
        `</div>`
      );
    } else if (trimmed === '') {
      htmlLines.push('<div style="height:6px;"></div>');
    } else {
      htmlLines.push(`<div style="margin:2px 0;">${escaped}</div>`);
    }
  }

  return htmlLines.join('');
}

function stripMarkdownForSpeech(text) {
  if (!text) return '';
  return text
    .split('\n')
    .filter((line) => !/^[|\s:\-_]{3,}$/.test(line.trim()))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|/g, ', ')
    .replace(/[-—–]{2,}/g, ', ')
    .replace(/^[-•]\s+/gm, '')
    .replace(/\n+/g, '. ');
}

function calcDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const s = new Date(startStr);
  const e = new Date(endStr);
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

// ── Interactive Action Card Component (Rendered Below AI Message) ─────────
function ActionConfirmationCard({ card, onActionComplete }) {
  const [status, setStatus] = useState(card.status || 'pending'); // 'pending' | 'submitting' | 'completed' | 'cancelled'
  const [resultMessage, setResultMessage] = useState(card.resultMessage || '');
  const [decisionMade, setDecisionMade] = useState(card.decisionMade || '');
  const [errorText, setErrorText] = useState('');

  // Editable state for Employee Leave Application preview card
  const [leaveTypeId, setLeaveTypeId] = useState(card.leave_type_id || '');
  const [startDate, setStartDate] = useState(card.start_date || '');
  const [endDate, setEndDate] = useState(card.end_date || '');

  const selectedOption = (card.leave_type_options || []).find((o) => o.id === leaveTypeId);
  const displayLeaveTypeName = selectedOption ? selectedOption.name : card.leave_type_name;
  const displayBalance =
    selectedOption !== undefined ? selectedOption.balance : card.available_balance;
  const computedDays = calcDaysBetween(startDate, endDate);

  const handleConfirmApply = async () => {
    setErrorText('');
    setStatus('submitting');
    try {
      const res = await executeAiAction({
        action_type: 'apply_leave',
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        reason: card.reason,
      });
      setStatus('completed');
      setDecisionMade('applied');
      setResultMessage(res.data?.message || 'Leave request submitted successfully!');
      if (onActionComplete) onActionComplete(res.data?.message);
    } catch (err) {
      setStatus('pending');
      setErrorText(err.response?.data?.detail || 'Could not submit leave request.');
    }
  };

  const handleApproveOrReject = async (decision) => {
    setErrorText('');
    setStatus('submitting');
    try {
      const res = await executeAiAction({
        action_type: 'approve_leave',
        leave_request_id: card.leave_request_id,
        decision,
      });
      setStatus('completed');
      setDecisionMade(decision);
      setResultMessage(res.data?.message || `Leave request ${decision}.`);
      if (onActionComplete) onActionComplete(res.data?.message);
    } catch (err) {
      setStatus('pending');
      setErrorText(err.response?.data?.detail || `Failed to ${decision} leave request.`);
    }
  };

  const handleFinalizePayroll = async () => {
    setErrorText('');
    setStatus('submitting');
    try {
      const res = await executeAiAction({
        action_type: 'finalize_payroll',
        payroll_run_id: card.payroll_run_id,
        month: card.month,
        year: card.year,
      });
      setStatus('completed');
      setDecisionMade('finalized');
      setResultMessage(
        res.data?.message || `Payroll run for ${card.month_label || 'this month'} finalized!`
      );
      if (onActionComplete) onActionComplete(res.data?.message);
    } catch (err) {
      setStatus('pending');
      setErrorText(err.response?.data?.detail || 'Failed to finalize payroll run.');
    }
  };

  if (status === 'cancelled') {
    return (
      <div
        style={{
          marginTop: 10,
          padding: '10px 14px',
          borderRadius: 12,
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          color: '#64748b',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <X size={15} />
        <span>Action cancelled. No changes were made.</span>
      </div>
    );
  }

  if (status === 'completed') {
    const isRejected = decisionMade === 'rejected';
    return (
      <div
        style={{
          marginTop: 10,
          padding: '12px 14px',
          borderRadius: 12,
          background: isRejected ? '#fef2f2' : '#f0fdf4',
          border: isRejected ? '1px solid #fecaca' : '1px solid #bbf7d0',
          color: isRejected ? '#991b1b' : '#166534',
          fontSize: '0.84rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <CheckCircle2 size={17} style={{ color: isRejected ? '#dc2626' : '#16a34a', flexShrink: 0 }} />
        <span>{resultMessage}</span>
      </div>
    );
  }

  // ── 1. Employee Leave Application Confirmation Card ────────────────────
  if (card.action_type === 'apply_leave') {
    return (
      <div
        style={{
          marginTop: 12,
          padding: '14px 16px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1.5px solid #c7d2fe',
          boxShadow: '0 6px 18px -4px rgba(79, 70, 229, 0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CalendarPlus size={16} style={{ color: '#4f46e5' }} />
            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1e1b4b' }}>
              {card.title || 'Confirm Leave Application'}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: '#eef2ff',
              color: '#4338ca',
              border: '1px solid #c7d2fe',
            }}
          >
            {computedDays} {computedDays === 1 ? 'Day' : 'Days'}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#64748b',
                marginBottom: 3,
                textTransform: 'uppercase',
              }}
            >
              Leave Type
            </label>
            {card.leave_type_options?.length > 0 ? (
              <select
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                disabled={status === 'submitting'}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#0f172a',
                  background: '#ffffff',
                }}
              >
                {card.leave_type_options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} ({opt.is_paid ? `${opt.balance}d left` : 'Unpaid'})
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                {displayLeaveTypeName}
              </div>
            )}
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#64748b',
                marginBottom: 3,
                textTransform: 'uppercase',
              }}
            >
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              disabled={status === 'submitting'}
              style={{
                width: '100%',
                padding: '5px 8px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0f172a',
                background: '#ffffff',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#64748b',
                marginBottom: 3,
                textTransform: 'uppercase',
              }}
            >
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={status === 'submitting'}
              style={{
                width: '100%',
                padding: '5px 8px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0f172a',
                background: '#ffffff',
              }}
            />
          </div>
        </div>

        {displayBalance !== null && displayBalance !== undefined && (
          <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 10 }}>
            Available Balance for <strong>{displayLeaveTypeName}</strong>:{' '}
            <strong style={{ color: '#1d4ed8' }}>{displayBalance} day(s)</strong>
          </div>
        )}

        {errorText && (
          <div
            style={{
              marginBottom: 10,
              padding: '7px 10px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlertCircle size={14} />
            <span>{errorText}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={status === 'submitting'}
            onClick={handleConfirmApply}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 10px rgba(22, 163, 74, 0.25)',
            }}
          >
            <Check size={15} />
            <span>{status === 'submitting' ? 'Submitting...' : 'Confirm & Apply Leave'}</span>
          </button>

          <button
            type="button"
            disabled={status === 'submitting'}
            onClick={() => setStatus('cancelled')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 12px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={14} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 2. Admin / HR Finalize Payroll Confirmation Card ───────────────────
  if (card.action_type === 'finalize_payroll') {
    const fmtInr = (val) =>
      Number(val || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    return (
      <div
        style={{
          marginTop: 12,
          padding: '14px 16px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1.5px solid #bfdbfe',
          boxShadow: '0 6px 18px -4px rgba(37, 99, 235, 0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardCheck size={17} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
              {card.title || `Draft Payroll Run — ${card.month_label || ''}`}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 9px',
              borderRadius: 999,
              background: '#fef3c7',
              color: '#b45309',
              border: '1px solid #fde68a',
            }}
          >
            DRAFT • {card.payslip_count || 0} Payslip(s)
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
            gap: 10,
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Total Gross
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              ₹{fmtInr(card.total_gross_earnings)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Total Deductions
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#b91c1c', marginTop: 2 }}>
              -₹{fmtInr(card.total_deductions)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Total Net Payout
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#15803d', marginTop: 2 }}>
              ₹{fmtInr(card.total_net_pay)}
            </div>
          </div>
        </div>

        {card.unassigned_employees_count > 0 && (
          <div
            style={{
              marginBottom: 10,
              padding: '7px 10px',
              borderRadius: 8,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>
              {card.unassigned_employees_count} active employee(s) do not have a Salary Structure assigned yet.
            </span>
          </div>
        )}

        {errorText && (
          <div
            style={{
              marginBottom: 10,
              padding: '6px 10px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {errorText}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={status === 'submitting'}
            onClick={handleFinalizePayroll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 9,
              border: 'none',
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
              boxShadow: '0 3px 10px rgba(22, 163, 74, 0.24)',
            }}
          >
            <Check size={14} />
            <span>{status === 'submitting' ? 'Finalizing...' : 'Finalize Payroll Run'}</span>
          </button>

          <a
            href="/payroll"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '7px 12px',
              borderRadius: 9,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              fontSize: '0.78rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <span>Open Payroll Studio</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    );
  }

  // ── 3. Admin / Manager Leave Approval Card ─────────────────────────────
  return (
    <div
      style={{
        marginTop: 10,
        padding: '13px 16px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1.5px solid #bfdbfe',
        boxShadow: '0 6px 18px -4px rgba(37, 99, 235, 0.10)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            {card.employee_name}{' '}
            {card.department && (
              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748b' }}>
                ({card.department})
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: 2 }}>
            <strong>{card.leave_type_name}</strong> • {card.start_date} to {card.end_date} (
            <strong>{card.days} day{card.days > 1 ? 's' : ''}</strong>)
            {card.available_balance !== null && card.available_balance !== undefined && (
              <span style={{ color: '#2563eb', marginLeft: 6 }}>
                • Balance: {card.available_balance}d
              </span>
            )}
          </div>
        </div>

        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            background: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fde68a',
          }}
        >
          Pending Approval
        </span>
      </div>

      {errorText && (
        <div
          style={{
            marginBottom: 8,
            padding: '6px 10px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}
        >
          {errorText}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={status === 'submitting'}
          onClick={() => handleApproveOrReject('approved')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 9,
            border: 'none',
            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            color: '#ffffff',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
            boxShadow: '0 3px 10px rgba(22, 163, 74, 0.22)',
          }}
        >
          <Check size={14} />
          <span>{status === 'submitting' ? 'Processing...' : 'Approve Leave'}</span>
        </button>

        <button
          type="button"
          disabled={status === 'submitting'}
          onClick={() => handleApproveOrReject('rejected')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 9,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#dc2626',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
          }}
        >
          <X size={14} />
          <span>Reject</span>
        </button>
      </div>
    </div>
  );
}

export default function AiAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [digest, setDigest] = useState(null);
  const [selectedDept, setSelectedDept] = useState('');
  const [hoveredCard, setHoveredCard] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Determine Role Mode: Admin/Manager vs Employee
  const roleLower = (user?.role_name || user?.role?.name || '').toLowerCase();
  const perms = user?.permissions || {};
  const isAdminOrManager =
    ['admin', 'hr manager', 'manager'].includes(roleLower) ||
    Boolean(
      perms['attendance:approve'] ||
        perms['leave:approve'] ||
        perms['settings:write'] ||
        perms['payroll:read'] ||
        perms['payroll:write']
    );

  const activeHeroPills = isAdminOrManager ? ADMIN_HERO_PILLS : EMPLOYEE_HERO_PILLS;
  const activeQuickPrompts = isAdminOrManager ? ADMIN_QUICK_PROMPTS : EMPLOYEE_QUICK_PROMPTS;

  const firstName = user?.full_name ? user.full_name.trim().split(/\s+/)[0] : 'there';
  const currentHour = new Date().getHours();
  const timeGreeting =
    currentHour < 12 ? 'Good Morning' : currentHour < 17 ? 'Good Afternoon' : 'Good Evening';
  const isWelcomeOnly = messages.length === 1 && messages[0]?.id === 'welcome';

  // Daily Demo Quota state (10 chats/day)
  const [quota, setQuota] = useState(null);

  // Voice Input & Output state (Default autoSpeak: false so AI replies in text first, voice only on clicking 'Listen')
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceLang] = useState('en-IN');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [voiceStatusText, setVoiceStatusText] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const streamContainerRef = useRef(null);

  const loadDigest = useCallback(async () => {
    try {
      const res = await getAiDailyDigest();
      setDigest(res.data);
      if (res.data?.quota) {
        setQuota(res.data.quota);
      }
    } catch {
      // ignore digest error gracefully
    }

    try {
      const qRes = await getAiQuota();
      if (qRes.data) {
        setQuota(qRes.data);
      }
    } catch {
      // ignore quota load error gracefully
    }
  }, []);

  useEffect(() => {
    loadDigest();
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [loadDigest]);

  useEffect(() => {
    if (!isWelcomeOnly || loading) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      if (streamContainerRef.current) {
        streamContainerRef.current.scrollTop = 0;
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [messages, loading, isWelcomeOnly]);

  // ── Text-to-Speech (AI Voice Reply in English) ────────────────────────
  const speakReply = useCallback((msgId, rawText) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const cleanText = stripMarkdownForSpeech(rawText);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-IN';
    utterance.rate = 1.02;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang === 'en-IN' && v.name.toLowerCase().includes('natural')) ||
      voices.find((v) => v.lang === 'en-IN') ||
      voices.find((v) => v.lang.startsWith('en-'));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setSpeakingMsgId(msgId);
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
  }, []);

  const handleClearChat = useCallback(() => {
    stopSpeaking();
    setMessages([createWelcomeMessage()]);
    setVoiceStatusText('');
  }, [stopSpeaking]);

  // ── Meagle AI Voice Intro Handler ─────────────────────────────────────
  const handleToggleIntro = useCallback(() => {
    if (speakingMsgId === 'intro') {
      stopSpeaking();
      return;
    }

    const introScript = isAdminOrManager
      ? `Hello ${firstName}! I am Meagle, your intelligent AI copilot for Meagle 360 HRMS. You can ask me real-time questions about daily attendance, who is on leave, late check-ins, or manage leave approvals and payroll across all departments. Just tap any prompt or speak with me!`
      : `Hello ${firstName}! I am Meagle, your personal HRMS copilot. I am here to help you check your attendance records, review leave balances, view your payslips, or submit leave requests anytime. How can I help you today?`;

    speakReply('intro', introScript);
  }, [speakingMsgId, stopSpeaking, speakReply, isAdminOrManager, firstName]);

  // ── Send Message to /api/ai/chat ──────────────────────────────────────
  const handleSendMessage = useCallback(
    async (textOverride = null, triggeredByVoice = false) => {
      let textToSend = (textOverride !== null ? textOverride : input).trim();
      if (!textToSend || loading) return;

      if (quota?.is_demo && quota?.limit_reached) {
        setMessages((prev) => [
          ...prev,
          {
            id: `limit-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ **Daily Demo Limit Reached (10/10):** Aapne aaj ki demo chat limit poori kar li hai! Yeh kal subah 12:00 AM IST par reset ho jayegi. Full access ke liye upgrade karein ya contact karein.`,
            isError: true,
            tools_used: [],
            pending_actions: [],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        return;
      }

      // Only append department filter in Admin/Manager mode
      if (
        isAdminOrManager &&
        selectedDept &&
        !textToSend.toLowerCase().includes(selectedDept.toLowerCase()) &&
        !textToSend.toLowerCase().includes('approval') &&
        !textToSend.toLowerCase().includes('approve') &&
        !textToSend.toLowerCase().includes('payroll')
      ) {
        textToSend = `${textToSend.replace(/\?+$/, '')} in the ${selectedDept} department?`;
      }

      stopSpeaking();

      const userMsg = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: textToSend,
        viaVoice: triggeredByVoice,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const historyPayload = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      if (textOverride === null) setInput('');
      setLoading(true);

      try {
        const res = await sendAiChat(textToSend, historyPayload);
        const data = res.data;
        if (data.quota) {
          setQuota(data.quota);
        }
        const aiMsgId = `ai-${Date.now()}`;
        const aiMsg = {
          id: aiMsgId,
          role: 'assistant',
          content: data.reply,
          tools_used: data.tools_used || [],
          pending_actions: data.pending_actions || [],
          provider: data.provider,
          mode: data.mode,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiMsg]);

        if (autoSpeak) {
          speakReply(aiMsgId, data.reply);
        }
      } catch (err) {
        if (err.response?.status === 429) {
          setQuota((prev) => ({
            ...(prev || {}),
            is_demo: true,
            daily_limit: 10,
            chats_today: 10,
            chats_remaining: 0,
            limit_reached: true,
          }));
        }
        const detail =
          err.response?.data?.detail ||
          'Unable to reach the AI Assistant right now. Please try again.';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `**Error:** ${detail}`,
            isError: true,
            tools_used: [],
            pending_actions: [],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, autoSpeak, isAdminOrManager, selectedDept, speakReply, stopSpeaking, quota]
  );

  // ── Voice Recording (Groq Whisper + Browser SpeechRecognition Fallback) ──
  const startBrowserSpeechFallback = useCallback(
    (onTranscriptReady) => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return null;

      const rec = new SpeechRecognition();
      rec.lang = voiceLang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let captured = '';

      rec.onresult = (event) => {
        captured = event.results?.[0]?.[0]?.transcript || '';
        if (captured && onTranscriptReady) {
          onTranscriptReady(captured);
        }
      };
      rec.onerror = () => {};
      try {
        rec.start();
      } catch {
        // ignore if already started
      }
      return {
        getTranscript: () => captured,
        stop: () => {
          try {
            rec.stop();
          } catch {
            // ignore
          }
        },
      };
    },
    [voiceLang]
  );

  const startVoiceRecording = async () => {
    stopSpeaking();
    setVoiceStatusText('');

    const llmReady = Boolean(digest?.llm_configured);
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!llmReady && SpeechRecognition) {
      setIsRecording(true);
      setVoiceStatusText('Listening... Speak in English or Hinglish');
      const rec = new SpeechRecognition();
      rec.lang = voiceLang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;

      rec.onresult = (e) => {
        const text = (e.results?.[0]?.[0]?.transcript || '').trim();
        setIsRecording(false);
        setVoiceStatusText('');
        if (text) {
          handleSendMessage(text, true);
        }
      };
      rec.onerror = () => {
        setIsRecording(false);
        setVoiceStatusText('Could not capture voice. Please check microphone permissions.');
      };
      rec.onend = () => {
        setIsRecording(false);
      };
      rec.start();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      const browserBackup = startBrowserSpeechFallback();
      recognitionRef.current = browserBackup;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recognitionRef.current?.stop) recognitionRef.current.stop();

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 200) {
          setIsRecording(false);
          setVoiceStatusText('');
          return;
        }

        setTranscribing(true);
        setVoiceStatusText('Transcribing your voice...');
        try {
          const res = await transcribeVoiceAudio(blob, 'voice.webm');
          const text = (res.data?.text || '').trim();
          setVoiceStatusText('');
          if (text) {
            handleSendMessage(text, true);
          } else {
            const backupText = recognitionRef.current?.getTranscript?.() || '';
            if (backupText) handleSendMessage(backupText, true);
          }
        } catch {
          const backupText = recognitionRef.current?.getTranscript?.() || '';
          setVoiceStatusText('');
          if (backupText) {
            handleSendMessage(backupText, true);
          } else {
            setVoiceStatusText('Voice transcription unavailable — check GROQ_API_KEY or use Chrome.');
          }
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setVoiceStatusText('Recording... Click Stop when done speaking');
    } catch {
      setIsRecording(false);
      setVoiceStatusText('Microphone access denied. Please allow microphone permission in your browser.');
    }
  };

  const stopVoiceRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (recognitionRef.current?.stop) {
      recognitionRef.current.stop();
    }
  };

  const departments = digest?.departments?.length
    ? digest.departments
    : ['Engineering', 'Product', 'Sales', 'HR', 'Finance'];

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', height: '100%' }}>
      {/* Unified Full-Height Chat Card */}
      <div
        className="glass-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 28px)',
          minHeight: '460px',
          border: '1px solid rgba(199, 210, 254, 0.85)',
          borderRadius: '20px',
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 20px 50px -12px rgba(79, 70, 229, 0.10), 0 4px 16px -2px rgba(15, 23, 42, 0.05)',
        }}
      >
        {/* Sleek Glassmorphic Header */}
        <div
          style={{
            position: 'relative',
            padding: '10px 20px',
            flexShrink: 0,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(238,242,255,0.7) 55%, rgba(245,243,255,0.8) 100%)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '2px',
              background:
                'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, #6366f1 30%, #a855f7 55%, #3b82f6 80%, rgba(59,130,246,0.08) 100%)',
            }}
          />

          {/* Left Brand & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexShrink: 0 }}>
            <BotAvatar size={38} glow={true} isSpeaking={speakingMsgId !== null} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: '1.04rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #4f46e5 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Meagle360 AI
                </h1>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAdminOrManager ? 'Admin & Manager Copilot' : 'Personal HR Copilot'}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#f0fdf4',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#22c55e',
                      boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.22)',
                      display: 'inline-block',
                    }}
                  />
                  Online • Voice & Chat
                </span>
              </div>
              <p style={{ margin: '1px 0 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {isAdminOrManager
                  ? 'Live Team Attendance & Leave Approvals'
                  : 'My Leaves, Personal Attendance & Instant Leave Apply'}
                {digest?.date_formatted ? ` • ${digest.date_formatted}` : ''}
              </p>
            </div>
          </div>

          {/* Right Controls: Department Filter (Admin/Manager only) + Voice Reply + Clear Chat */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            {isAdminOrManager && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: 10,
                  background: selectedDept ? '#eff6ff' : 'rgba(255, 255, 255, 0.85)',
                  border: selectedDept ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                  fontSize: '0.75rem',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                }}
                title="Filter queries by Department"
              >
                <Building2 size={14} style={{ color: selectedDept ? '#2563eb' : '#64748b' }} />
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: selectedDept ? '#1d4ed8' : '#0f172a',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (autoSpeak) stopSpeaking();
                setAutoSpeak((v) => !v);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: 10,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: autoSpeak ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                background: autoSpeak ? '#eff6ff' : 'rgba(255, 255, 255, 0.85)',
                color: autoSpeak ? '#1d4ed8' : '#64748b',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
              }}
              title="Automatically speak AI replies in English"
            >
              {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>{autoSpeak ? 'Voice Reply: ON' : 'Voice Reply: OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearChat}
              disabled={messages.length <= 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: 10,
                border: '1px solid #fecaca',
                background: messages.length > 1 ? '#fef2f2' : 'rgba(255, 255, 255, 0.75)',
                color: messages.length > 1 ? '#dc2626' : '#94a3b8',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: messages.length > 1 ? 'pointer' : 'not-allowed',
              }}
              title="Clear Chat History"
            >
              <Trash2 size={14} />
              <span>Clear Chat</span>
            </button>
          </div>
        </div>

        {/* Quick Prompt Bar */}
        {!isWelcomeOnly && (
          <div
            style={{
              padding: '7px 20px',
              flexShrink: 0,
              borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
              background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              overflowX: 'auto',
            }}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
              Quick Ask:
            </span>
            {activeQuickPrompts.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={loading}
                onClick={() => handleSendMessage(item.query)}
                style={{
                  padding: '4px 11px',
                  borderRadius: 999,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#1e293b',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                }}
              >
                {item.label}
                {isAdminOrManager && selectedDept && !item.query.includes('approval')
                  ? ` (${selectedDept})`
                  : ''}
              </button>
            ))}
          </div>
        )}

        {/* Messages Stream / Hero Empty State */}
        <div
          ref={streamContainerRef}
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: isWelcomeOnly ? '10px 24px' : '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: isWelcomeOnly ? '0px' : '14px',
            backgroundColor: '#ffffff',
            backgroundImage:
              'radial-gradient(at 12% 10%, rgba(99, 102, 241, 0.08) 0px, transparent 48%), ' +
              'radial-gradient(at 88% 14%, rgba(168, 85, 247, 0.07) 0px, transparent 46%), ' +
              'radial-gradient(at 50% 92%, rgba(59, 130, 246, 0.06) 0px, transparent 52%), ' +
              'radial-gradient(#cbd5e1 0.75px, transparent 0.75px)',
            backgroundSize: '100% 100%, 100% 100%, 100% 100%, 22px 22px',
          }}
        >
          {/* Top-Right Floating Demo Quota in Hero Banner */}
          {isWelcomeOnly && quota?.is_demo && (
            <div
              style={{
                position: 'absolute',
                top: 14,
                right: 20,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '10px',
                background: quota.limit_reached
                  ? 'rgba(254, 226, 226, 0.95)'
                  : (quota.chats_remaining ?? 10) <= 2
                  ? 'rgba(254, 243, 199, 0.95)'
                  : 'rgba(239, 246, 255, 0.95)',
                border: quota.limit_reached
                  ? '1px solid #fca5a5'
                  : (quota.chats_remaining ?? 10) <= 2
                  ? '1px solid #fde68a'
                  : '1px solid #bfdbfe',
                color: quota.limit_reached
                  ? '#dc2626'
                  : (quota.chats_remaining ?? 10) <= 2
                  ? '#d97706'
                  : '#1d4ed8',
                fontSize: '0.74rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
                backdropFilter: 'blur(8px)',
                zIndex: 4,
                userSelect: 'none',
              }}
              title="Daily demo limit: 10 chats/day. Resets daily at 12:00 AM IST."
            >
              <Sparkles size={13} />
              <span>Demo Quota: <strong>{quota.chats_remaining ?? 0}/{quota.daily_limit || 10}</strong> left today</span>
            </div>
          )}

          {isWelcomeOnly ? (
            <div
              style={{
                maxWidth: '720px',
                width: '100%',
                margin: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BotAvatar
                    size={76}
                    glow={true}
                    isSpeaking={speakingMsgId !== null}
                  />
                </div>

                {/* Option 2: Clean, Centered Intro Chip directly below character */}
                <button
                  type="button"
                  onClick={handleToggleIntro}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: speakingMsgId === 'intro' ? '#fee2e2' : 'rgba(255, 255, 255, 0.92)',
                    border: speakingMsgId === 'intro' ? '1px solid #f87171' : '1px solid #c7d2fe',
                    color: speakingMsgId === 'intro' ? '#dc2626' : '#4338ca',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: speakingMsgId === 'intro'
                      ? '0 2px 8px rgba(239, 68, 68, 0.22)'
                      : '0 2px 6px rgba(99, 102, 241, 0.08)',
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                  }}
                  title={speakingMsgId === 'intro' ? 'Stop Meagle AI Intro' : 'Click to hear Meagle AI voice intro'}
                >
                  {speakingMsgId === 'intro' ? (
                    <>
                      <Square size={10} fill="#dc2626" />
                      <span>Stop Intro</span>
                      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: '10px', marginLeft: '1px' }}>
                        <span style={{ width: '2px', background: '#dc2626', borderRadius: '1px', animation: 'miniBarPulse 0.7s ease-in-out infinite' }} />
                        <span style={{ width: '2px', background: '#dc2626', borderRadius: '1px', animation: 'miniBarPulse 0.7s ease-in-out 0.2s infinite' }} />
                        <span style={{ width: '2px', background: '#dc2626', borderRadius: '1px', animation: 'miniBarPulse 0.7s ease-in-out 0.4s infinite' }} />
                      </span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={12} />
                      <span>Listen Intro</span>
                    </>
                  )}
                </button>
              </div>

                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 'clamp(1.22rem, 2vw, 1.52rem)',
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 55%, #6d28d9 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      lineHeight: 1.25,
                    }}
                  >
                    {timeGreeting}, {firstName}! How can Meagle360 AI help you today?
                  </h2>
                  <p
                    style={{
                      margin: '4px auto 0',
                      fontSize: '0.82rem',
                      color: '#64748b',
                      lineHeight: 1.4,
                    }}
                  >
                    {isAdminOrManager
                      ? `Ask live questions about daily attendance, leave records, late check-ins, or approve pending leaves${
                          selectedDept ? ` in ${selectedDept}` : ' across all departments'
                        }.`
                      : 'Speak or type in English or Hinglish to check your leave balance, review your own attendance, or apply for leave.'}
                  </p>
                </div>

              {/* 4 Role-Specific Floating Capsule Pills */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '10px',
                  maxWidth: '620px',
                  width: '100%',
                }}
              >
                {activeHeroPills.map((pill) => {
                  const IconComponent = pill.icon;
                  const isHovered = hoveredCard === pill.id;

                  return (
                    <button
                      key={pill.id}
                      type="button"
                      disabled={loading}
                      onMouseEnter={() => setHoveredCard(pill.id)}
                      onMouseLeave={() => setHoveredCard(null)}
                      onClick={() => handleSendMessage(pill.query)}
                      style={{
                         display: 'flex',
                         alignItems: 'center',
                         gap: '9px',
                         width: '100%',
                         minHeight: 48,
                         padding: '8px 12px 8px 10px',
                         borderRadius: '14px',
                        background: isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(8px)',
                        border: isHovered ? `1.5px solid ${pill.borderHover}` : '1px solid #cbd5e1',
                        boxShadow: isHovered
                          ? `0 8px 20px -4px ${pill.glowHover}, 0 0 0 3px ${pill.glowHover}`
                          : '0 2px 6px rgba(15, 23, 42, 0.04)',
                        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: pill.iconBg,
                          color: pill.iconColor,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <IconComponent size={14} />
                      </span>

                       <span
                         style={{
                           flex: 1,
                           minWidth: 0,
                           textAlign: 'left',
                           fontSize: '0.82rem',
                           fontWeight: 700,
                           lineHeight: 1.3,
                           color: isHovered ? '#0f172a' : '#1e293b',
                         }}
                       >
                         {pill.label}
                       </span>

                      <ArrowUpRight
                        size={14}
                        style={{
                          color: isHovered ? pill.iconColor : '#94a3b8',
                          transform: isHovered ? 'translate(1px, -1px)' : 'none',
                          transition: 'all 0.18s ease',
                          flexShrink: 0,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages
              .filter((msg) => msg.id !== 'welcome')
              .map((msg) => {
                const isUser = msg.role === 'user';
                const isSpeakingThis = speakingMsgId === msg.id;

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                      gap: '10px',
                    }}
                  >
                    {!isUser && <BotAvatar size={38} isSpeaking={speakingMsgId === msg.id} />}

                    <div
                      style={{
                        maxWidth: '78%',
                        padding: '13px 16px',
                        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: isUser
                          ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                          : msg.isError
                          ? '#fef2f2'
                          : '#f8fafc',
                        color: isUser ? '#ffffff' : '#0f172a',
                        border: isUser ? 'none' : msg.isError ? '1px solid #fecaca' : '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      }}
                    >
                      {isUser && msg.viaVoice && (
                        <div
                          style={{
                            fontSize: '0.68rem',
                            opacity: 0.85,
                            marginBottom: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Mic size={11} /> Asked via Voice
                        </div>
                      )}

                      <div
                        style={{ fontSize: '0.92rem', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: formatMessageHtml(msg.content) }}
                      />

                      {/* Interactive Action Cards Below AI Message (Leave Apply / Leave Approve) */}
                      {!isUser && msg.pending_actions?.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          {msg.pending_actions.map((card) => (
                            <ActionConfirmationCard
                              key={card.action_id}
                              card={card}
                              onActionComplete={(confirmationText) => {
                                loadDigest();
                                if (autoSpeak && confirmationText) {
                                  speakReply(msg.id, confirmationText);
                                }
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Footer: Verified Tool Badges + Speak Button + Timestamp */}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          marginTop: '10px',
                          paddingTop: !isUser ? '8px' : '0',
                          borderTop: !isUser ? '1px solid #e2e8f0' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {!isUser &&
                            msg.tools_used?.map((t) => (
                              <span
                                key={t}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                }}
                              >
                                <CheckCircle2 size={11} />
                                Verified: {TOOL_LABELS[t] || t}
                              </span>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                          {!isUser && (
                            <button
                              type="button"
                              onClick={() =>
                                isSpeakingThis ? stopSpeaking() : speakReply(msg.id, msg.content)
                              }
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                background: isSpeakingThis ? '#fee2e2' : '#ffffff',
                                color: isSpeakingThis ? '#dc2626' : '#334155',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                              title={isSpeakingThis ? 'Stop speaking' : 'Listen to this reply'}
                            >
                              {isSpeakingThis ? (
                                <>
                                  <Square size={11} /> Stop
                                </>
                              ) : (
                                <>
                                  <Volume2 size={12} /> Listen
                                </>
                              )}
                            </button>
                          )}
                          <span
                            style={{
                              fontSize: '0.68rem',
                              color: isUser ? 'rgba(255,255,255,0.75)' : '#94a3b8',
                            }}
                          >
                            {msg.timestamp}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isUser && (
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: '#dbeafe',
                          color: '#1d4ed8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        <User size={18} />
                      </div>
                    )}
                  </div>
                );
              })
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.875rem' }}>
              <BotAvatar size={36} />
              <span>
                {isAdminOrManager
                  ? 'Checking live HRMS attendance & leave records...'
                  : 'Checking your personal leave & attendance records...'}
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Voice Status Banner */}
        {(isRecording || transcribing || voiceStatusText) && (
          <div
            style={{
              padding: '8px 20px',
              background: isRecording ? '#fef2f2' : '#eff6ff',
              borderTop: '1px solid #e2e8f0',
              color: isRecording ? '#dc2626' : '#1d4ed8',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{voiceStatusText}</span>
            {isRecording && (
              <button
                type="button"
                onClick={stopVoiceRecording}
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: '1px solid #dc2626',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Stop & Send
              </button>
            )}
          </div>
        )}

        {/* Daily Demo Limit Reached Paywall Banner */}
        {quota?.is_demo && quota?.limit_reached && (
          <div
            style={{
              padding: '10px 20px 0',
              flexShrink: 0,
              background: '#fffbeb',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                padding: '9px 14px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #fef3c7 0%, #fee2e2 100%)',
                border: '1px solid #fca5a5',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <AlertCircle size={17} style={{ color: '#dc2626', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.81rem', fontWeight: 800, color: '#991b1b' }}>
                    Daily Demo Limit Reached ({quota.daily_limit || 10}/{quota.daily_limit || 10} chats)
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#7f1d1d' }}>
                    Aapne aaj ki 10 demo chats complete kar li hain. Yeh kal 12:00 AM IST par reset ho jayegi.
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#991b1b',
                  background: 'rgba(255,255,255,0.85)',
                  padding: '3px 10px',
                  borderRadius: 8,
                }}
              >
                Auto-resets at 12:00 AM IST
              </span>
            </div>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{
            padding: '8px 20px 10px',
            flexShrink: 0,
            borderTop: '1px solid rgba(226, 232, 240, 0.75)',
            background: 'linear-gradient(180deg, rgba(248,250,252,0.85) 0%, #f1f5f9 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 8px',
              borderRadius: '18px',
              background: '#ffffff',
              border: isRecording
                ? '1.5px solid #ef4444'
                : isInputFocused
                ? '1.5px solid #6366f1'
                : '1.5px solid #cbd5e1',
              boxShadow: isRecording
                ? '0 0 0 4px rgba(239, 68, 68, 0.15), 0 10px 25px -5px rgba(220, 38, 38, 0.14)'
                : isInputFocused
                ? '0 0 0 4px rgba(99, 102, 241, 0.16), 0 12px 28px -6px rgba(79, 70, 229, 0.16)'
                : '0 6px 20px -4px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.03)',
              transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <button
              type="button"
              disabled={loading || transcribing || Boolean(quota?.is_demo && quota?.limit_reached)}
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                border: isRecording ? '1.5px solid #dc2626' : '1px solid #e0e7ff',
                background: isRecording
                  ? '#fee2e2'
                  : 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
                color: isRecording ? '#dc2626' : '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: Boolean(quota?.is_demo && quota?.limit_reached) ? 'not-allowed' : 'pointer',
                opacity: Boolean(quota?.is_demo && quota?.limit_reached) ? 0.45 : 1,
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
              title={
                Boolean(quota?.is_demo && quota?.limit_reached)
                  ? 'Daily demo limit reached'
                  : isRecording
                  ? 'Stop recording and send'
                  : 'Ask with your Voice (English or Hinglish)'
              }
            >
              {isRecording ? <MicOff size={19} /> : <Mic size={19} />}
            </button>

            <input
              type="text"
              value={input}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                quota?.is_demo && quota?.limit_reached
                  ? 'Daily demo limit (10 chats) reached. Resets at 12:00 AM IST.'
                  : isAdminOrManager
                  ? selectedDept
                    ? `Ask about ${selectedDept} (e.g. 'Who is present today?', 'Approve pending leaves')...`
                    : "Ask e.g. 'Who is present today in Engineering?', 'Approve Rahul's leave'..."
                  : "Ask e.g. 'What is my leave balance?', 'How is my attendance?', 'Apply sick leave for tomorrow'..."
              }
              disabled={loading || isRecording || Boolean(quota?.is_demo && quota?.limit_reached)}
              style={{
                flex: 1,
                height: 40,
                padding: '0 10px',
                border: 'none',
                background: 'transparent',
                fontSize: '0.93rem',
                fontWeight: 500,
                color: Boolean(quota?.is_demo && quota?.limit_reached) ? '#94a3b8' : '#0f172a',
                outline: 'none',
              }}
            />

            <button
              type="submit"
              disabled={!input.trim() || loading || isRecording || Boolean(quota?.is_demo && quota?.limit_reached)}
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 13,
                border: 'none',
                background:
                  !input.trim() || loading || isRecording || Boolean(quota?.is_demo && quota?.limit_reached)
                    ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                    : 'linear-gradient(135deg, #2563eb 0%, #4f46e5 55%, #7c3aed 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: !input.trim() || loading || Boolean(quota?.is_demo && quota?.limit_reached) ? 'not-allowed' : 'pointer',
                opacity: !input.trim() || loading || Boolean(quota?.is_demo && quota?.limit_reached) ? 0.55 : 1,
                boxShadow:
                  !input.trim() || loading || isRecording || Boolean(quota?.is_demo && quota?.limit_reached)
                    ? 'none'
                    : '0 4px 14px rgba(79, 70, 229, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <Sparkles size={15} />
              <span>Ask AI</span>
              <Send size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
