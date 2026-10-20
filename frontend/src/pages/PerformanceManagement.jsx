import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePopup } from '../context/PopupContext';
import {
  getPmsConfig,
  updatePmsConfig,
  getParameters,
  createParameter,
  updateParameter,
  getSlabs,
  createSlab,
  deleteSlab,
  getCycles,
  createCycle,
  launchCycle,
  advanceCycle,
  finalizeCycle,
  releaseCycle,
  closeCycle,
  getCycleParticipants,
  getCycleCompletion,
  computeCycleScores,
  getGoals,
  createGoal,
  deleteGoal,
  submitGoals,
  approveGoals,
  returnGoals,
  recordGoalProgress,
  getMyTasks,
  getTaskDetail,
  submitTaskRatings,
  getMyResult,
  getTeamResults,
  getCompanyResults,
  adjustParticipantScore,
  getMyHistory,
  getPayrollRevisions,
  approvePayrollRevision,
  rejectPayrollRevision,
  applyPayrollRevision,
} from '../api/pms';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Award,
  Target,
  Users,
  Settings,
  TrendingUp,
  CheckCircle2,
  Clock,
  Lock,
  Play,
  FastForward,
  Star,
  Plus,
  Trash2,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Send,
  Calendar,
  BarChart3,
  DollarSign,
  Search,
  Filter,
  Check,
  Sparkles,
  Shield,
  ChevronRight,
  ChevronDown,
  Info,
  CheckCheck,
  TrendingDown,
  Layers,
  ArrowUpRight,
  UserCheck,
} from 'lucide-react';

const CYCLE_BADGE = {
  draft: { label: 'Draft', bg: '#f1f5f9', color: '#475569' },
  goal_setting: { label: 'Goal Setting', bg: '#eff6ff', color: '#2563eb' },
  rating: { label: 'Rating Open', bg: '#fef3c7', color: '#d97706' },
  review: { label: 'HR / Manager Review', bg: '#ede9fe', color: '#7c3aed' },
  finalized: { label: 'Finalized (Locked)', bg: '#e0e7ff', color: '#4338ca' },
  released: { label: 'Released', bg: '#dcfce7', color: '#15803d' },
  payroll_approved: { label: 'Payroll Approved', bg: '#d1fae5', color: '#047857' },
  closed: { label: 'Closed', bg: '#e2e8f0', color: '#334155' },
};

function formatCurrency(num) {
  if (num == null || isNaN(num)) return '—';
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function getInitials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function getAvatarPalette(name) {
  const palette = [
    { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
    { bg: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' },
    { bg: '#d1fae5', color: '#065f46', border: '#a7f3d0' },
    { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
    { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
    { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
    { bg: '#cffafe', color: '#155e75', border: '#a5f3fc' },
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

const SCORE_LABELS = {
  1: { label: 'Needs Improvement', desc: 'Significant gap against expectations', color: '#ef4444', bg: '#fee2e2' },
  2: { label: 'Developing', desc: 'Inconsistent execution, needs coaching', color: '#f59e0b', bg: '#fef3c7' },
  3: { label: 'Meets Expectations', desc: 'Solid, reliable performance', color: '#3b82f6', bg: '#eff6ff' },
  4: { label: 'Exceeds Expectations', desc: 'Proactive and delivers extra impact', color: '#10b981', bg: '#d1fae5' },
  5: { label: 'Outstanding', desc: 'Exceptional, role model contributions', color: '#8b5cf6', bg: '#ede9fe' },
};

export default function PerformanceManagement() {
  const { user, loading: authLoading } = useAuth();
  const { showPrompt, showConfirm, showAlert } = usePopup();

  const isAdmin =
    user?.role_name === 'Admin' ||
    user?.role?.name === 'Admin' ||
    !!user?.permissions?.['settings:write'];
  const isManager =
    user?.role_name === 'Manager' ||
    !!user?.permissions?.['leave:approve'] ||
    !!user?.permissions?.['attendance:approve'];
  const isStaff = isAdmin || isManager;

  const [tab, setTab] = useState('tasks');
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Rater tasks
  const [myTasks, setMyTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [ratingForm, setRatingForm] = useState({});
  const [submittingRating, setSubmittingRating] = useState(false);
  const [taskFilter, setTaskFilter] = useState('all'); // 'all' | 'pending' | 'submitted' | 'self' | 'manager' | 'peer'
  const [taskSearch, setTaskSearch] = useState('');

  // My Goals & Result & History
  const [myGoals, setMyGoals] = useState([]);
  const [myResult, setMyResult] = useState(null);
  const [myHistory, setMyHistory] = useState([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: '',
    description: '',
    category: 'output',
    weight: 25,
    target_value: 100,
    unit: '%',
    direction: 'higher_better',
  });
  const [progressGoal, setProgressGoal] = useState(null);
  const [progressForm, setProgressForm] = useState({ actual_value: '', note: '' });

  // Team Reviews (Manager / Admin)
  const [teamParticipants, setTeamParticipants] = useState([]);
  const [selectedTeamMember, setSelectedTeamMember] = useState(null);
  const [teamMemberGoals, setTeamMemberGoals] = useState([]);
  const [teamResults, setTeamResults] = useState([]);
  const [adjustModal, setAdjustModal] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ adjusted_score: '', reason: '' });

  // Admin Console / Company Results / Payroll Revisions / Config
  const [completionList, setCompletionList] = useState([]);
  const [companyResults, setCompanyResults] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [config, setConfig] = useState(null);
  const [parameters, setParameters] = useState([]);
  const [slabs, setSlabs] = useState([]);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    goal_setting_deadline: '',
    rating_start: '',
    rating_end: '',
    review_end: '',
  });
  const [newParam, setNewParam] = useState({ name: '', description: '' });
  const [newSlab, setNewSlab] = useState({
    label: '',
    min_score: '',
    max_score: '',
    hike_percent: '',
  });
  const [approveModal, setApproveModal] = useState(null);
  const [approveForm, setApproveForm] = useState({
    approved_hike_percent: '',
    effective_date: '',
    override_reason: '',
  });

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) || null;

  useEffect(() => {
    if (!authLoading && user) {
      loadInitial();
    }
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (selectedCycleId && !authLoading && user) {
      loadCycleScoped(selectedCycleId);
    }
  }, [selectedCycleId, tab]);

  const flash = (msg, isErr = false) => {
    if (isErr) {
      setError(msg);
      setNotice('');
    } else {
      setNotice(msg);
      setError('');
    }
  };

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [cyclesRes, tasksRes, histRes] = await Promise.all([
        getCycles().catch(() => ({ data: [] })),
        getMyTasks().catch(() => ({ data: [] })),
        getMyHistory().catch(() => ({ data: [] })),
      ]);
      const cycleList = cyclesRes.data || [];
      setCycles(cycleList);
      setMyTasks(tasksRes.data || []);
      setMyHistory(histRes.data || []);
      if (cycleList.length > 0 && !selectedCycleId) {
        setSelectedCycleId(cycleList[0].id);
      }
      if (isAdmin) {
        const [cfgRes, paramRes, slabRes] = await Promise.all([
          getPmsConfig().catch(() => ({ data: null })),
          getParameters(true).catch(() => ({ data: [] })),
          getSlabs().catch(() => ({ data: [] })),
        ]);
        if (cfgRes.data) setConfig(cfgRes.data);
        setParameters(paramRes.data || []);
        setSlabs(slabRes.data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCycleScoped = async (cycleId) => {
    if (!cycleId) return;
    try {
      const goalsRes = await getGoals(cycleId).catch(() => ({ data: [] }));
      setMyGoals(goalsRes.data || []);

      const myRes = await getMyResult(cycleId).catch(() => ({ data: null }));
      setMyResult(myRes.data || null);

      if (isStaff) {
        const [partsRes, teamRes] = await Promise.all([
          getCycleParticipants(cycleId).catch(() => ({ data: [] })),
          getTeamResults(cycleId).catch(() => ({ data: [] })),
        ]);
        setTeamParticipants(partsRes.data || []);
        setTeamResults(teamRes.data || []);
      }

      if (isAdmin) {
        const [compRes, coRes, revRes] = await Promise.all([
          getCycleCompletion(cycleId).catch(() => ({ data: [] })),
          getCompanyResults(cycleId).catch(() => ({ data: null })),
          getPayrollRevisions(cycleId).catch(() => ({ data: [] })),
        ]);
        setCompletionList(compRes.data || []);
        setCompanyResults(coRes.data || null);
        setRevisions(revRes.data || []);
      }
    } catch (err) {
      console.error('Error loading cycle data:', err);
    }
  };

  // ── Rater Task Actions ──────────────────────────────────────
  const openRatingModal = async (task) => {
    try {
      const res = await getTaskDetail(task.id);
      const detail = res.data;
      const init = {};
      (detail.parameters || []).forEach((p) => {
        init[p.id] = { score: 4, comment: '' };
      });
      setRatingForm(init);
      setActiveTask(detail);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to open rating form', true);
    }
  };

  const handleSubmitRatings = async (e) => {
    e.preventDefault();
    if (!activeTask) return;
    setSubmittingRating(true);
    try {
      const ratings = (activeTask.parameters || []).map((p) => ({
        parameter_id: p.id,
        score: Number(ratingForm[p.id]?.score || 4),
        comment: ratingForm[p.id]?.comment?.trim() || null,
      }));
      await submitTaskRatings(activeTask.id, ratings);
      setActiveTask(null);
      flash('Rating submitted! Peer ratings remain strictly anonymous.');
      const tasksRes = await getMyTasks();
      setMyTasks(tasksRes.data || []);
      if (selectedCycleId) loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to submit rating', true);
    } finally {
      setSubmittingRating(false);
    }
  };

  // ── Goal Actions ────────────────────────────────────────────
  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!selectedCycleId) return;
    try {
      await createGoal(selectedCycleId, {
        ...goalForm,
        weight: Number(goalForm.weight),
        target_value: Number(goalForm.target_value),
      });
      setShowGoalModal(false);
      setGoalForm({
        title: '',
        description: '',
        category: 'output',
        weight: 25,
        target_value: 100,
        unit: '%',
        direction: 'higher_better',
      });
      flash('Goal added.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to create goal', true);
    }
  };

  const handleDeleteGoal = async (goalId) => {
    try {
      await deleteGoal(goalId);
      flash('Goal removed.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to delete goal', true);
    }
  };

  const handleSubmitMyGoals = async () => {
    try {
      await submitGoals(selectedCycleId);
      flash('Goals submitted to manager for approval.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to submit goals', true);
    }
  };

  const handleRecordProgress = async (e) => {
    e.preventDefault();
    if (!progressGoal) return;
    try {
      await recordGoalProgress(progressGoal.id, {
        actual_value: Number(progressForm.actual_value),
        note: progressForm.note || null,
      });
      setProgressGoal(null);
      setProgressForm({ actual_value: '', note: '' });
      flash('Goal progress recorded.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to record progress', true);
    }
  };

  // ── Team Actions (Manager / Admin) ──────────────────────────
  const inspectTeamMember = async (member) => {
    setSelectedTeamMember(member);
    try {
      const res = await getGoals(selectedCycleId, member.employee_id);
      setTeamMemberGoals(res.data || []);
    } catch {
      setTeamMemberGoals([]);
    }
  };

  const handleApproveMemberGoals = async (employeeId) => {
    try {
      await approveGoals(selectedCycleId, employeeId);
      flash('Employee goals approved.');
      if (selectedTeamMember) inspectTeamMember(selectedTeamMember);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to approve goals', true);
    }
  };

  const handleReturnMemberGoals = async (employeeId) => {
    const reason = await showPrompt({
      title: 'Return Goals to Draft',
      message: 'Please provide feedback explaining why these goals are being returned to draft.',
      placeholder: 'Enter return reason or needed adjustments...',
      confirmText: 'Return Goals',
    });
    if (!reason) return;
    try {
      await returnGoals(selectedCycleId, employeeId, reason);
      flash('Goals returned to employee.');
      if (selectedTeamMember) inspectTeamMember(selectedTeamMember);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to return goals', true);
    }
  };

  const handleAdjustScore = async (e) => {
    e.preventDefault();
    if (!adjustModal) return;
    try {
      await adjustParticipantScore(selectedCycleId, adjustModal.employee_id, {
        adjusted_score: Number(adjustForm.adjusted_score),
        reason: adjustForm.reason,
      });
      setAdjustModal(null);
      flash('Score adjusted and logged to PMS audit trail.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to adjust score', true);
    }
  };

  // ── Admin Cycle Lifecycle & Payroll Actions ─────────────────
  const handleCreateCycle = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: cycleForm.name,
        start_date: cycleForm.start_date,
        end_date: cycleForm.end_date,
        goal_setting_deadline: cycleForm.goal_setting_deadline || null,
        rating_start: cycleForm.rating_start || null,
        rating_end: cycleForm.rating_end || null,
        review_end: cycleForm.review_end || null,
      };
      const res = await createCycle(payload);
      setShowCycleModal(false);
      flash('Review cycle created in draft.');
      await loadInitial();
      if (res.data?.id) setSelectedCycleId(res.data.id);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to create cycle', true);
    }
  };

  const runCycleAction = async (fn, label) => {
    if (!selectedCycleId) return;
    try {
      await fn(selectedCycleId);
      flash(`Cycle ${label} successful.`);
      await loadInitial();
      await loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || `Failed to ${label}`, true);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await updatePmsConfig({
        cycle_frequency: config.cycle_frequency,
        weight_goals: Number(config.weight_goals),
        weight_competency: Number(config.weight_competency),
        weight_discipline: Number(config.weight_discipline),
        weight_growth: Number(config.weight_growth),
        weight_manager: Number(config.weight_manager),
        weight_peer: Number(config.weight_peer),
        weight_self: Number(config.weight_self),
        max_peer_weight: Number(config.max_peer_weight),
        min_peer_responses: Number(config.min_peer_responses),
        trim_outliers: !!config.trim_outliers,
        goal_achievement_cap: Number(config.goal_achievement_cap),
        min_tenure_days_for_hike: Number(config.min_tenure_days_for_hike),
      });
      setConfig(res.data);
      flash('PMS configuration updated.');
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to update configuration', true);
    }
  };

  const handleAddParameter = async (e) => {
    e.preventDefault();
    if (!newParam.name.trim()) return;
    try {
      await createParameter({
        name: newParam.name.trim(),
        description: newParam.description.trim() || null,
        display_order: parameters.length + 1,
      });
      setNewParam({ name: '', description: '' });
      const res = await getParameters(true);
      setParameters(res.data || []);
      flash('Competency parameter added.');
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to add parameter', true);
    }
  };

  const handleToggleParameter = async (p) => {
    try {
      await updateParameter(p.id, { is_active: !p.is_active });
      const res = await getParameters(true);
      setParameters(res.data || []);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to update parameter', true);
    }
  };

  const handleAddSlab = async (e) => {
    e.preventDefault();
    try {
      await createSlab({
        label: newSlab.label.trim(),
        min_score: Number(newSlab.min_score),
        max_score: Number(newSlab.max_score),
        hike_percent: Number(newSlab.hike_percent),
      });
      setNewSlab({ label: '', min_score: '', max_score: '', hike_percent: '' });
      const res = await getSlabs();
      setSlabs(res.data || []);
      flash('Rating slab added.');
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to create slab', true);
    }
  };

  const handleDeleteSlab = async (id) => {
    try {
      await deleteSlab(id);
      const res = await getSlabs();
      setSlabs(res.data || []);
      flash('Slab deleted.');
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to delete slab', true);
    }
  };

  const handleApproveRevision = async (e) => {
    e.preventDefault();
    if (!approveModal) return;
    try {
      await approvePayrollRevision(approveModal.id, {
        approved_hike_percent:
          approveForm.approved_hike_percent !== ''
            ? Number(approveForm.approved_hike_percent)
            : null,
        effective_date: approveForm.effective_date || null,
        override_reason: approveForm.override_reason?.trim() || null,
      });
      setApproveModal(null);
      flash('Payroll revision approved.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to approve revision', true);
    }
  };

  const handleRejectRevision = async (rev) => {
    const reason = await showPrompt({
      title: 'Reject Hike Suggestion',
      message: `Provide a reason for rejecting the hike recommendation for ${rev.employee_name}:`,
      placeholder: 'Enter reason for rejection...',
      confirmText: 'Reject Revision',
    });
    if (!reason) return;
    try {
      await rejectPayrollRevision(rev.id, reason);
      flash('Payroll revision rejected.');
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to reject revision', true);
    }
  };

  const handleApplyRevision = async (rev) => {
    const ok = await showConfirm({
      title: 'Apply Salary Revision',
      message: `Apply ${rev.approved_hike_percent}% hike for ${rev.employee_name} effective ${rev.effective_date}? This will create a new salary assignment.`,
      type: 'warning',
      confirmText: 'Apply Hike',
    });
    if (!ok) return;
    try {
      await applyPayrollRevision(rev.id);
      flash(`Hike applied to payroll for ${rev.employee_name}.`);
      loadCycleScoped(selectedCycleId);
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to apply revision to payroll', true);
    }
  };

  const totalGoalWeight = myGoals.reduce((acc, g) => acc + Number(g.weight || 0), 0);
  const pendingTasksList = myTasks.filter((t) => t.status === 'pending');
  const submittedTasksList = myTasks.filter((t) => t.status === 'submitted');
  const pendingTasksCount = pendingTasksList.length;
  const submittedTasksCount = submittedTasksList.length;
  const selfTasksList = myTasks.filter((t) => t.rater_type === 'self');
  const managerTasksList = myTasks.filter((t) => t.rater_type === 'manager');
  const peerTasksList = myTasks.filter((t) => t.rater_type === 'peer');
  const completionPercentage = myTasks.length > 0 ? Math.round((submittedTasksCount / myTasks.length) * 100) : 0;

  const filteredTasks = myTasks.filter((t) => {
    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase();
      const matchName = t.ratee_name?.toLowerCase().includes(q);
      const matchCycle = t.cycle_name?.toLowerCase().includes(q);
      const matchType = t.rater_type?.toLowerCase().includes(q);
      if (!matchName && !matchCycle && !matchType) return false;
    }
    if (taskFilter === 'pending') return t.status === 'pending';
    if (taskFilter === 'submitted') return t.status === 'submitted';
    if (taskFilter === 'self') return t.rater_type === 'self';
    if (taskFilter === 'manager') return t.rater_type === 'manager';
    if (taskFilter === 'peer') return t.rater_type === 'peer';
    return true;
  });

  const cycleBadge = CYCLE_BADGE[selectedCycle?.status] || CYCLE_BADGE.draft;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 8px 16px -4px rgba(79, 70, 229, 0.35)',
              flexShrink: 0,
            }}
          >
            <Award size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                Performance Management (PMS)
              </h1>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)',
                  color: '#4338ca',
                  border: '1px solid #c7d2fe',
                }}
              >
                360° Framework
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '3px 0 0 0' }}>
              Goals, 360° Self + Manager + Anonymous Peer ratings, and Payroll hike linkage.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {cycles.length > 0 && (
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={selectedCycleId}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  minWidth: 230,
                  padding: '7px 34px 7px 12px',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  outline: 'none',
                  lineHeight: 1.4,
                }}
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                style={{
                  position: 'absolute',
                  right: 11,
                  pointerEvents: 'none',
                  color: '#64748b',
                }}
              />
            </div>
          )}
          {selectedCycle && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: '0.78rem',
                fontWeight: 700,
                background: cycleBadge.bg,
                color: cycleBadge.color,
                border: `1px solid ${cycleBadge.color}30`,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: cycleBadge.color,
                  display: 'inline-block',
                }}
              />
              {cycleBadge.label}
            </span>
          )}
          {isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCycleModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                fontSize: '0.85rem',
                borderRadius: 10,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <Plus size={16} /> New Cycle
            </button>
          )}
        </div>
      </div>

      {/* ── Cycle Lifecycle Stepper Roadmap ─────────────────── */}
      {selectedCycle && (
        <>
          <style>{`
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>
          <div
            className="hide-scrollbar"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {[
              { id: 'goal_setting', label: 'Goal Setting' },
              { id: 'rating', label: '360° Rating' },
              { id: 'review', label: 'Manager Review' },
              { id: 'finalized', label: 'Finalized' },
              { id: 'released', label: 'Released' },
              { id: 'payroll_approved', label: 'Payroll' },
            ].map((stage, idx, arr) => {
              const stagesOrder = ['draft', 'goal_setting', 'rating', 'review', 'finalized', 'released', 'payroll_approved', 'closed'];
              const currentIdx = stagesOrder.indexOf(selectedCycle.status);
              const stageIdx = stagesOrder.indexOf(stage.id);
              const isCompleted = currentIdx > stageIdx;
              const isCurrent = currentIdx === stageIdx;

              return (
                <div
                  key={stage.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    flexShrink: 0,
                    opacity: isCurrent ? 1 : isCompleted ? 0.95 : 0.45,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: isCurrent
                        ? 'var(--accent-blue, #2563eb)'
                        : isCompleted
                        ? '#10b981'
                        : '#e2e8f0',
                      color: isCurrent || isCompleted ? '#ffffff' : '#64748b',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isCurrent ? '0 0 0 3px rgba(37, 99, 235, 0.18)' : 'none',
                      flexShrink: 0,
                    }}
                  >
                    {isCompleted ? <Check size={12} strokeWidth={3} /> : idx + 1}
                  </div>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: isCurrent ? 700 : isCompleted ? 600 : 500,
                      color: isCurrent ? 'var(--accent-blue, #2563eb)' : isCompleted ? '#0f172a' : '#64748b',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {stage.label}
                  </span>
                  {idx < arr.length - 1 && (
                    <ChevronRight size={13} style={{ color: '#cbd5e1', marginLeft: 4, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Flash banners ───────────────────────────────────── */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.875rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.875rem',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      {/* ── Summary Cards ───────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Pending Reviews */}
        <div
          className="glass-card"
          style={{
            padding: '18px 20px',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: pendingTasksCount > 0 ? 'var(--accent-amber, #d97706)' : 'var(--accent-emerald, #10b981)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: pendingTasksCount > 0 ? '#fef3c7' : '#d1fae5',
                color: pendingTasksCount > 0 ? '#b45309' : '#065f46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Star size={19} />
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: pendingTasksCount > 0 ? '#fffbeb' : '#ecfdf5',
                color: pendingTasksCount > 0 ? '#b45309' : '#047857',
                border: pendingTasksCount > 0 ? '1px solid #fde68a' : '1px solid #a7f3d0',
              }}
            >
              {pendingTasksCount > 0 ? '⚡ Action Required' : '✓ All Complete'}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              Pending Reviews to Fill
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>
              {pendingTasksCount}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: 5 }}>
              <span>{submittedTasksCount} of {myTasks.length} submitted</span>
              <span style={{ fontWeight: 700 }}>{completionPercentage}%</span>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${completionPercentage}%`,
                  background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                  borderRadius: 999,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: My Goals Weight */}
        <div
          className="glass-card"
          style={{
            padding: '18px 20px',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: totalGoalWeight === 100 ? 'var(--accent-emerald, #10b981)' : 'var(--accent-blue, #2563eb)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={19} />
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: totalGoalWeight === 100 ? '#ecfdf5' : '#eff6ff',
                color: totalGoalWeight === 100 ? '#047857' : '#1d4ed8',
                border: totalGoalWeight === 100 ? '1px solid #a7f3d0' : '1px solid #bfdbfe',
              }}
            >
              {totalGoalWeight === 100 ? '✓ Balanced' : `${100 - totalGoalWeight}% Needed`}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              My Goals Weight
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>
              {totalGoalWeight}%
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: 5 }}>
              <span>{myGoals.length} goal(s) enrolled</span>
              <span style={{ fontWeight: 700 }}>Target: 100%</span>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(totalGoalWeight, 100)}%`,
                  background: totalGoalWeight === 100 ? '#10b981' : '#3b82f6',
                  borderRadius: 999,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Latest Score */}
        <div
          className="glass-card"
          style={{
            padding: '18px 20px',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#d1fae5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingUp size={19} />
            </div>
            {myResult?.final_rating_label && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: '#f0fdf4',
                  color: '#15803d',
                  border: '1px solid #bbf7d0',
                }}
              >
                {myResult.final_rating_label}
              </span>
            )}
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              My Latest Score
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>
              {myResult?.effective_score ? `${myResult.effective_score} / 5` : '—'}
            </div>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={13} style={{ color: '#f59e0b' }} />
            <span>{myResult?.effective_score ? 'Final aggregated 360° score' : 'Visible once cycle is released'}</span>
          </div>
        </div>

        {/* Card 4: Past Cycles */}
        <div
          className="glass-card"
          style={{
            padding: '18px 20px',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: '#6366f1',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#e0e7ff',
                color: '#4338ca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calendar size={19} />
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: '#eef2ff',
                color: '#4338ca',
                border: '1px solid #c7d2fe',
              }}
            >
              Historical
            </span>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              Past Cycles Completed
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>
              {myHistory.length}
            </div>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
            Historical appraisal records saved
          </div>
        </div>
      </div>

      {/* ── Segmented Navigation Tabs ────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: 6,
          background: '#f1f5f9',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {[
          {
            id: 'tasks',
            label: 'My Rating Tasks',
            icon: Star,
            badge: pendingTasksCount > 0 ? pendingTasksCount : null,
            badgeAlert: pendingTasksCount > 0,
            show: true,
          },
          {
            id: 'goals',
            label: 'My Goals & Results',
            icon: Target,
            badge: myGoals.length > 0 ? myGoals.length : null,
            badgeAlert: false,
            show: true,
          },
          {
            id: 'team',
            label: 'Team Reviews',
            icon: Users,
            badge: teamParticipants.length > 0 ? teamParticipants.length : null,
            badgeAlert: false,
            show: isStaff,
          },
          {
            id: 'console',
            label: 'Cycle Console & Distribution',
            icon: BarChart3,
            badge: null,
            show: isAdmin,
          },
          {
            id: 'payroll',
            label: 'Payroll Revisions',
            icon: DollarSign,
            badge: revisions.length > 0 ? revisions.length : null,
            badgeAlert: false,
            show: isAdmin,
          },
          {
            id: 'config',
            label: 'PMS Config & Slabs',
            icon: Settings,
            badge: null,
            show: isAdmin,
          },
        ]
          .filter((t) => t.show)
          .map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 10,
                  border: active ? '1px solid #cbd5e1' : '1px solid transparent',
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? 'var(--accent-blue, #2563eb)' : '#475569',
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  boxShadow: active ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                <Icon size={16} style={{ color: active ? 'var(--accent-blue, #2563eb)' : '#94a3b8' }} />
                <span>{t.label}</span>
                {t.badge != null && (
                  <span
                    style={{
                      padding: '2px 7px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      background: t.badgeAlert ? '#fef3c7' : active ? '#eff6ff' : '#e2e8f0',
                      color: t.badgeAlert ? '#b45309' : active ? '#2563eb' : '#64748b',
                      border: t.badgeAlert ? '1px solid #fde68a' : 'none',
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* ── TAB 1: My Rating Tasks (Self / Manager / Department Peers) ── */}
      {tab === 'tasks' && (
        <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 16,
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  Assigned Reviews (Self, Manager & Same-Department Peers)
                </h3>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: '#f1f5f9',
                    color: '#475569',
                  }}
                >
                  {myTasks.length} Assigned
                </span>
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.5 }}>
                Peer ratings are strictly <strong>100% anonymous</strong> — individual ratings are never disclosed to the employee or manager.
              </p>
            </div>

            {/* Quick Completion Stats */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '8px 14px',
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Completed: <strong style={{ color: '#0f172a' }}>{submittedTasksCount} / {myTasks.length}</strong>
              </div>
              <div style={{ width: 80, height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${completionPercentage}%`,
                    background: '#10b981',
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Search & Sub-Filter Ribbon */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {/* Sub-Filter Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All (${myTasks.length})` },
                { id: 'pending', label: `Pending (${pendingTasksCount})`, alert: pendingTasksCount > 0 },
                { id: 'submitted', label: `Completed (${submittedTasksCount})` },
                { id: 'self', label: `Self (${selfTasksList.length})` },
                { id: 'manager', label: `Direct Reports (${managerTasksList.length})` },
                { id: 'peer', label: `Peers (${peerTasksList.length})` },
              ].map((f) => {
                const active = taskFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTaskFilter(f.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: active ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                      background: active ? '#eff6ff' : '#ffffff',
                      color: active ? '#1d4ed8' : '#64748b',
                      fontSize: '0.8rem',
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 220 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                placeholder="Search colleague or cycle..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Table Content */}
          {myTasks.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px dashed #cbd5e1',
              }}
            >
              <Info size={32} style={{ color: '#94a3b8', marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: '#0f172a' }}>No Open Rating Tasks Right Now</div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                Tasks appear automatically when a cycle enters the Rating stage.
              </p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div
              style={{
                padding: '30px 20px',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px dashed #cbd5e1',
              }}
            >
              <div style={{ fontWeight: 600 }}>No reviews match your filter</div>
              <button
                type="button"
                onClick={() => {
                  setTaskFilter('all');
                  setTaskSearch('');
                }}
                className="btn btn-secondary"
                style={{ marginTop: 10, padding: '4px 12px', fontSize: '0.8rem' }}
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Employee / Colleague
                    </th>
                    <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Review Relationship
                    </th>
                    <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Appraisal Cycle
                    </th>
                    <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Status
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t) => {
                    const avatarPalette = getAvatarPalette(t.ratee_name);
                    const isSelf = t.rater_type === 'self';
                    const isManagerType = t.rater_type === 'manager';
                    const isPeer = t.rater_type === 'peer';

                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* Col 1: Colleague with Avatar */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: avatarPalette.bg,
                                color: avatarPalette.color,
                                border: `1px solid ${avatarPalette.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(t.ratee_name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                                {t.ratee_name}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                {isSelf ? 'Yourself' : isManagerType ? 'Direct Report' : 'Department Peer'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Col 2: Review Type */}
                        <td style={{ padding: '12px 14px' }}>
                          {isSelf && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: '#ede9fe',
                                color: '#6d28d9',
                                border: '1px solid #ddd6fe',
                              }}
                            >
                              <UserCheck size={13} /> Self Review
                            </span>
                          )}
                          {isManagerType && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: '#d1fae5',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                              }}
                            >
                              <Users size={13} /> Manager Review
                            </span>
                          )}
                          {isPeer && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: '#e0f2fe',
                                color: '#0369a1',
                                border: '1px solid #bae6fd',
                              }}
                            >
                              <Shield size={13} /> Peer (Anonymous)
                            </span>
                          )}
                        </td>

                        {/* Col 3: Cycle */}
                        <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: '#475569' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Calendar size={13} style={{ color: '#94a3b8' }} />
                            {t.cycle_name}
                          </span>
                        </td>

                        {/* Col 4: Status */}
                        <td style={{ padding: '12px 14px' }}>
                          {t.status === 'submitted' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                              }}
                            >
                              <Check size={12} strokeWidth={3} /> Submitted
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                              }}
                            >
                              <Clock size={12} /> Pending
                            </span>
                          )}
                        </td>

                        {/* Col 5: Action */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {t.status === 'pending' ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => openRatingModal(t)}
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.8rem',
                                borderRadius: 8,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)',
                              }}
                            >
                              <Star size={13} /> Rate Now
                            </button>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                color: '#64748b',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                padding: '4px 10px',
                                background: '#f8fafc',
                                borderRadius: 8,
                              }}
                            >
                              <CheckCircle2 size={14} style={{ color: '#10b981' }} /> Done
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: My Goals, Released Result & History ──────── */}
      {tab === 'goals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Goals Section */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: '1px solid #f1f5f9',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    My Goals & Performance Objectives
                  </h3>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 999,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: totalGoalWeight === 100 ? '#ecfdf5' : '#fef3c7',
                      color: totalGoalWeight === 100 ? '#047857' : '#b45309',
                      border: totalGoalWeight === 100 ? '1px solid #a7f3d0' : '1px solid #fde68a',
                    }}
                  >
                    {totalGoalWeight === 100 ? '✓ 100% Balanced' : `Total Weight: ${totalGoalWeight}% / 100%`}
                  </span>
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Cycle: <strong>{selectedCycle?.name || 'No Cycle Selected'}</strong>. Weights must sum to 100% before submitting for manager approval.
                </p>
              </div>

              {selectedCycle?.status === 'goal_setting' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowGoalModal(true)}
                    style={{ padding: '8px 14px', fontSize: '0.84rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={15} /> Add Objective
                  </button>
                  {myGoals.some((g) => g.status === 'draft') && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={totalGoalWeight !== 100}
                      onClick={handleSubmitMyGoals}
                      style={{
                        padding: '8px 16px',
                        fontSize: '0.84rem',
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: totalGoalWeight === 100 ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                        opacity: totalGoalWeight !== 100 ? 0.6 : 1,
                      }}
                    >
                      <Send size={14} /> Submit Goals for Approval
                    </button>
                  )}
                </div>
              )}
            </div>

            {myGoals.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                }}
              >
                <Target size={32} style={{ color: '#94a3b8', marginBottom: 8 }} />
                <div style={{ fontWeight: 600, color: '#0f172a' }}>No Goals Added for this Cycle</div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                  Define your key deliverables and targets to establish performance expectations.
                </p>
                {selectedCycle?.status === 'goal_setting' && (
                  <button
                    type="button"
                    onClick={() => setShowGoalModal(true)}
                    className="btn btn-primary"
                    style={{ marginTop: 12, padding: '7px 16px', fontSize: '0.82rem' }}
                  >
                    <Plus size={14} /> Create First Goal
                  </button>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Objective / Title
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Category
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Weight
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Target
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Achievement
                      </th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Status
                      </th>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {myGoals.map((g) => {
                      const achievementNum = g.final_achievement_pct != null ? Number(g.final_achievement_pct) : 0;
                      const isComplete = achievementNum >= 100;
                      const categoryColors = {
                        output: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                        kpi: { bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' },
                        quality: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
                        on_time: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
                      };
                      const catStyle = categoryColors[g.category] || categoryColors.output;

                      return (
                        <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem' }}>
                              {g.title}
                            </div>
                            {g.description && (
                              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 3 }}>
                                {g.description}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 14px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: catStyle.bg,
                                color: catStyle.color,
                                border: `1px solid ${catStyle.border}`,
                              }}
                            >
                              {g.category}
                            </span>
                          </td>
                          <td style={{ padding: '14px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                                {g.weight}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 14px', fontSize: '0.84rem', color: '#475569' }}>
                            <strong>{g.target_value}</strong> {g.unit || ''}
                          </td>
                          <td style={{ padding: '14px 14px', minWidth: 140 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                              <span style={{ fontWeight: 800, color: isComplete ? '#10b981' : '#0f172a' }}>
                                {g.final_achievement_pct != null ? `${g.final_achievement_pct}%` : '—'}
                              </span>
                            </div>
                            {g.final_achievement_pct != null && (
                              <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(achievementNum, 100)}%`,
                                    background: isComplete ? '#10b981' : 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                                    borderRadius: 999,
                                  }}
                                />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 14px' }}>
                            <span
                              style={{
                                padding: '3px 9px',
                                borderRadius: 999,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                textTransform: 'capitalize',
                                background:
                                  g.status === 'approved'
                                    ? '#dcfce7'
                                    : g.status === 'pending_approval'
                                    ? '#fef3c7'
                                    : g.status === 'locked'
                                    ? '#ede9fe'
                                    : '#f1f5f9',
                                color:
                                  g.status === 'approved'
                                    ? '#15803d'
                                    : g.status === 'pending_approval'
                                    ? '#b45309'
                                    : g.status === 'locked'
                                    ? '#6d28d9'
                                    : '#475569',
                              }}
                            >
                              {g.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {(g.status === 'approved' || g.status === 'locked') &&
                                ['goal_setting', 'rating', 'review'].includes(selectedCycle?.status) && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '5px 12px', fontSize: '0.78rem', borderRadius: 8 }}
                                    onClick={() => setProgressGoal(g)}
                                  >
                                    Update Progress
                                  </button>
                                )}
                              {g.status === 'draft' && selectedCycle?.status === 'goal_setting' && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '5px 8px', color: '#dc2626', borderRadius: 8 }}
                                  onClick={() => handleDeleteGoal(g.id)}
                                  title="Delete goal"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Released Result Card */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Cycle Result & Competency Breakdown
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Comprehensive performance breakdown combining Goals, Self rating, Manager review, and Anonymous Peer feedback.
              </p>
            </div>

            {!myResult ? (
              <div
                style={{
                  padding: '30px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                }}
              >
                <Info size={28} style={{ color: '#94a3b8', marginBottom: 8 }} />
                <div style={{ fontWeight: 600, color: '#0f172a' }}>Appraisal Results Pending Release</div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                  Results for this cycle will become available once HR / Admin finalizes and releases ratings.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Hero Summary Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 14,
                  }}
                >
                  {/* Final Score Card */}
                  <div
                    style={{
                      padding: '16px 18px',
                      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                      borderRadius: 14,
                      border: '1px solid #bfdbfe',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Overall 360° Score
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                      {myResult.effective_score ?? '—'} <span style={{ fontSize: '1rem', color: '#64748b' }}>/ 5.0</span>
                    </div>
                    {myResult.final_rating_label && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          background: '#ffffff',
                          color: '#2563eb',
                          border: '1px solid #93c5fd',
                          width: 'fit-content',
                        }}
                      >
                        <Sparkles size={13} style={{ color: '#f59e0b' }} /> {myResult.final_rating_label}
                      </span>
                    )}
                  </div>

                  {/* Goals Contribution */}
                  <div
                    style={{
                      padding: '16px 18px',
                      background: '#f8fafc',
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                      Goals Achievement Score
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                      {myResult.goals_score ?? '—'} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>/ 5</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Calculated from enrolled goals & progress
                    </div>
                  </div>

                  {/* Competency Blended */}
                  <div
                    style={{
                      padding: '16px 18px',
                      background: '#f8fafc',
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                      Blended Competency Score
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                      {myResult.competency_score ?? '—'} <span style={{ fontSize: '0.9rem', color: '#64748b' }}>/ 5</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Weighted Self + Manager + Peer ratings
                    </div>
                  </div>

                  {/* Rater Comparison Breakdown */}
                  <div
                    style={{
                      padding: '16px 18px',
                      background: '#f8fafc',
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                      Self / Manager / Peer Averages
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      <span style={{ color: '#6d28d9' }}>{myResult.self_avg ?? '—'}</span> (Self) /{' '}
                      <span style={{ color: '#047857' }}>{myResult.manager_avg ?? '—'}</span> (Mgr) /{' '}
                      <span style={{ color: '#0369a1' }}>{myResult.peer_avg ?? '—'}</span> (Peers)
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Shield size={12} style={{ color: '#0284c7' }} />
                      <span>{myResult.peer_response_count} anonymous peer response(s)</span>
                    </div>
                  </div>
                </div>

                {/* Self vs Manager Perception Gap Table */}
                {myResult.parameter_breakdown?.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      Competency Matrix & Perception Gap Analysis
                    </h4>
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                      <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Competency Parameter
                            </th>
                            <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Self Rating
                            </th>
                            <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Manager Rating
                            </th>
                            <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Perception Gap (Mgr vs Self)
                            </th>
                            <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Peer Avg (Anonymous)
                            </th>
                            <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                              Blended Score
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {myResult.parameter_breakdown.map((b) => {
                            const gapNum = b.gap != null ? Number(b.gap) : 0;
                            const isPositive = gapNum > 0;
                            const isZero = gapNum === 0;

                            return (
                              <tr key={b.parameter_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', fontSize: '0.88rem' }}>
                                  {b.name}
                                </td>
                                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#6d28d9' }}>
                                  {b.self ?? '—'}
                                </td>
                                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#047857' }}>
                                  {b.manager ?? '—'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '3px 9px',
                                      borderRadius: 999,
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      background: isZero ? '#f1f5f9' : isPositive ? '#ecfdf5' : '#fef3c7',
                                      color: isZero ? '#475569' : isPositive ? '#047857' : '#b45309',
                                      border: isZero ? '1px solid #e2e8f0' : isPositive ? '1px solid #a7f3d0' : '1px solid #fde68a',
                                    }}
                                  >
                                    {isPositive ? `+${b.gap} (Manager Higher)` : isZero ? '0.0 (Aligned)' : `${b.gap} (Self Higher)`}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px', color: '#0369a1', fontWeight: 600 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <Shield size={12} /> {b.peer ?? '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>
                                  {b.blended ?? '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Attendance Context Info */}
                {myResult.attendance_snapshot && (
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: 12,
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <Info size={20} style={{ color: '#0284c7', flexShrink: 0 }} />
                    <div style={{ fontSize: '0.82rem', color: '#0c4a6e', lineHeight: 1.5 }}>
                      <strong>Protected Attendance Context (Informational Only):</strong> Attendance was{' '}
                      <strong>{myResult.attendance_snapshot.attendance_pct}%</strong> with{' '}
                      {myResult.attendance_snapshot.present_days} of {myResult.attendance_snapshot.working_days} working days present.{' '}
                      Sick leave (<strong>{myResult.attendance_snapshot.sick_leave_days} day(s)</strong>) is excused and legally protected from negative scoring.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Multi-cycle History */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Historical Performance Across Cycles
            </h3>
            {myHistory.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
                No past finalized cycles recorded yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Cycle</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Period</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Goals</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Competency</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Final Score</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Rating Slab</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myHistory.map((h) => (
                      <tr key={h.cycle_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{h.cycle_name}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: '#64748b' }}>
                          {h.start_date} → {h.end_date}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{h.goals_score ?? '—'}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{h.competency_score ?? '—'}</td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: '#2563eb' }}>{h.effective_score ?? '—'} / 5</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                            }}
                          >
                            {h.final_rating_label || 'Completed'}
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
      )}

      {/* ── TAB 3: Team Reviews (Manager / Admin) ───────────── */}
      {tab === 'team' && isStaff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  Team Participants & Goal Approvals
                </h3>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    background: '#eff6ff',
                    color: '#1d4ed8',
                  }}
                >
                  {teamParticipants.length} Direct Reports
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Select a team member to review and approve their performance goals for this cycle.
              </p>
            </div>

            {teamParticipants.length === 0 ? (
              <div
                style={{
                  padding: '30px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                }}
              >
                <Users size={28} style={{ color: '#94a3b8', marginBottom: 6 }} />
                <div style={{ fontWeight: 600 }}>No Team Members Enrolled in this Cycle</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10, marginBottom: 16 }}>
                {teamParticipants.map((p) => {
                  const isSelected = selectedTeamMember?.employee_id === p.employee_id;
                  const palette = getAvatarPalette(p.employee_name);

                  return (
                    <div
                      key={p.id}
                      onClick={() => inspectTeamMember(p)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        transition: 'all 0.16s ease',
                        boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.12)' : 'none',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: palette.bg,
                          color: palette.color,
                          border: `1px solid ${palette.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(p.employee_name)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            color: isSelected ? '#1e40af' : '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.employee_name || 'Employee'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {p.status || 'Enrolled'}
                        </div>
                      </div>
                      {isSelected && <Check size={16} style={{ color: '#2563eb', flexShrink: 0 }} />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected Member Goals Console */}
            {selectedTeamMember && (
              <div
                style={{
                  padding: 18,
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 14,
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                      Objectives for {selectedTeamMember.employee_name}
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {teamMemberGoals.length} objective(s) submitted
                    </span>
                  </div>

                  {teamMemberGoals.some((g) => g.status === 'pending_approval') && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => handleApproveMemberGoals(selectedTeamMember.employee_id)}
                      >
                        <Check size={14} /> Approve Goals
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: 8 }}
                        onClick={() => handleReturnMemberGoals(selectedTeamMember.employee_id)}
                      >
                        Return to Draft
                      </button>
                    </div>
                  )}
                </div>

                {teamMemberGoals.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                    No goals created for this employee in this cycle yet.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Objective</th>
                          <th style={{ padding: '10px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Weight</th>
                          <th style={{ padding: '10px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Target</th>
                          <th style={{ padding: '10px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Achievement</th>
                          <th style={{ padding: '10px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamMemberGoals.map((g) => (
                          <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{g.title}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{g.weight}%</td>
                            <td style={{ padding: '10px 12px', color: '#475569' }}>
                              {g.target_value} {g.unit || ''}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#2563eb' }}>
                              {g.final_achievement_pct != null ? `${g.final_achievement_pct}%` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: g.status === 'approved' ? '#dcfce7' : '#fef3c7',
                                  color: g.status === 'approved' ? '#15803d' : '#b45309',
                                }}
                              >
                                {g.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Team Results & Review Window Score Override */}
          {teamResults.length > 0 && (
            <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  Team Results (Review Window & Score Calibration)
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Inspect aggregated scores for your direct reports. During the Review stage, managers can adjust ratings with a mandatory audit reason.
                </p>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Employee</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Goals</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Competency</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Self / Mgr / Peers</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Attendance</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Effective Score</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Rating</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Review Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamResults.map((r) => {
                      const palette = getAvatarPalette(r.employee_name);
                      return (
                        <tr key={r.employee_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  background: palette.bg,
                                  color: palette.color,
                                  border: `1px solid ${palette.border}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.76rem',
                                }}
                              >
                                {getInitials(r.employee_name)}
                              </div>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{r.employee_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.goals_score ?? '—'}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.competency_score ?? '—'}</td>
                          <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: '#475569' }}>
                            {r.self_avg ?? '—'} / {r.manager_avg ?? '—'} / {r.peer_avg ?? '—'} ({r.peer_response_count} peers)
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '0.82rem' }}>
                            {r.attendance_snapshot ? `${r.attendance_snapshot.attendance_pct}%` : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: '#2563eb', fontSize: '0.92rem' }}>
                            {r.effective_score ?? '—'} / 5
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                              }}
                            >
                              {r.final_rating_label || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {selectedCycle?.status === 'review' && !r.locked_at ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '5px 12px', fontSize: '0.76rem', borderRadius: 8 }}
                                onClick={() => {
                                  setAdjustModal(r);
                                  setAdjustForm({
                                    adjusted_score: r.effective_score || '',
                                    reason: r.adjustment_reason || '',
                                  });
                                }}
                              >
                                Adjust Score
                              </button>
                            ) : r.locked_at ? (
                              <span style={{ fontSize: '0.76rem', color: '#4338ca', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Lock size={12} /> Locked
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: Admin Cycle Console & Company Distribution ─ */}
      {tab === 'console' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Lifecycle Action Panel */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    Cycle Lifecycle Console — {selectedCycle?.name || 'No Cycle'}
                  </h3>
                  {selectedCycle && (
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: cycleBadge.bg,
                        color: cycleBadge.color,
                        border: `1px solid ${cycleBadge.color}30`,
                      }}
                    >
                      {cycleBadge.label}
                    </span>
                  )}
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  State flow: Draft ➔ Goal Setting ➔ 360° Rating ➔ Review ➔ Finalized ➔ Released ➔ Payroll Linkage.
                </p>
              </div>

              {selectedCycle && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedCycle.status === 'draft' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => runCycleAction(launchCycle, 'launch')}
                      style={{ padding: '8px 16px', fontSize: '0.84rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Play size={14} fill="currentColor" /> Launch Cycle
                    </button>
                  )}
                  {(selectedCycle.status === 'goal_setting' || selectedCycle.status === 'rating') && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => runCycleAction(advanceCycle, 'advance')}
                      style={{ padding: '8px 16px', fontSize: '0.84rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <FastForward size={14} /> Advance to {selectedCycle.status === 'goal_setting' ? 'Rating' : 'Review'}
                    </button>
                  )}
                  {['rating', 'review'].includes(selectedCycle.status) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => runCycleAction(computeCycleScores, 'score computation')}
                      style={{ padding: '8px 14px', fontSize: '0.84rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <RefreshCw size={14} /> Recompute Scores
                    </button>
                  )}
                  {selectedCycle.status === 'review' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => runCycleAction(finalizeCycle, 'finalization')}
                      style={{ padding: '8px 16px', fontSize: '0.84rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Lock size={14} /> Finalize & Lock Ratings
                    </button>
                  )}
                  {selectedCycle.status === 'finalized' && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => runCycleAction(releaseCycle, 'release to employees')}
                      style={{ padding: '8px 16px', fontSize: '0.84rem', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Send size={14} /> Release Results to Employees
                    </button>
                  )}
                  {['released', 'payroll_approved'].includes(selectedCycle.status) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => runCycleAction(closeCycle, 'close')}
                      style={{ padding: '8px 14px', fontSize: '0.84rem', borderRadius: 10 }}
                    >
                      Close Cycle
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Company Rating Distribution Graph with Recharts */}
          {companyResults && (
            <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                    Company Rating Distribution & Bell Curve
                  </h3>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                    Frequency distribution of final employee ratings across the organization.
                  </p>
                </div>
                <div
                  style={{
                    padding: '8px 16px',
                    borderRadius: 12,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    textAlign: 'right',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>
                    Company Average Score
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1d4ed8', lineHeight: 1.1 }}>
                    {companyResults.average_score ?? '—'} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>/ 5.0</span>
                  </div>
                </div>
              </div>

              {/* Recharts Bar Graph */}
              {(() => {
                const chartData = Object.entries(companyResults.distribution || {}).map(([label, count]) => ({
                  name: label,
                  count: Number(count),
                }));
                const barColors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#06b6d4'];

                return (
                  <div style={{ width: '100%', height: 260, marginTop: 10 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            background: '#0f172a',
                            borderRadius: 8,
                            border: 'none',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                          }}
                        />
                        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                          {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              {/* Distribution Cards Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
                {Object.entries(companyResults.distribution || {}).map(([label, count], idx) => {
                  const colors = ['#fee2e2', '#fef3c7', '#eff6ff', '#ecfdf5', '#ede9fe', '#cffafe'];
                  const textColors = ['#991b1b', '#92400e', '#1d4ed8', '#047857', '#5b21b6', '#155e75'];
                  return (
                    <div
                      key={label}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 12,
                        background: colors[idx % colors.length],
                        border: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div style={{ fontSize: '0.74rem', color: textColors[idx % textColors.length], fontWeight: 700 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: textColors[idx % textColors.length], marginTop: 2 }}>
                        {count} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>emp</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Anonymous Completion Table */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Review Completion Progress
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Monitors evaluation submission across Self, Manager, and Anonymous Department Peers (individual peer identities remain concealed).
              </p>
            </div>

            {completionList.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.88rem' }}>
                Launch the cycle to view participant completion tracking.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Employee</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Self Rating</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Manager Rating</th>
                      <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Peer Responses Progress (Anonymous)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completionList.map((c) => {
                      const peerRatio = c.peers_assigned > 0 ? Math.round((c.peers_submitted / c.peers_assigned) * 100) : 0;
                      const palette = getAvatarPalette(c.employee_name);

                      return (
                        <tr key={c.employee_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: '50%',
                                  background: palette.bg,
                                  color: palette.color,
                                  border: `1px solid ${palette.border}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.74rem',
                                }}
                              >
                                {getInitials(c.employee_name)}
                              </div>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{c.employee_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: c.self_status === 'submitted' ? '#dcfce7' : '#fef3c7',
                                color: c.self_status === 'submitted' ? '#15803d' : '#b45309',
                              }}
                            >
                              {c.self_status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: c.manager_status === 'submitted' ? '#dcfce7' : '#fef3c7',
                                color: c.manager_status === 'submitted' ? '#15803d' : '#b45309',
                              }}
                            >
                              {c.manager_status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', minWidth: 180 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 4 }}>
                              <span style={{ color: '#475569' }}>
                                <strong>{c.peers_submitted}</strong> of {c.peers_assigned} peers submitted
                              </span>
                              <span style={{ fontWeight: 700, color: peerRatio === 100 ? '#10b981' : '#0f172a' }}>
                                {peerRatio}%
                              </span>
                            </div>
                            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                              <div
                                style={{
                                  height: '100%',
                                  width: `${peerRatio}%`,
                                  background: peerRatio === 100 ? '#10b981' : '#3b82f6',
                                  borderRadius: 999,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: Payroll Revisions (Admin) ────────────────── */}
      {tab === 'payroll' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Financial KPI Strip */}
          {(() => {
            const totalAnnualCost = revisions.reduce((acc, r) => {
              const curr = Number(r.current_basic_pay || 0);
              const next = Number(r.new_basic_pay || 0);
              return acc + (next > curr ? (next - curr) * 12 : 0);
            }, 0);
            const eligibleCount = revisions.filter((r) => r.eligible).length;
            const avgHike =
              revisions.length > 0
                ? (
                    revisions.reduce(
                      (acc, r) =>
                        acc + Number(r.approved_hike_percent ?? r.suggested_hike_percent ?? 0),
                      0
                    ) / revisions.length
                  ).toFixed(1)
                : '0.0';

            return (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    Total Annual CTC Impact
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                    {formatCurrency(totalAnnualCost)}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 600 }}>
                    Incremental salary cost across all approved revisions
                  </div>
                </div>

                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    Eligible Employees
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
                    {eligibleCount} <span style={{ fontSize: '0.95rem', color: '#64748b' }}>/ {revisions.length}</span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Satisfies tenure & eligibility rules
                  </div>
                </div>

                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    Average Approved Hike
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', margin: '4px 0' }}>
                    {avgHike}%
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Based on finalized score slabs
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Revisions Table Card */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Payroll Hike Suggestions & Salary Adjustments
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Revisions are never auto-applied. Admins can override hike percentages with a mandatory justification, then explicitly click <strong>Apply to Payroll</strong> to update employee compensation.
              </p>
            </div>

            {revisions.length === 0 ? (
              <div
                style={{
                  padding: '30px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                }}
              >
                <DollarSign size={28} style={{ color: '#94a3b8', marginBottom: 6 }} />
                <div style={{ fontWeight: 600 }}>No Payroll Revisions Generated Yet</div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                  Finalize the cycle in the Lifecycle Console to compute slab-based salary hike suggestions.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Employee</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Score / Slab</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Eligibility</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Current Basic</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Hike Adjustment</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>New Basic</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Effective Date</th>
                      <th style={{ padding: '12px 12px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisions.map((rev) => {
                      const palette = getAvatarPalette(rev.employee_name);
                      const isApplied = rev.status === 'applied';
                      const isApproved = rev.status === 'approved';

                      return (
                        <tr key={rev.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  background: palette.bg,
                                  color: palette.color,
                                  border: `1px solid ${palette.border}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.76rem',
                                  flexShrink: 0,
                                }}
                              >
                                {getInitials(rev.employee_name)}
                              </div>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{rev.employee_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 12px' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>
                              {rev.final_score ?? '—'} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>/ 5</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: 600 }}>
                              {rev.final_rating_label || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 12px' }}>
                            {rev.eligible ? (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                }}
                              >
                                ✓ Eligible
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                }}
                                title={rev.ineligible_reason || ''}
                              >
                                ✕ Ineligible
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 12px', fontWeight: 600, color: '#475569' }}>
                            {formatCurrency(rev.current_basic_pay)}
                          </td>
                          <td style={{ padding: '12px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                {rev.suggested_hike_percent}%
                              </span>
                              <ArrowUpRight size={13} style={{ color: '#10b981' }} />
                              <strong style={{ color: '#059669', fontSize: '0.88rem' }}>
                                {rev.approved_hike_percent != null ? `${rev.approved_hike_percent}%` : `${rev.suggested_hike_percent}%`}
                              </strong>
                            </div>
                          </td>
                          <td style={{ padding: '12px 12px', fontWeight: 800, color: '#0f172a' }}>
                            {formatCurrency(rev.new_basic_pay)}
                          </td>
                          <td style={{ padding: '12px 12px', fontSize: '0.82rem', color: '#64748b' }}>
                            {rev.effective_date || '—'}
                          </td>
                          <td style={{ padding: '12px 12px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                textTransform: 'capitalize',
                                background: isApplied ? '#dcfce7' : isApproved ? '#eff6ff' : '#fef3c7',
                                color: isApplied ? '#15803d' : isApproved ? '#1d4ed8' : '#b45309',
                              }}
                            >
                              {rev.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {!isApplied && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '5px 10px', fontSize: '0.76rem', borderRadius: 8 }}
                                    onClick={() => {
                                      setApproveModal(rev);
                                      setApproveForm({
                                        approved_hike_percent:
                                          rev.approved_hike_percent ?? rev.suggested_hike_percent,
                                        effective_date: rev.effective_date || '',
                                        override_reason: rev.override_reason || '',
                                      });
                                    }}
                                  >
                                    Review / Override
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '5px 8px', fontSize: '0.76rem', color: '#dc2626', borderRadius: 8 }}
                                    onClick={() => handleRejectRevision(rev)}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {isApproved && (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{
                                    padding: '5px 12px',
                                    fontSize: '0.76rem',
                                    background: '#059669',
                                    borderRadius: 8,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                  onClick={() => handleApplyRevision(rev)}
                                >
                                  <Check size={13} /> Apply to Payroll
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 6: PMS Configuration, Parameters & Slabs (Admin) ─ */}
      {tab === 'config' && isAdmin && config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Org Weights & Rater Configuration */}
          <form onSubmit={handleSaveConfig} className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            {(() => {
              const raterSum =
                Number(config.weight_manager || 0) +
                Number(config.weight_peer || 0) +
                Number(config.weight_self || 0);
              const compSum =
                Number(config.weight_goals || 0) +
                Number(config.weight_competency || 0) +
                Number(config.weight_discipline || 0) +
                Number(config.weight_growth || 0);

              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      Org Weights & 360° Rater Rules
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                      Configure the weightage of each appraisal source and competency factor.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: raterSum === 100 ? '#ecfdf5' : '#fef3c7',
                        color: raterSum === 100 ? '#047857' : '#b45309',
                        border: raterSum === 100 ? '1px solid #a7f3d0' : '1px solid #fde68a',
                      }}
                    >
                      {raterSum === 100 ? '✓ Rater Weights 100%' : `Raters Total: ${raterSum}%`}
                    </span>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: compSum === 100 ? '#ecfdf5' : '#fef3c7',
                        color: compSum === 100 ? '#047857' : '#b45309',
                        border: compSum === 100 ? '1px solid #a7f3d0' : '1px solid #fde68a',
                      }}
                    >
                      {compSum === 100 ? '✓ Component Weights 100%' : `Components Total: ${compSum}%`}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
              }}
            >
              {[
                ['weight_goals', 'Goals Weight (%)', 'Component'],
                ['weight_competency', 'Competency Weight (%)', 'Component'],
                ['weight_discipline', 'Discipline Weight (%)', 'Component'],
                ['weight_growth', 'Growth Weight (%)', 'Component'],
                ['weight_manager', 'Manager Rater Weight (%)', '360° Rater'],
                ['weight_peer', 'Peer Rater Weight (%)', '360° Rater'],
                ['weight_self', 'Self Rater Weight (%)', '360° Rater'],
                ['max_peer_weight', 'Max Peer Weight Cap (%)', 'Governance'],
                ['min_peer_responses', 'Min Peer Responses', 'Governance'],
                ['goal_achievement_cap', 'Goal Achievement Cap (%)', 'Governance'],
                ['min_tenure_days_for_hike', 'Min Tenure for Hike (Days)', 'Governance'],
              ].map(([key, label, group]) => (
                <div
                  key={key}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>{label}</label>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase' }}>{group}</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={config[key] ?? ''}
                    onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                    style={{
                      background: '#ffffff',
                      fontWeight: 700,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                    }}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '9px 22px', fontSize: '0.86rem', borderRadius: 10 }}
              >
                Save PMS Configuration
              </button>
            </div>
          </form>

          {/* Competency Parameters */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Competency Parameters (1–5 Rating Scale)
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Parameters evaluated during 360° reviews. Click on any parameter tag to toggle between Active and Inactive.
              </p>
            </div>

            <form
              onSubmit={handleAddParameter}
              style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}
            >
              <input
                className="form-input"
                placeholder="Parameter title (e.g. Collaboration & Empathy)"
                value={newParam.name}
                onChange={(e) => setNewParam({ ...newParam, name: e.target.value })}
                required
                style={{ minWidth: 260, borderRadius: 8 }}
              />
              <input
                className="form-input"
                placeholder="Short behavioral description..."
                value={newParam.description}
                onChange={(e) => setNewParam({ ...newParam, description: e.target.value })}
                style={{ minWidth: 320, flex: 1, borderRadius: 8 }}
              />
              <button
                type="submit"
                className="btn btn-secondary"
                style={{ borderRadius: 8, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={15} /> Add Parameter
              </button>
            </form>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {parameters.map((p) => (
                <span
                  key={p.id}
                  onClick={() => handleToggleParameter(p)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: p.is_active ? '#eff6ff' : '#f1f5f9',
                    color: p.is_active ? '#1d4ed8' : '#64748b',
                    border: p.is_active ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: p.is_active ? '#2563eb' : '#94a3b8',
                    }}
                  />
                  {p.name}
                  <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>
                    ({p.is_active ? 'Active' : 'Inactive'})
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Rating Slabs */}
          <div className="card" style={{ padding: 22, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Performance Rating Slabs & Suggested Hikes
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Maps final 360° blended scores (1.0–5.0) to default salary hike recommendations.
              </p>
            </div>

            <form
              onSubmit={handleAddSlab}
              style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}
            >
              <input
                className="form-input"
                placeholder="Label (e.g. Outstanding)"
                value={newSlab.label}
                onChange={(e) => setNewSlab({ ...newSlab, label: e.target.value })}
                required
                style={{ minWidth: 180, borderRadius: 8 }}
              />
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="Min Score"
                value={newSlab.min_score}
                onChange={(e) => setNewSlab({ ...newSlab, min_score: e.target.value })}
                required
                style={{ width: 110, borderRadius: 8 }}
              />
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="Max Score"
                value={newSlab.max_score}
                onChange={(e) => setNewSlab({ ...newSlab, max_score: e.target.value })}
                required
                style={{ width: 110, borderRadius: 8 }}
              />
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="Hike %"
                value={newSlab.hike_percent}
                onChange={(e) => setNewSlab({ ...newSlab, hike_percent: e.target.value })}
                required
                style={{ width: 110, borderRadius: 8 }}
              />
              <button
                type="submit"
                className="btn btn-secondary"
                style={{ borderRadius: 8, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={15} /> Add Slab
              </button>
            </form>

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Slab Classification</th>
                    <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Score Range</th>
                    <th style={{ padding: '12px 14px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Default Hike %</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slabs.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                          }}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#475569' }}>
                        {s.min_score} – {s.max_score}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <strong style={{ color: '#059669', fontSize: '0.92rem' }}>+{s.hike_percent}%</strong>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', color: '#dc2626', borderRadius: 8 }}
                          onClick={() => handleDeleteSlab(s.id)}
                          title="Delete slab"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────── */}

      {/* Submit Rating Modal */}
      {activeTask && (
        <Modal
          isOpen={!!activeTask}
          onClose={() => setActiveTask(null)}
          title={`360° Performance Evaluation`}
        >
          <form onSubmit={handleSubmitRatings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Ratee Profile Header Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                background: '#f8fafc',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: getAvatarPalette(activeTask.ratee_name).bg,
                  color: getAvatarPalette(activeTask.ratee_name).color,
                  border: `1px solid ${getAvatarPalette(activeTask.ratee_name).border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  flexShrink: 0,
                }}
              >
                {getInitials(activeTask.ratee_name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    {activeTask.ratee_name}
                  </h4>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      background:
                        activeTask.rater_type === 'peer'
                          ? '#e0f2fe'
                          : activeTask.rater_type === 'manager'
                          ? '#d1fae5'
                          : '#ede9fe',
                      color:
                        activeTask.rater_type === 'peer'
                          ? '#0369a1'
                          : activeTask.rater_type === 'manager'
                          ? '#065f46'
                          : '#6d28d9',
                    }}
                  >
                    {activeTask.rater_type === 'peer'
                      ? 'Peer Review'
                      : activeTask.rater_type === 'manager'
                      ? 'Manager Review'
                      : 'Self Evaluation'}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                  Cycle: {activeTask.cycle_name}
                </div>
              </div>
            </div>

            {/* Anonymous Security Guarantee */}
            {activeTask.rater_type === 'peer' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: '0.8rem',
                  color: '#15803d',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '10px 14px',
                  borderRadius: 10,
                }}
              >
                <Shield size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong>Strictly Anonymous:</strong> Individual scores and feedback are never revealed to the employee or manager. Only aggregated peer averages are used.
                </div>
              </div>
            )}

            {/* Rating Parameters List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(activeTask.parameters || []).map((p) => {
                const currentScore = Number(ratingForm[p.id]?.score || 4);
                const scoreInfo = SCORE_LABELS[currentScore] || SCORE_LABELS[4];

                return (
                  <div
                    key={p.id}
                    style={{
                      padding: 14,
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{p.name}</strong>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          padding: '2px 9px',
                          borderRadius: 999,
                          background: scoreInfo.bg,
                          color: scoreInfo.color,
                        }}
                      >
                        ★ {currentScore} — {scoreInfo.label}
                      </span>
                    </div>

                    {p.description && (
                      <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', color: '#64748b' }}>
                        {p.description}
                      </p>
                    )}

                    {/* Interactive 1 to 5 Score Selector */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((num) => {
                        const isSelected = currentScore === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() =>
                              setRatingForm({
                                ...ratingForm,
                                [p.id]: { ...ratingForm[p.id], score: num },
                              })
                            }
                            style={{
                              padding: '8px 4px',
                              borderRadius: 8,
                              border: isSelected ? `2px solid ${SCORE_LABELS[num].color}` : '1px solid #e2e8f0',
                              background: isSelected ? SCORE_LABELS[num].bg : '#f8fafc',
                              color: isSelected ? SCORE_LABELS[num].color : '#475569',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span style={{ fontSize: '0.92rem' }}>{num} ★</span>
                            <span style={{ fontSize: '0.66rem', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                              {SCORE_LABELS[num].label.split(' ')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Score helper description */}
                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
                      {scoreInfo.desc}
                    </div>

                    {/* Optional Comment Input */}
                    <div style={{ marginTop: 10 }}>
                      <input
                        type="text"
                        placeholder="Optional feedback / observation note..."
                        value={ratingForm[p.id]?.comment || ''}
                        onChange={(e) =>
                          setRatingForm({
                            ...ratingForm,
                            [p.id]: { ...ratingForm[p.id], comment: e.target.value },
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                          outline: 'none',
                          background: '#fafafa',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTask(null)}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingRating}
                style={{
                  padding: '8px 20px',
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {submittingRating ? (
                  <>Submitting...</>
                ) : (
                  <>
                    <Check size={16} /> Submit 360° Rating
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Goal Modal */}
      {showGoalModal && (
        <Modal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} title="Add Goal">
          <form onSubmit={handleCreateGoal} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Goal Title</label>
              <input
                className="form-input"
                required
                value={goalForm.title}
                onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-input"
                value={goalForm.description}
                onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Weight (%)</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  value={goalForm.weight}
                  onChange={(e) => setGoalForm({ ...goalForm, weight: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Target Value</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  value={goalForm.target_value}
                  onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Create Goal
            </button>
          </form>
        </Modal>
      )}

      {/* Record Goal Progress Modal */}
      {progressGoal && (
        <Modal
          isOpen={!!progressGoal}
          onClose={() => setProgressGoal(null)}
          title={`Record Progress: ${progressGoal.title}`}
        >
          <form onSubmit={handleRecordProgress} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">
                Actual Value (Target: {progressGoal.target_value} {progressGoal.unit || ''})
              </label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                required
                value={progressForm.actual_value}
                onChange={(e) => setProgressForm({ ...progressForm, actual_value: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Note</label>
              <input
                className="form-input"
                value={progressForm.note}
                onChange={(e) => setProgressForm({ ...progressForm, note: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Save Progress
            </button>
          </form>
        </Modal>
      )}

      {/* Review-Window Score Adjust Modal */}
      {adjustModal && (
        <Modal
          isOpen={!!adjustModal}
          onClose={() => setAdjustModal(null)}
          title={`Adjust Score: ${adjustModal.employee_name}`}
        >
          <form onSubmit={handleAdjustScore} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Adjusted Score (0 – 5)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="5"
                className="form-input"
                required
                value={adjustForm.adjusted_score}
                onChange={(e) => setAdjustForm({ ...adjustForm, adjusted_score: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mandatory Reason (Audited)</label>
              <textarea
                className="form-input"
                required
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Save Adjustment
            </button>
          </form>
        </Modal>
      )}

      {/* Approve Payroll Revision Modal */}
      {approveModal && (
        <Modal
          isOpen={!!approveModal}
          onClose={() => setApproveModal(null)}
          title={`Approve Hike: ${approveModal.employee_name}`}
        >
          <form onSubmit={handleApproveRevision} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">
                Approved Hike % (Suggested: {approveModal.suggested_hike_percent}%)
              </label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                required
                value={approveForm.approved_hike_percent}
                onChange={(e) =>
                  setApproveForm({ ...approveForm, approved_hike_percent: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Effective Date</label>
              <input
                type="date"
                className="form-input"
                required
                value={approveForm.effective_date}
                onChange={(e) => setApproveForm({ ...approveForm, effective_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Override Reason (Required if changing suggested % or ineligible)
              </label>
              <textarea
                className="form-input"
                value={approveForm.override_reason}
                onChange={(e) =>
                  setApproveForm({ ...approveForm, override_reason: e.target.value })
                }
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Confirm Approval
            </button>
          </form>
        </Modal>
      )}

      {/* Create Cycle Modal */}
      {showCycleModal && (
        <Modal
          isOpen={showCycleModal}
          onClose={() => setShowCycleModal(false)}
          title="Create Review Cycle"
        >
          <form onSubmit={handleCreateCycle} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Cycle Name</label>
              <input
                className="form-input"
                placeholder="e.g. FY 2026 Annual Appraisal"
                required
                value={cycleForm.name}
                onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={cycleForm.start_date}
                  onChange={(e) => setCycleForm({ ...cycleForm, start_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={cycleForm.end_date}
                  onChange={(e) => setCycleForm({ ...cycleForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">
              Create Draft Cycle
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
