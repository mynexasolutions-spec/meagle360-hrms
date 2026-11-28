import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  Filter,
  MapPin,
  Briefcase,
  Clock,
  FileText,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Download,
  Send,
  MessageSquare,
  History,
  Calendar,
  Check,
  X,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  Plus,
  RefreshCw,
  List,
  LayoutGrid,
  RotateCcw,
  Shuffle,
  Settings,
  ArrowUpDown,
} from 'lucide-react';
import {
  getAtsStages,
  getKanbanBoard,
  getKanbanColumn,
  getAtsFilterOptions,
  getMentionableUsers,
  getAtsRecruiters,
  getApplicants,
  getApplicationDetail,
  getResumeBlob,
  changeApplicationStage,
  addApplicationNote,
  bulkShortlistApplications,
  assignApplication,
  bulkReassignApplications,
  getJobOpenings,
  getRejectionReasons,
  createInterview,
  assignInterviewer,
} from '../../api/ats';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import OfferLetterModal from '../../components/ats/OfferLetterModal';
import ConvertToEmployeeModal from '../../components/ats/ConvertToEmployeeModal';
import KanbanBoard from '../../components/ats/KanbanBoard';
import MoveToInterviewModal from '../../components/ats/MoveToInterviewModal';
import MentionNotesSection from '../../components/ats/MentionNotesSection';
import BulkReassignModal from '../../components/ats/BulkReassignModal';
import DistributionModal from '../../components/ats/DistributionModal';
import { MatchBadge, MatchCard } from '../../components/ats/ResumeMatch';

const DEFAULT_REJECTION_REASONS = [
  'Qualifications did not match job requirements',
  'Salary expectation mismatch',
  'Notice period too long',
  'Position filled by another candidate',
  'Did not attend screening/interview',
  'Cultural / Communication fit',
  'Other',
];

export default function ApplicantsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];
  const canManageOffers = isAdmin || !!user?.permissions?.['ats:offer:manage'];
  const canConvertEmployee = isAdmin || !!user?.permissions?.['ats:hire:convert'];

  // URL-synced state (?view, ?job, ?stage, ?date_from, ?date_to, ?source, ?assigned_to, ?unassigned, ?view_as, ?q, ?app)
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsPhone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const viewMode = !isPhone && searchParams.get('view') === 'table' ? 'table' : 'kanban';
  const selectedJobId = searchParams.get('job') || 'ALL';
  const activeStageId = searchParams.get('stage') || 'ALL';
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  const selectedSource = searchParams.get('source') || '';
  const viewAsRecruiterId = isAdmin ? searchParams.get('view_as') || '' : '';
  const selectedAssignedTo = isAdmin ? (viewAsRecruiterId || searchParams.get('assigned_to') || '') : '';
  const unassignedOnly = isAdmin ? searchParams.get('unassigned') === '1' : false;
  const urlSearchQuery = searchParams.get('q') || '';
  const deepLinkAppId = searchParams.get('app') || null;

  const updateUrlParams = useCallback(
    (updates) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([k, v]) => {
          if (v === null || v === undefined || v === '' || v === 'ALL' || v === false) {
            next.delete(k);
          } else {
            next.set(k, v === true ? '1' : String(v));
          }
        });
        return next;
      });
    },
    [setSearchParams]
  );

  const setViewMode = (mode) => updateUrlParams({ view: mode });
  const setSelectedJobId = (jobId) => updateUrlParams({ job: jobId });
  const setActiveStageId = (stageId) => updateUrlParams({ stage: stageId });

  const [stages, setStages] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [rejectionReasons, setRejectionReasons] = useState(DEFAULT_REJECTION_REASONS);
  const [filterOptions, setFilterOptions] = useState({ sources: [], recruiters: [] });
  const [recruiters, setRecruiters] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [mentionableUsers, setMentionableUsers] = useState([]);
  const [showBulkReassignModal, setShowBulkReassignModal] = useState(false);
  const [bulkReassigning, setBulkReassigning] = useState(false);
  const [distributionModalTab, setDistributionModalTab] = useState(null); // null | 'equal_split' | 'round_robin'
  const [assigningDetail, setAssigningDetail] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(
    Boolean(dateFrom || dateTo || selectedSource || selectedAssignedTo || unassignedOnly || activeStageId !== 'ALL')
  );
  const [search, setSearch] = useState(urlSearchQuery);

  // Sync local search input if URL changes externally
  useEffect(() => {
    setSearch(urlSearchQuery);
  }, [urlSearchQuery]);

  const activeFiltersCount = useMemo(() => {
    let c = 0;
    if (dateFrom) c++;
    if (dateTo) c++;
    if (selectedSource) c++;
    if (selectedAssignedTo) c++;
    if (unassignedOnly) c++;
    if (activeStageId !== 'ALL') c++;
    return c;
  }, [dateFrom, dateTo, selectedSource, selectedAssignedTo, unassignedOnly, activeStageId]);

  const clearAllFilters = () => {
    setSearch('');
    updateUrlParams({
      date_from: null,
      date_to: null,
      source: null,
      assigned_to: null,
      unassigned: null,
      stage: null,
      q: null,
    });
  };

  // Build consistent server-side filter params object
  const buildFilterParams = useCallback(
    (includeStage = false) => {
      const p = {};
      if (selectedJobId !== 'ALL') p.job_id = selectedJobId;
      if (urlSearchQuery.trim()) p.search = urlSearchQuery.trim();
      if (dateFrom) p.date_from = dateFrom;
      if (dateTo) p.date_to = dateTo;
      if (selectedSource) p.source = selectedSource;
      if (unassignedOnly) {
        p.unassigned_only = true;
      } else if (selectedAssignedTo) {
        p.assigned_to = selectedAssignedTo;
      }
      if (includeStage && activeStageId !== 'ALL') {
        p.stage_id = activeStageId;
      }
      return p;
    },
    [selectedJobId, urlSearchQuery, dateFrom, dateTo, selectedSource, selectedAssignedTo, unassignedOnly, activeStageId]
  );

  // Table state
  const [applicants, setApplicants] = useState([]);
  // Match-score sort for the table: null = default order, 'desc' | 'asc'
  const [matchSort, setMatchSort] = useState(null);
  const sortedApplicants = useMemo(() => {
    if (!matchSort) return applicants;
    const dir = matchSort === 'desc' ? -1 : 1;
    // Unscored applications always go last, whatever the direction
    return [...applicants].sort((a, b) => {
      if (a.match_score == null) return b.match_score == null ? 0 : 1;
      if (b.match_score == null) return -1;
      return dir * (a.match_score - b.match_score);
    });
  }, [applicants, matchSort]);
  const [loading, setLoading] = useState(true);

  // Kanban state
  const [kanbanColumns, setKanbanColumns] = useState({});
  const [kanbanLoading, setKanbanLoading] = useState(true);
  const [loadingMoreMap, setLoadingMoreMap] = useState({});

  // Bulk selection state
  const [selectedAppIds, setSelectedAppIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Application detail drawer / modal state
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('details'); // 'details' | 'offer' | 'notes' | 'activity'

  // Phase 4 Offer & Conversion modals
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  // Kanban special drop flow modals
  const [pendingInterviewDrop, setPendingInterviewDrop] = useState(null); // { card, targetStage }
  const [interviewDropSubmitting, setInterviewDropSubmitting] = useState(false);
  const [pendingRejectCard, setPendingRejectCard] = useState(null); // card dropped to reject zone
  const [kanbanOfferCard, setKanbanOfferCard] = useState(null);
  const [kanbanHirePrompt, setKanbanHirePrompt] = useState(null); // { app, detail }

  // Toast & 5-second Undo state
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', message }
  const [undoReject, setUndoReject] = useState(null); // { card, prevStage, rejectedStage, newVersion, secondsLeft }
  const undoTimerRef = useRef(null);

  // Resume preview state
  const [resumeBlobUrl, setResumeBlobUrl] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState(false);

  // Actions state
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState(DEFAULT_REJECTION_REASONS[0]);
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState('');

  // Note state
  const [addingNote, setAddingNote] = useState(false);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  // Load jobs, rejection reasons, filter options, recruiters pool, and mentionable users
  const loadStaticMeta = useCallback(async () => {
    try {
      const [jobsRes, reasonsRes, filterOptRes, mentionRes, recRes] = await Promise.all([
        getJobOpenings().catch(() => ({ data: [] })),
        getRejectionReasons().catch(() => ({ data: [] })),
        getAtsFilterOptions().catch(() => ({ data: { sources: [], recruiters: [] } })),
        getMentionableUsers().catch(() => ({ data: [] })),
        getAtsRecruiters().catch(() => ({ data: [] })),
      ]);
      setJobs(jobsRes.data || []);
      const dbReasons = (reasonsRes.data || []).map((r) => r.reason).filter(Boolean);
      if (dbReasons.length > 0) {
        setRejectionReasons(dbReasons);
        setRejectReason(dbReasons[0]);
      }
      setFilterOptions(filterOptRes.data || { sources: [], recruiters: [] });
      setMentionableUsers(mentionRes.data || []);
      setRecruiters(recRes.data || []);
    } catch (err) {
      console.error('Failed to load static ATS metadata', err);
    }
  }, []);

  // Load Kanban board (stages with aggregate counts + first page per column)
  const loadKanbanBoard = useCallback(async () => {
    try {
      setKanbanLoading(true);
      const params = { ...buildFilterParams(true), limit: 25 };

      const res = await getKanbanBoard(params);
      setStages(res.data?.stages || []);
      setKanbanColumns(res.data?.columns || {});
      setUnassignedCount(res.data?.unassigned_count ?? 0);
    } catch (err) {
      console.error('Failed to load Kanban board', err);
      showToast('error', err.response?.data?.detail || 'Failed to load Kanban board.');
    } finally {
      setKanbanLoading(false);
    }
  }, [buildFilterParams, showToast]);

  // Load Table applicants + stage counts
  const loadTableApplicants = useCallback(async () => {
    try {
      setLoading(true);
      const countParams = buildFilterParams(false);
      const params = buildFilterParams(true);

      const [stagesRes, appsRes] = await Promise.all([
        getAtsStages(countParams),
        getApplicants(params),
      ]);
      setStages(stagesRes.data || []);
      setApplicants(appsRes.data || []);
      setSelectedAppIds([]);
    } catch (err) {
      console.error('Failed to load applicants', err);
    } finally {
      setLoading(false);
    }
  }, [buildFilterParams]);

  const refreshActiveView = useCallback(() => {
    if (viewMode === 'kanban') {
      loadKanbanBoard();
    } else {
      loadTableApplicants();
    }
  }, [viewMode, loadKanbanBoard, loadTableApplicants]);

  useEffect(() => {
    loadStaticMeta();
  }, [loadStaticMeta]);

  useEffect(() => {
    if (viewMode === 'kanban') {
      loadKanbanBoard();
    } else {
      loadTableApplicants();
    }
  }, [viewMode, loadKanbanBoard, loadTableApplicants]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    updateUrlParams({ q: search.trim() || null });
  };

  // Load next page for a single Kanban column (infinite scroll)
  const handleLoadMoreColumn = useCallback(
    async (stageId) => {
      const col = kanbanColumns[stageId];
      if (!col || !col.has_more || loadingMoreMap[stageId]) return;

      try {
        setLoadingMoreMap((prev) => ({ ...prev, [stageId]: true }));
        const params = {
          ...buildFilterParams(false),
          stage_id: stageId,
          limit: 25,
          offset: col.items.length,
        };

        const res = await getKanbanColumn(params);
        const newItems = res.data?.items || [];
        setKanbanColumns((prev) => {
          const existing = prev[stageId] || { items: [], total: 0, has_more: false };
          const seenIds = new Set(existing.items.map((x) => x.id));
          const merged = [...existing.items, ...newItems.filter((x) => !seenIds.has(x.id))];
          return {
            ...prev,
            [stageId]: {
              ...existing,
              items: merged,
              total: res.data?.total ?? existing.total,
              has_more: Boolean(res.data?.has_more),
            },
          };
        });
      } catch (err) {
        console.error('Failed to load more cards for column', stageId, err);
      } finally {
        setLoadingMoreMap((prev) => ({ ...prev, [stageId]: false }));
      }
    },
    [kanbanColumns, loadingMoreMap, buildFilterParams]
  );

  // Direct PDF preview from Kanban card
  const handleOpenResumeDirect = async (app) => {
    try {
      const blobRes = await getResumeBlob(app.id);
      const url = URL.createObjectURL(blobRes.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      showToast('error', 'Unable to open resume PDF.');
    }
  };

  // Board stages (non-rejected by default, or specific stage if filtered)
  const boardStages = useMemo(() => {
    if (activeStageId !== 'ALL') {
      return stages.filter((s) => s.id === activeStageId);
    }
    return stages.filter(
      (s) => s.terminal_type !== 'rejected' && !s.name.toLowerCase().includes('reject')
    );
  }, [stages, activeStageId]);

  const rejectedStage = useMemo(
    () =>
      stages.find(
        (s) => s.terminal_type === 'rejected' || s.name.toLowerCase().includes('reject')
      ),
    [stages]
  );

  // Permission helpers for Kanban drag & drop
  const canMoveToStage = useCallback(
    (card, targetStage) => {
      if (!card || !targetStage) return false;
      const isOfferOrHired =
        targetStage.terminal_type === 'hired' ||
        targetStage.name.toLowerCase().includes('offer');
      if (isOfferOrHired && !canManageOffers) return false;
      return true;
    },
    [canManageOffers]
  );

  const canRejectCard = useCallback(
    (card) => {
      if (!card) return false;
      const curName = (card.stage_name || '').toLowerCase();
      if (['interview', 'offer', 'hired'].includes(curName)) {
        return canManageOffers;
      }
      return true;
    },
    [canManageOffers]
  );

  // Optimistic move helper on Kanban state
  const applyOptimisticMove = (card, targetStage) => {
    const prevColumns = kanbanColumns;
    const prevStages = stages;
    const sourceStageId = card.stage_id;
    const targetStageId = targetStage.id;
    const isRejectTarget =
      targetStage.terminal_type === 'rejected' ||
      targetStage.name.toLowerCase().includes('reject');

    const movedCard = {
      ...card,
      stage_id: targetStageId,
      stage_name: targetStage.name,
      days_in_stage: 0,
    };

    setKanbanColumns((prev) => {
      const next = { ...prev };
      if (next[sourceStageId]) {
        next[sourceStageId] = {
          ...next[sourceStageId],
          items: next[sourceStageId].items.filter((c) => c.id !== card.id),
          total: Math.max(0, (next[sourceStageId].total || 1) - 1),
        };
      }
      if (!isRejectTarget) {
        const destCol = next[targetStageId] || { items: [], total: 0, has_more: false };
        next[targetStageId] = {
          ...destCol,
          items: [movedCard, ...destCol.items.filter((c) => c.id !== card.id)],
          total: (destCol.total || 0) + 1,
        };
      }
      return next;
    });

    setStages((prev) =>
      prev.map((s) => {
        if (s.id === sourceStageId) {
          return { ...s, applicants_count: Math.max(0, (s.applicants_count || 1) - 1) };
        }
        if (s.id === targetStageId) {
          return { ...s, applicants_count: (s.applicants_count || 0) + 1 };
        }
        return s;
      })
    );

    return {
      rollback: () => {
        setKanbanColumns(prevColumns);
        setStages(prevStages);
      },
    };
  };

  // Execute stage move from Kanban drop
  const handleKanbanDropToStage = async (card, targetStage) => {
    if (!canMoveToStage(card, targetStage)) {
      showToast('error', 'Only Org Admin can move candidates to Offer or Hired.');
      return;
    }

    const targetLower = targetStage.name.toLowerCase();

    // Special flow 1: Dropping into Interview must use the existing interview flow (pick round & assign interviewer)
    if (targetLower === 'interview') {
      setPendingInterviewDrop({ card, targetStage });
      return;
    }

    // Optimistic update for regular stages, Offer, and Hired
    const { rollback } = applyOptimisticMove(card, targetStage);

    try {
      const res = await changeApplicationStage(card.id, {
        current_stage_id: card.stage_id,
        target_stage_id: targetStage.id,
        expected_version: card.version,
        expected_updated_at: card.updated_at,
      });

      const updatedVersion = res.data?.version ?? (card.version || 1) + 1;
      const updatedAt = res.data?.updated_at ?? new Date().toISOString();

      // Sync version/updated_at on moved card
      setKanbanColumns((prev) => {
        const col = prev[targetStage.id];
        if (!col) return prev;
        return {
          ...prev,
          [targetStage.id]: {
            ...col,
            items: col.items.map((c) =>
              c.id === card.id ? { ...c, version: updatedVersion, updated_at: updatedAt } : c
            ),
          },
        };
      });

      showToast('success', `${card.candidate_name} moved to ${targetStage.name}.`);

      // Special flow 2: Drop into Offer -> open Offer Details modal
      if (targetLower.includes('offer')) {
        setKanbanOfferCard({
          ...card,
          stage_id: targetStage.id,
          stage_name: targetStage.name,
          version: updatedVersion,
          updated_at: updatedAt,
        });
      }

      // Special flow 3: Drop into Hired -> offer "Create Employee" action
      if (targetStage.terminal_type === 'hired' || targetLower.includes('hire')) {
        if (!card.converted_employee_id && canConvertEmployee) {
          try {
            const detailRes = await getApplicationDetail(card.id);
            setKanbanHirePrompt({ app: card, detail: detailRes.data });
          } catch {
            // Fallback: user can click Review to convert
          }
        }
      }
    } catch (err) {
      rollback();
      const status = err.response?.status;
      const msg = err.response?.data?.detail || 'Failed to move card. Reverted.';
      showToast('error', msg);
      if (status === 409) {
        loadKanbanBoard();
      }
    }
  };

  // Confirm Move-to-Interview modal
  const handleConfirmInterviewDrop = async ({
    round_template_id,
    round_name,
    interview_type,
    interviewer_employee_id,
  }) => {
    if (!pendingInterviewDrop) return;
    const { card, targetStage } = pendingInterviewDrop;
    const { rollback } = applyOptimisticMove(card, targetStage);

    try {
      setInterviewDropSubmitting(true);
      const stageRes = await changeApplicationStage(card.id, {
        current_stage_id: card.stage_id,
        target_stage_id: targetStage.id,
        expected_version: card.version,
        expected_updated_at: card.updated_at,
        skip_auto_interview: true,
      });

      const ivRes = await createInterview({
        application_id: card.id,
        round_template_id,
        round_name,
        round_number: 1,
        interview_type,
      });

      if (interviewer_employee_id && ivRes.data?.interview_id) {
        await assignInterviewer(ivRes.data.interview_id, {
          interviewer_employee_id,
        });
      }

      const updatedVersion = stageRes.data?.version ?? (card.version || 1) + 1;
      const updatedAt = stageRes.data?.updated_at ?? new Date().toISOString();
      setKanbanColumns((prev) => {
        const col = prev[targetStage.id];
        if (!col) return prev;
        return {
          ...prev,
          [targetStage.id]: {
            ...col,
            items: col.items.map((c) =>
              c.id === card.id ? { ...c, version: updatedVersion, updated_at: updatedAt } : c
            ),
          },
        };
      });

      setPendingInterviewDrop(null);
      showToast(
        'success',
        interviewer_employee_id
          ? `${card.candidate_name} moved to Interview & interviewer assigned.`
          : `${card.candidate_name} moved to Interview (${round_name} created).`
      );
    } catch (err) {
      rollback();
      if (err.response?.status === 409) {
        setPendingInterviewDrop(null);
        loadKanbanBoard();
      }
      throw err;
    } finally {
      setInterviewDropSubmitting(false);
    }
  };

  // Trigger Reject Modal from Kanban drop zone
  const handleKanbanDropToReject = (card) => {
    if (!canRejectCard(card)) {
      showToast('error', 'Only Org Admin can reject candidates from Interview stage onward.');
      return;
    }
    setPendingRejectCard(card);
    setRejectReason(rejectionReasons[0] || DEFAULT_REJECTION_REASONS[0]);
    setRejectNote('');
    setActionError('');
    setShowRejectModal(true);
  };

  // 5-second Undo handler after rejecting from Kanban
  const startUndoRejectCountdown = (payload) => {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    setUndoReject({ ...payload, secondsLeft: 5 });
    undoTimerRef.current = setInterval(() => {
      setUndoReject((prev) => {
        if (!prev || prev.secondsLeft <= 1) {
          clearInterval(undoTimerRef.current);
          undoTimerRef.current = null;
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  };

  const handleUndoReject = async () => {
    if (!undoReject) return;
    const { card, prevStage, rejectedStage: rejSt, newVersion, newUpdatedAt } = undoReject;
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoReject(null);

    try {
      await changeApplicationStage(card.id, {
        current_stage_id: rejSt.id,
        target_stage_id: prevStage.id,
        expected_version: newVersion,
        expected_updated_at: newUpdatedAt,
        reason: 'Rejection undone',
        is_undo: true,
      });
      showToast('success', `Restored ${card.candidate_name} back to ${prevStage.name}.`);
      loadKanbanBoard();
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Could not undo rejection.');
      loadKanbanBoard();
    }
  };

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    };
  }, []);

  // Open detail view
  const openApplicationDetail = async (appId) => {
    setSelectedAppId(appId);
    setDetailTab('details');
    setActionError('');
    setShowRejectModal(false);

    try {
      setDetailLoading(true);
      const res = await getApplicationDetail(appId);
      setDetail(res.data);

      // Load resume blob
      if (res.data.resume_file_id || res.data.resume_path || res.data.resume_file_name) {
        setResumeLoading(true);
        setResumeError(false);
        try {
          const blobRes = await getResumeBlob(appId);
          const url = URL.createObjectURL(blobRes.data);
          setResumeBlobUrl(url);
        } catch (bErr) {
          console.error('Failed to stream resume blob', bErr);
          setResumeBlobUrl(null);
          setResumeError(true);
        } finally {
          setResumeLoading(false);
        }
      } else {
        setResumeBlobUrl(null);
        setResumeError(false);
      }
    } catch (err) {
      console.error('Failed to load application detail', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedAppId(null);
    setDetail(null);
    setResumeError(false);
    if (deepLinkAppId) {
      updateUrlParams({ app: null });
    }
    if (resumeBlobUrl) {
      URL.revokeObjectURL(resumeBlobUrl);
      setResumeBlobUrl(null);
    }
  };

  // Close detail modal on Escape when sub-modals are not open
  useEffect(() => {
    if (!selectedAppId) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !showRejectModal && !showOfferModal && !showConvertModal) {
        closeDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAppId, showRejectModal, showOfferModal, showConvertModal, resumeBlobUrl]);

  // Unified stage move handler
  const handleStageMove = async (targetStageName, reason = null, note = null) => {
    if (!detail) return;

    // Find target stage object
    const targetStage = stages.find(
      (s) => s.name.toLowerCase() === targetStageName.toLowerCase()
    );
    if (!targetStage) {
      setActionError(`Target stage "${targetStageName}" not found.`);
      return;
    }

    try {
      setActionLoading(true);
      setActionError('');

      await changeApplicationStage(detail.id, {
        current_stage_id: detail.stage.id,
        target_stage_id: targetStage.id,
        reason: reason,
        note: note,
        expected_version: detail.version,
        expected_updated_at: detail.updated_at,
      });

      // Reload detail and active view
      const updatedRes = await getApplicationDetail(detail.id);
      setDetail(updatedRes.data);
      setShowRejectModal(false);
      refreshActiveView();
    } catch (err) {
      console.error(err);
      setActionError(
        err.response?.data?.detail || 'Failed to update stage. Please try again.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setActionError('Rejection reason is required.');
      return;
    }

    // Case A: Reject triggered by dropping a Kanban card into Reject drop zone
    if (pendingRejectCard) {
      if (!rejectedStage) {
        setActionError('Rejected stage not found.');
        return;
      }
      const card = pendingRejectCard;
      const prevStage = stages.find((s) => s.id === card.stage_id) || {
        id: card.stage_id,
        name: card.stage_name,
      };
      const { rollback } = applyOptimisticMove(card, rejectedStage);

      try {
        setActionLoading(true);
        setActionError('');
        const res = await changeApplicationStage(card.id, {
          current_stage_id: card.stage_id,
          target_stage_id: rejectedStage.id,
          reason: rejectReason.trim(),
          note: rejectNote.trim() || null,
          expected_version: card.version,
          expected_updated_at: card.updated_at,
        });
        setShowRejectModal(false);
        setPendingRejectCard(null);

        startUndoRejectCountdown({
          card,
          prevStage,
          rejectedStage,
          newVersion: res.data?.version ?? (card.version || 1) + 1,
          newUpdatedAt: res.data?.updated_at ?? null,
        });
      } catch (err) {
        rollback();
        setActionError(err.response?.data?.detail || 'Failed to reject candidate.');
        if (err.response?.status === 409) {
          setShowRejectModal(false);
          setPendingRejectCard(null);
          loadKanbanBoard();
        }
      } finally {
        setActionLoading(false);
      }
      return;
    }

    // Case B: Reject triggered from Application Detail modal
    await handleStageMove('Rejected', rejectReason, rejectNote);
  };

  // Deep-link support: open detail modal if ?app=<id> is in URL
  useEffect(() => {
    if (deepLinkAppId && deepLinkAppId !== selectedAppId) {
      openApplicationDetail(deepLinkAppId);
    }
  }, [deepLinkAppId]);

  // Add private note with @mentions
  const handleAddNote = async (content, mentionedEmployeeIds = []) => {
    if (!detail || !content?.trim()) return false;
    try {
      setAddingNote(true);
      await addApplicationNote(detail.id, {
        note: content.trim(),
        mentioned_employee_ids: mentionedEmployeeIds,
      });
      const updatedRes = await getApplicationDetail(detail.id);
      setDetail(updatedRes.data);
      return true;
    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.detail || 'Failed to add note.');
      return false;
    } finally {
      setAddingNote(false);
    }
  };

  // Single-card manual assign / reassign (from Kanban card or Detail modal)
  const handleQuickAssign = async (app, recruiterId) => {
    try {
      setAssigningDetail(true);
      const res = await assignApplication(app.id, { assigned_to: recruiterId || null });
      const newAssignee = res.data?.assignee || null;
      const newAssignedTo = res.data?.assigned_to || null;
      const newVersion = res.data?.version;

      // Update in Kanban state
      setKanbanColumns((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((stId) => {
          next[stId] = {
            ...next[stId],
            items: (next[stId].items || []).map((c) =>
              c.id === app.id
                ? {
                    ...c,
                    assigned_to: newAssignedTo,
                    assignee: newAssignee,
                    version: newVersion ?? c.version,
                  }
                : c
            ),
          };
        });
        return next;
      });

      // Update in Table state
      setApplicants((prev) =>
        prev.map((a) =>
          a.id === app.id
            ? { ...a, assigned_to: newAssignedTo, assignee: newAssignee, version: newVersion ?? a.version }
            : a
        )
      );

      // Reload detail if open
      if (detail && detail.id === app.id) {
        const detRes = await getApplicationDetail(app.id);
        setDetail(detRes.data);
      }

      showToast('success', res.data?.message || 'Assignment updated.');
      // Refresh recruiter counts & unassigned count
      loadStaticMeta();
      if (unassignedOnly || selectedAssignedTo) {
        refreshActiveView();
      }
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Failed to update assignment.');
    } finally {
      setAssigningDetail(false);
    }
  };

  // Bulk reassign handler
  const handleBulkReassign = async (payload) => {
    try {
      setBulkReassigning(true);
      const res = await bulkReassignApplications(payload);
      setShowBulkReassignModal(false);
      setSelectedAppIds([]);
      showToast('success', res.data?.message || 'Applications reassigned.');
      loadStaticMeta();
      refreshActiveView();
    } finally {
      setBulkReassigning(false);
    }
  };

  // Bulk Shortlist
  const handleBulkShortlist = async () => {
    if (selectedAppIds.length === 0) return;
    try {
      setBulkProcessing(true);
      await bulkShortlistApplications({ application_ids: selectedAppIds });
      refreshActiveView();
    } catch (err) {
      alert(err.response?.data?.detail || 'Bulk shortlist failed.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedAppIds(applicants.map((a) => a.id));
    } else {
      setSelectedAppIds([]);
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedAppIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Total applicants count (from backend aggregate query)
  const totalCount = useMemo(() => {
    return stages.reduce((acc, s) => acc + (s.applicants_count || 0), 0);
  }, [stages]);

  const activeStage = stages.find((s) => s.id === activeStageId);
  const isAppliedTab = activeStage?.is_initial;

  return (
    <div className={`${viewMode === 'kanban' ? 'max-w-full' : 'max-w-7xl'} mx-auto space-y-5`}>
      {/* Page Header (Matches Mockup: Title + Total Pill, My Board / View As, Table/Kanban Toggle + Refresh) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Applicants</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              {totalCount} Total
            </span>
            {!isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <UserCheck size={12} />
                <span>My Board</span>
              </span>
            ) : viewAsRecruiterId ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <span>
                  Viewing as:{' '}
                  {recruiters.find((r) => r.id === viewAsRecruiterId)?.full_name || 'Recruiter'}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                <span>Combined Board</span>
              </span>
            )}
          </div>
          <p className="hidden sm:block text-sm text-slate-700 mt-1 font-medium">
            {!isAdmin
              ? 'Showing applications assigned to you. Review resumes, shortlist, and manage your hiring pipeline.'
              : 'Review candidate applications, view resumes in-app, shortlist, and manage hiring pipeline.'}
          </p>
        </div>

        <div className="ap-head-tools flex items-center gap-2.5 flex-wrap w-full sm:w-auto self-start sm:self-auto">
          {/* Org Admin: View As Recruiter Dropdown with per-recruiter pending counts */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0 sm:flex-none">
              <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">View as:</label>
              <select
                value={viewAsRecruiterId}
                onChange={(e) => {
                  const val = e.target.value;
                  updateUrlParams({
                    view_as: val || null,
                    assigned_to: null,
                    unassigned: null,
                  });
                }}
                className="text-base sm:text-xs font-semibold bg-white border border-gray-300 rounded-xl px-3 py-2.5 sm:py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto max-w-[230px] min-w-0"
              >
                <option value="">Combined Board (All)</option>
                {recruiters.map((rec) => (
                  <option key={rec.id} value={rec.id}>
                    {rec.full_name} ({rec.pending_count ?? 0} pending)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Segmented Table / Kanban Toggle */}
          <div className="hidden md:inline-flex items-center rounded-xl border border-gray-200 bg-white p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-gray-900'
              }`}
            >
              <List size={14} />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-gray-900'
              }`}
            >
              <LayoutGrid size={14} />
              <span>Kanban</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              loadStaticMeta();
              refreshActiveView();
            }}
            className="btn btn-secondary inline-flex items-center justify-center gap-1.5 text-xs py-2 px-3 bg-white min-w-[44px] min-h-[44px] sm:min-h-0"
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Org Admin View-As Banner */}
      {isAdmin && viewAsRecruiterId && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            Viewing <strong>{recruiters.find((r) => r.id === viewAsRecruiterId)?.full_name || 'Recruiter'}</strong>&apos;s
            board ({recruiters.find((r) => r.id === viewAsRecruiterId)?.pending_count ?? 0} pending applications).
          </span>
          <button
            type="button"
            onClick={() => updateUrlParams({ view_as: null, assigned_to: null })}
            className="text-xs font-bold text-amber-800 hover:text-amber-950 underline"
          >
            Back to Combined Board
          </button>
        </div>
      )}

      {/* Inline Toast Alert */}
      {toast && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 shadow-xs ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'error' ? (
              <AlertCircle size={15} className="shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-60 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Dynamic Stage Tabs (shown in Table View) */}
      {viewMode === 'table' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveStageId('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-2 ${
              activeStageId === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
            }`}
          >
            <span>All Applicants</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[0.8125rem] ${
                activeStageId === 'ALL' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-slate-700'
              }`}
            >
              {totalCount}
            </span>
          </button>

          {stages.map((stage) => {
            const isSelected = activeStageId === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
                }`}
              >
                <span>{stage.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[0.8125rem] ${
                    isSelected ? 'bg-blue-700 text-white' : 'bg-gray-100 text-slate-700'
                  }`}
                >
                  {stage.applicants_count || 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters & Actions Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Job Filter Dropdown (URL-synced via ?job=<id>) */}
            <div className="w-full sm:w-64">
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full text-base sm:text-xs font-medium bg-white border border-gray-300 rounded-lg px-3 py-2.5 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Job Openings</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.department_name || 'General'})
                  </option>
                ))}
              </select>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" />
                <input
                  type="text"
                  placeholder="Search by candidate name, email, or role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-base sm:text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="btn btn-primary text-xs py-2 px-4">
                Search
              </button>
            </form>

            {/* Actions: 2-up grid on phones, flows inline on bigger screens */}
            <div className="ap-actions grid grid-cols-2 gap-2 w-full sm:contents">
            {/* Filters Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFiltersPanel((v) => !v)}
              className={`btn text-xs py-2 px-3 inline-flex items-center gap-1.5 border transition-colors ${
                showFiltersPanel || activeFiltersCount > 0
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter size={14} />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[0.8125rem] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Unassigned Pool Quick-Toggle Pill (Org Admin only) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() =>
                  updateUrlParams({
                    unassigned: unassignedOnly ? null : true,
                    assigned_to: null,
                    view_as: null,
                  })
                }
                className={`btn text-xs py-2 px-3 inline-flex items-center gap-1.5 border transition-colors ${
                  unassignedOnly
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                title="Filter to Unassigned Pool"
              >
                <span>Unassigned</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[0.8125rem] font-bold ${
                    unassignedOnly ? 'bg-amber-600 text-white' : 'bg-gray-100 text-slate-700'
                  }`}
                >
                  {unassignedCount}
                </span>
              </button>
            )}

            {/* Bulk Reassign Button */}
            <button
              type="button"
              onClick={() => setShowBulkReassignModal(true)}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 bg-white"
              title="Bulk reassign applications or transfer a recruiter's pipeline"
            >
              <Users size={14} />
              <span>Bulk Reassign</span>
            </button>

            {/* Admin-only: Equal Split Distribute & Round-Robin Pool Settings */}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setDistributionModalTab('equal_split')}
                  className="btn text-xs py-2 px-3 inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                  title="Equally split all currently unassigned applications across selected recruiters"
                >
                  <Shuffle size={14} />
                  <span>Distribute</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionModalTab('round_robin')}
                  className="btn btn-secondary text-xs py-2 px-2.5 inline-flex items-center gap-1 bg-white"
                  title="Round-Robin Recruiter Pool Settings"
                >
                  <Settings size={14} />
                </button>
              </>
            )}
            </div>
          </div>

          {/* Bulk Action Bar (when rows selected in Table view) */}
          {viewMode === 'table' && selectedAppIds.length > 0 && (
            <div className="flex items-center gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
              <span className="text-xs font-semibold text-gray-700">
                {selectedAppIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setShowBulkReassignModal(true)}
                className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
              >
                <Users size={14} />
                <span>Reassign</span>
              </button>
              {isAppliedTab && (
                <button
                  type="button"
                  onClick={handleBulkShortlist}
                  disabled={bulkProcessing}
                  className="btn btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5 shadow-sm"
                >
                  {bulkProcessing ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <UserCheck size={14} />
                  )}
                  <span>Bulk Shortlist</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Server-Side Filters Bar (URL-synced) */}
        {showFiltersPanel && (
          <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end">
            <div>
              <label className="block text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => updateUrlParams({ date_from: e.target.value || null })}
                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => updateUrlParams({ date_to: e.target.value || null })}
                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Stage
              </label>
              <select
                value={activeStageId}
                onChange={(e) => setActiveStageId(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Stages</option>
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.applicants_count || 0})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Source
              </label>
              <select
                value={selectedSource}
                onChange={(e) => updateUrlParams({ source: e.target.value || null })}
                className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sources</option>
                {(filterOptions.sources || []).map((src) => (
                  <option key={src} value={src}>
                    {src.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin && (
              <div>
                <label className="block text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Assigned To
                </label>
                <select
                  value={unassignedOnly ? '' : selectedAssignedTo}
                  disabled={unassignedOnly}
                  onChange={(e) =>
                    updateUrlParams({
                      assigned_to: e.target.value || null,
                      view_as: null,
                      unassigned: null,
                    })
                  }
                  className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Recruiters</option>
                  {(filterOptions.recruiters || []).map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pb-1">
              {isAdmin ? (
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={unassignedOnly}
                    onChange={(e) =>
                      updateUrlParams({
                        unassigned: e.target.checked ? true : null,
                        assigned_to: e.target.checked ? null : selectedAssignedTo || null,
                        view_as: null,
                      })
                    }
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Unassigned only</span>
                </label>
              ) : (
                <span />
              )}

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[0.8125rem] font-semibold text-red-600 hover:text-red-700 whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Kanban View vs Table View */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          stages={boardStages}
          rejectedStage={rejectedStage}
          columns={kanbanColumns}
          loading={kanbanLoading}
          loadingMoreMap={loadingMoreMap}
          showJobBadge={selectedJobId === 'ALL'}
          recruiters={recruiters}
          canMoveToStage={canMoveToStage}
          canRejectCard={canRejectCard}
          onQuickAssign={handleQuickAssign}
          onDropToStage={handleKanbanDropToStage}
          onDropToReject={handleKanbanDropToReject}
          onLoadMoreColumn={handleLoadMoreColumn}
          onOpenDetail={openApplicationDetail}
          onOpenResume={handleOpenResumeDirect}
        />
      ) : loading ? (
        <div className="py-24 text-center text-slate-700">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm font-medium">Loading applicants...</p>
        </div>
      ) : applicants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={32} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No applicants found</h3>
          <p className="text-sm text-slate-700 max-w-md mx-auto mt-1 font-medium">
            {search || activeStageId !== 'ALL' || selectedJobId !== 'ALL'
              ? 'Try adjusting your search criteria or stage tab.'
              : 'New applications submitted through your public careers portal will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-slate-700 font-semibold uppercase tracking-wider text-[0.8125rem]">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectedAppIds.length > 0 &&
                        selectedAppIds.length === applicants.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="py-3.5 px-4">Candidate</th>
                  <th className="py-3.5 px-4">Job Role</th>
                  <th className="py-3.5 px-4">Assignee</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Time in Stage</th>
                  <th className="py-3.5 px-4">Resume</th>
                  <th className="py-3.5 px-4">
                    <button
                      type="button"
                      onClick={() => setMatchSort((s) => (s === 'desc' ? 'asc' : s === 'asc' ? null : 'desc'))}
                      className="inline-flex items-center gap-1 uppercase tracking-wider font-semibold hover:text-blue-600"
                      title="Sort by resume match score (suggestion only)"
                    >
                      Match
                      <ArrowUpDown size={12} className={matchSort ? 'text-blue-600' : ''} />
                      {matchSort && <span className="normal-case text-[0.7rem]">{matchSort === 'desc' ? 'high first' : 'low first'}</span>}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {sortedApplicants.map((app) => {
                  const isSelected = selectedAppIds.includes(app.id);
                  return (
                    <tr
                      key={app.id}
                      onClick={() => openApplicationDetail(app.id)}
                      className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <td
                        className="py-3.5 px-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(app.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* Candidate Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                            {(app.candidate_name || 'C')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900 hover:text-blue-600">
                                {app.candidate_name}
                              </span>
                              {app.other_applications_count > 0 && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[0.8125rem] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  title={`This candidate has ${app.other_applications_count} other application(s)`}
                                >
                                  +{app.other_applications_count} more
                                </span>
                              )}
                            </div>
                            <span className="text-[0.8125rem] text-slate-700 block font-medium">
                              {app.candidate_email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Job Role */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-gray-900 block">{app.job_title}</span>
                        <span className="text-[0.8125rem] text-slate-700 block font-medium">
                          {app.department_name || 'General'}
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={app.assigned_to || ''}
                          onChange={(e) => handleQuickAssign(app, e.target.value || null)}
                          className="text-[0.8125rem] font-medium bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[140px]"
                        >
                          <option value="">Unassigned</option>
                          {recruiters.map((rec) => (
                            <option key={rec.id} value={rec.id}>
                              {rec.full_name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Stage Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.8125rem] font-semibold ${
                            app.terminal_type === 'hired'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : app.terminal_type === 'rejected'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : app.stage_name === 'Offer'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : app.stage_name === 'Interview'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : app.stage_name === 'Screening'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {app.stage_name}
                        </span>
                        {app.rejection_reason && (
                          <span className="block text-[0.8125rem] text-red-500 mt-0.5 truncate max-w-[140px]">
                            {app.rejection_reason}
                          </span>
                        )}
                      </td>

                      {/* Time in Stage (as required by PDF: "Show X days in stage on rows") */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Clock size={13} className="text-slate-700" />
                          {app.days_in_stage === 0 ? 'Today' : `${app.days_in_stage} days`}
                        </span>
                      </td>

                      {/* Resume Icon */}
                      <td className="py-3.5 px-4">
                        {app.has_resume ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <FileText size={14} /> PDF
                          </span>
                        ) : (
                          <span className="text-slate-700">No file</span>
                        )}
                      </td>

                      {/* Resume match score */}
                      <td className="py-3.5 px-4">
                        {['pending', 'processing'].includes(app.parse_status) ||
                        (app.parse_status === 'done' && app.match_score != null) ? (
                          <MatchBadge match={app} compact />
                        ) : (
                          <span className="text-slate-500" title={app.parse_status === 'failed' ? 'Resume could not be analyzed' : 'Not analyzed'}>–</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openApplicationDetail(app.id);
                          }}
                          className="btn btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1"
                        >
                          <span>Review</span>
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Wide Split-View Application Detail Modal ─────────── */}
      {selectedAppId &&
        createPortal(
          <div
            className="fixed inset-0 z-[250] overflow-hidden bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDetail();
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Modal Top Bar */}
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {detail?.candidate?.full_name ? detail.candidate.full_name[0].toUpperCase() : 'C'}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight flex items-center gap-2 flex-wrap">
                    {detail?.candidate?.full_name || 'Candidate Application'}
                    <MatchBadge match={detail?.match} />
                  </h2>
                  <p className="text-xs text-slate-700 font-medium">
                    Applying for <strong className="text-gray-700">{detail?.job?.title}</strong> • Stage:{' '}
                    <span className="font-semibold text-blue-600">{detail?.stage?.name}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDetail}
                className="p-2 text-slate-700 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-700 py-20">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs font-medium text-slate-700">Loading applicant details...</p>
              </div>
            ) : detail ? (
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/60">
                {/* Action Error Alert */}
                {actionError && (
                  <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                {/* Candidate Overview & Resume Document Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Candidate Quick Overview Card (2 cols on md+) */}
                  <div className="md:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
                      <span className="font-bold text-slate-700 uppercase tracking-wider text-[0.8125rem]">
                        Candidate Information
                      </span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[0.8125rem] text-slate-700 font-medium">Assigned to:</span>
                          <select
                            value={detail.assigned_to || ''}
                            disabled={assigningDetail}
                            onChange={(e) => handleQuickAssign(detail, e.target.value || null)}
                            className="text-[0.8125rem] font-semibold bg-gray-50 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Unassigned Pool</option>
                            {recruiters.map((rec) => (
                              <option key={rec.id} value={rec.id}>
                                {rec.full_name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span className="text-slate-700 text-[0.8125rem] font-medium">
                          Time in current stage: <strong className="text-gray-800">{detail.days_in_stage === 0 ? 'Today' : `${detail.days_in_stage} days`}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700">
                      <div>
                        <span className="text-[0.8125rem] text-slate-700 block font-semibold uppercase">Email</span>
                        <span className="font-medium text-gray-900 truncate block text-xs" title={detail.candidate.email}>
                          {detail.candidate.email}
                        </span>
                      </div>
                      <div>
                        <span className="text-[0.8125rem] text-slate-700 block font-semibold uppercase">Phone</span>
                        <span className="font-medium text-gray-900 block text-xs">
                          {detail.candidate.phone || 'Not provided'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[0.8125rem] text-slate-700 block font-semibold uppercase">Location</span>
                        <span className="font-medium text-gray-900 block text-xs">
                          {detail.candidate.current_location || 'Not provided'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[0.8125rem] text-slate-700 block font-semibold uppercase">Experience</span>
                        <span className="font-medium text-gray-900 block text-xs">
                          {detail.candidate.years_of_experience != null
                            ? `${detail.candidate.years_of_experience} years`
                            : 'Fresher'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Resume Document Card (1 col on md+) */}
                  <div className="bg-white p-4 sm:p-5 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 shadow-sm flex flex-col justify-between space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
                        <FileText size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[0.8125rem] font-bold text-blue-600 uppercase tracking-wider block">
                          Candidate Resume
                        </span>
                        <h4 className="text-xs font-bold text-gray-900 truncate mt-0.5" title={detail.resume_file_name || 'Resume.pdf'}>
                          {detail.resume_file_name || 'Attached Resume'}
                        </h4>
                        <span className="text-[0.8125rem] text-slate-700 font-medium">Official PDF Document</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {resumeLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-700 py-1 font-medium">
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs">Preparing document...</span>
                        </div>
                      ) : resumeBlobUrl ? (
                        <>
                          <a
                            href={resumeBlobUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-primary flex-1 text-xs py-2 px-3 inline-flex items-center justify-center gap-1.5 shadow-sm font-semibold"
                          >
                            <ExternalLink size={14} />
                            <span>Open in New Tab</span>
                          </a>
                          <a
                            href={resumeBlobUrl}
                            download={detail.resume_file_name || 'resume.pdf'}
                            className="btn btn-secondary text-xs p-2 inline-flex items-center justify-center text-slate-700 hover:text-gray-900 font-medium"
                            title="Download PDF"
                          >
                            <Download size={15} />
                          </a>
                        </>
                      ) : resumeError ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (detail?.id) openApplicationDetail(detail.id);
                          }}
                          className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 text-amber-600"
                        >
                          <RefreshCw size={13} />
                          <span>Retry Loading</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-700 italic font-medium">No resume attached</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resume match: matched / missing skills, experience gap (suggestion only) */}
                {(detail.resume_file_id || detail.resume_path) && (
                  <MatchCard
                    applicationId={detail.id}
                    match={detail.match}
                    canEdit={!detail.stage?.is_terminal}
                    onChange={(m) => {
                      setDetail((d) => (d && d.id === detail.id ? { ...d, match: m } : d));
                      setApplicants((list) =>
                        list.map((a) =>
                          a.id === detail.id ? { ...a, parse_status: m.parse_status, match_score: m.match_score } : a
                        )
                      );
                    }}
                  />
                )}

                    {/* Stage Transition Action Bar */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Pipeline Actions
                      </h4>

                      {detail.stage.terminal_type === 'rejected' ? (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-red-800 block">Candidate Rejected</span>
                          <p className="text-red-700">Reason: {detail.rejection_reason}</p>
                          {detail.rejection_note && (
                            <p className="text-red-600 text-[0.8125rem] italic">Note: {detail.rejection_note}</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* If in Applied -> Shortlist (Screening) */}
                          {detail.stage.name === 'Applied' && (
                            <button
                              type="button"
                              onClick={() => handleStageMove('Screening')}
                              disabled={actionLoading}
                              className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm"
                            >
                              <CheckCircle2 size={15} />
                              <span>Shortlist (Move to Screening)</span>
                            </button>
                          )}

                          {/* If in Screening -> Move to Interview */}
                          {detail.stage.name === 'Screening' && (
                            <button
                              type="button"
                              onClick={() => handleStageMove('Interview')}
                              disabled={actionLoading}
                              className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm"
                            >
                              <ArrowRight size={15} />
                              <span>Move to Interview</span>
                            </button>
                          )}

                          {/* If in Interview -> Assign Interviewer & Move to Offer actions */}
                          {detail.stage.name === 'Interview' && (
                            <>
                              <button
                                type="button"
                                onClick={() => navigate('/ats/interviews')}
                                className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700 text-white"
                              >
                                <UserCheck size={15} />
                                <span>Assign Interviewer (Interviews Tab)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStageMove('Offer')}
                                disabled={actionLoading || !canManageOffers}
                                title={
                                  !canManageOffers
                                    ? 'Only Admin/HR can move candidates to Offer stage'
                                    : undefined
                                }
                                className={`text-xs py-2 px-3.5 rounded-xl font-semibold inline-flex items-center gap-1.5 transition-all ${
                                  canManageOffers
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                <ArrowRight size={15} />
                                <span>Move to Offer</span>
                              </button>
                            </>
                          )}

                          {/* If in Offer stage -> Offer Letter & Convert to Employee actions */}
                          {detail.stage.name === 'Offer' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate('/offer-letter', {
                                    state: {
                                      candidate_name: detail.candidate?.full_name,
                                      candidate_email: detail.candidate?.email,
                                      candidate_address:
                                        detail.candidate?.current_location ||
                                        detail.candidate?.address ||
                                        '',
                                      designation_name: detail.job?.title,
                                      department_name: detail.job?.department?.name || '',
                                      application_id: detail.id,
                                      fromAts: true,
                                    },
                                  })
                                }
                                className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                <FileCheck size={15} />
                                <span>Create Offer Letter</span>
                              </button>

                              {canConvertEmployee && !detail.converted_employee_id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowConvertModal(true);
                                  }}
                                  className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                >
                                  <UserCheck size={15} />
                                  <span>Convert to Employee</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* If in Hired stage */}
                          {detail.stage.name === 'Hired' && (
                            <>
                              {detail.converted_employee_id ? (
                                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
                                  <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                                  <span className="font-bold text-emerald-800">
                                    Hired & Onboarded
                                  </span>
                                  <a
                                    href="/employees"
                                    className="text-emerald-700 underline hover:text-emerald-900 font-medium inline-flex items-center gap-1 text-[0.8125rem] ml-1"
                                  >
                                    <span>Employee Directory</span>
                                    <ExternalLink size={12} />
                                  </a>
                                </div>
                              ) : (
                                canConvertEmployee && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowConvertModal(true);
                                    }}
                                    className="btn btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                  >
                                    <UserCheck size={15} />
                                    <span>Convert to Employee</span>
                                  </button>
                                )
                              )}
                            </>
                          )}

                          {/* Reject Action Button (with Reason modal) */}
                          <button
                            type="button"
                            onClick={() => setShowRejectModal(true)}
                            disabled={actionLoading}
                            className="btn btn-secondary text-xs py-2 px-3 text-red-600 hover:bg-red-50 border-red-200 inline-flex items-center gap-1.5"
                          >
                            <XCircle size={15} />
                            <span>Reject Candidate</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sub-Tabs Navigation & Content Card */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-gray-200 px-4 pt-2 bg-gray-50/50">
                        {[
                          { id: 'details', label: 'Cover Note & Job' },
                          {
                            id: 'offer',
                            label: `Offer Letter ${
                              detail.offers && detail.offers.length > 0
                                ? `(v${detail.offers[0].version_number})`
                                : ''
                            }`,
                          },
                          { id: 'notes', label: 'Private Notes' },
                          { id: 'activity', label: 'Activity Timeline' },
                        ].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setDetailTab(t.id)}
                            className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-colors ${
                              detailTab === t.id
                                ? 'border-blue-600 text-blue-600 bg-white -mb-px rounded-t-lg'
                                : 'border-transparent text-slate-700 hover:text-gray-800'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-4 sm:p-5">

                    {/* Sub-Tab 1: Details */}
                    {detailTab === 'details' && (
                      <div className="space-y-4 text-xs text-gray-700">
                        {detail.cover_note && (
                          <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-1">
                            <span className="font-bold text-gray-900 block">Cover Note</span>
                            <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                              {detail.cover_note}
                            </p>
                          </div>
                        )}

                        <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2">
                          <span className="font-bold text-gray-900 block">Job Details</span>
                          <p>
                            <strong>Role:</strong> {detail.job.title}
                          </p>
                          <p>
                            <strong>Department:</strong> {detail.job.department_name || 'General'}
                          </p>
                          <p>
                            <strong>Location:</strong> {detail.job.location || 'Remote'}
                          </p>
                          <p>
                            <strong>Type:</strong> {detail.job.job_type}
                          </p>
                        </div>

                        {/* Other Applications by this Candidate */}
                        {detail.other_applications && detail.other_applications.length > 0 && (
                          <div className="bg-white p-4 rounded-xl border border-indigo-200/80 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-900">
                                Other Applications ({detail.other_applications.length})
                              </span>
                              <span className="text-[0.8125rem] text-slate-700 font-medium">
                                Same candidate across other openings
                              </span>
                            </div>
                            <div className="space-y-2">
                              {detail.other_applications.map((other) => (
                                <div
                                  key={other.id}
                                  className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-gray-200/80 hover:border-blue-300 transition-colors"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-gray-900 truncate">
                                      {other.job_title}
                                    </div>
                                    <div className="text-[0.8125rem] text-slate-700 flex items-center gap-2 mt-0.5 flex-wrap font-medium">
                                      <span>Stage: <strong className="text-blue-700">{other.stage_name}</strong></span>
                                      <span>•</span>
                                      <span>
                                        Assignee:{' '}
                                        <strong className="text-gray-700">
                                          {other.assignee?.full_name || 'Unassigned'}
                                        </strong>
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openApplicationDetail(other.id)}
                                    className="btn btn-secondary text-[0.8125rem] py-1 px-2.5 inline-flex items-center gap-1 shrink-0"
                                  >
                                    <span>Open</span>
                                    <ExternalLink size={11} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sub-Tab: Offer Letter */}
                    {detailTab === 'offer' && (
                      <div className="space-y-4 text-xs text-gray-700">
                        {detail.offers && detail.offers.length > 0 ? (
                          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b pb-2">
                              <div>
                                <span className="font-bold text-gray-900 block text-sm">
                                  {detail.offers[0].designation}
                                </span>
                                <span className="text-[0.8125rem] text-slate-700 font-medium">
                                  Version {detail.offers[0].version_number} • Created{' '}
                                  {new Date(detail.offers[0].created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  detail.offers[0].status === 'Accepted'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : detail.offers[0].status === 'Declined'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-purple-100 text-purple-700'
                                }`}
                              >
                                {detail.offers[0].status}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="text-slate-700 font-semibold block uppercase text-[0.8125rem]">
                                  Annual CTC
                                </span>
                                <span className="font-bold text-purple-700 text-sm">
                                  ₹{detail.offers[0].ctc?.toLocaleString('en-IN')} / Year
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-700 font-semibold block uppercase text-[0.8125rem]">
                                  Joining Date
                                </span>
                                <span className="font-semibold text-gray-900">
                                  {detail.offers[0].joining_date}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-700 font-semibold block uppercase text-[0.8125rem]">
                                  Probation
                                </span>
                                <span className="text-gray-800">
                                  {detail.offers[0].probation_period_months} Months
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-700 font-semibold block uppercase text-[0.8125rem]">
                                  Validity
                                </span>
                                <span className="text-gray-800">
                                  {detail.offers[0].validity_date || 'Standard'}
                                </span>
                              </div>
                            </div>

                            {detail.offers[0].notes && (
                              <div className="p-2.5 bg-gray-50 rounded-lg text-slate-700 text-[0.8125rem] font-medium">
                                <strong>Stipulations:</strong> {detail.offers[0].notes}
                              </div>
                            )}

                            <div className="pt-2 border-t flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate('/offer-letter', {
                                    state: {
                                      candidate_name: detail.candidate?.full_name,
                                      candidate_email: detail.candidate?.email,
                                      candidate_address:
                                        detail.candidate?.current_location ||
                                        detail.candidate?.address ||
                                        '',
                                      designation_name: detail.job?.title,
                                      department_name: detail.job?.department?.name || '',
                                      application_id: detail.id,
                                      ctc: detail.offers?.[0]?.ctc,
                                      fromAts: true,
                                    },
                                  })
                                }
                                className="btn btn-primary text-xs py-2 px-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold inline-flex items-center gap-1.5 shadow-sm"
                              >
                                <FileCheck size={14} />
                                <span>Open in Offer Letter Studio</span>
                              </button>

                              {canConvertEmployee && !detail.converted_employee_id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowConvertModal(true);
                                  }}
                                  className="btn btn-primary text-xs py-2 px-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold inline-flex items-center gap-1.5 shadow-sm"
                                >
                                  <UserCheck size={14} />
                                  <span>Convert to Employee</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white p-8 rounded-xl border border-gray-200 text-center space-y-3">
                            <FileCheck size={36} className="mx-auto text-purple-400" />
                            <div className="space-y-1">
                              <h5 className="font-bold text-gray-800">No Offer Letter Generated Yet</h5>
                              <p className="text-xs text-slate-700 max-w-xs mx-auto font-medium">
                                Generate an official offer letter with compensation, role, joining timeline, and print-ready templates.
                              </p>
                            </div>
                            {canManageOffers && (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate('/offer-letter', {
                                    state: {
                                      candidate_name: detail.candidate?.full_name,
                                      candidate_email: detail.candidate?.email,
                                      candidate_address:
                                        detail.candidate?.current_location ||
                                        detail.candidate?.address ||
                                        '',
                                      designation_name: detail.job?.title,
                                      department_name: detail.job?.department?.name || '',
                                      application_id: detail.id,
                                      fromAts: true,
                                    },
                                  })
                                }
                                className="btn btn-primary text-xs py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center gap-1.5 shadow-sm"
                              >
                                <Plus size={14} />
                                <span>Create Offer Letter</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sub-Tab 2: Private Notes with @mentions */}
                    {detailTab === 'notes' && (
                      <MentionNotesSection
                        notes={detail.notes || []}
                        mentionableUsers={mentionableUsers}
                        onAddNote={handleAddNote}
                        addingNote={addingNote}
                      />
                    )}

                    {/* Sub-Tab 3: Activity Timeline & Stage History */}
                    {detailTab === 'activity' && (
                      <div className="space-y-5">
                        {detail.stage_history && detail.stage_history.length > 0 && (
                          <div className="bg-slate-50 p-3.5 rounded-xl border border-gray-200 space-y-2">
                            <h5 className="text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700">
                              Stage History
                            </h5>
                            <div className="space-y-1.5">
                              {detail.stage_history.map((sh) => (
                                <div
                                  key={sh.id}
                                  className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-gray-100 text-xs"
                                >
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-700">
                                      {sh.from_stage || 'New'}
                                    </span>
                                    <ArrowRight size={12} className="text-slate-700" />
                                    <span className="font-bold text-blue-700">
                                      {sh.to_stage || 'Unknown'}
                                    </span>
                                    <span className="text-slate-700">by {sh.changed_by_name}</span>
                                    {sh.reason && (
                                      <span className="text-slate-700 italic">({sh.reason})</span>
                                    )}
                                  </div>
                                  <span className="text-[0.8125rem] text-slate-700 font-medium">
                                    {sh.changed_at ? new Date(sh.changed_at).toLocaleString() : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {detail.assignment_history && detail.assignment_history.length > 0 && (
                          <div className="bg-indigo-50/40 p-3.5 rounded-xl border border-indigo-200/70 space-y-2">
                            <h5 className="text-[0.8125rem] font-bold uppercase tracking-wider text-indigo-700">
                              Assignment History
                            </h5>
                            <div className="space-y-1.5">
                              {detail.assignment_history.map((ah) => (
                                <div
                                  key={ah.id}
                                  className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-indigo-100 text-xs"
                                >
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-700">
                                      {ah.from_assignee_name}
                                    </span>
                                    <ArrowRight size={12} className="text-slate-700" />
                                    <span className="font-bold text-indigo-700">
                                      {ah.to_assignee_name}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[0.8125rem] font-semibold uppercase">
                                      {ah.mode?.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-slate-700">by {ah.assigned_by_name}</span>
                                  </div>
                                  <span className="text-[0.8125rem] text-slate-700 font-medium">
                                    {ah.assigned_at ? new Date(ah.assigned_at).toLocaleString() : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="relative pl-5 border-l-2 border-gray-200 space-y-4">
                          {(detail.activities || []).map((act) => (
                            <div key={act.id} className="relative text-xs">
                              <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white"></div>
                              <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm space-y-1">
                                <div className="flex items-center justify-between text-[0.8125rem] text-slate-700 font-medium">
                                  <span className="font-semibold text-gray-800">
                                    {act.actor_name}
                                  </span>
                                  <span>{new Date(act.created_at).toLocaleString()}</span>
                                </div>
                                <p className="font-medium text-gray-700">
                                  {act.event_type === 'applied' && 'Applied to job via careers portal'}
                                  {act.event_type === 'stage_changed' &&
                                    `Moved stage from ${act.from_stage_name || 'Initial'} to ${act.to_stage_name}`}
                                  {act.event_type === 'rejected' &&
                                    `Rejected candidate. Reason: ${act.metadata?.reason || 'Not specified'}`}
                                  {act.event_type === 'rejection_undone' &&
                                    `Undid rejection — restored to ${act.to_stage_name}`}
                                  {act.event_type === 'assigned' &&
                                    `Assigned from ${act.metadata?.from_assignee_name || 'Unassigned'} to ${act.metadata?.to_assignee_name || 'Unassigned'} (${act.metadata?.mode || 'manual'})`}
                                  {act.event_type === 'note_added' && 'Added a private note'}
                                </p>
                                {act.metadata?.note && (
                                  <p className="text-slate-700 text-[0.8125rem] italic bg-gray-50 p-2 rounded font-medium">
                                    "{act.metadata.note}"
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}

      {/* ── Reject Reason Modal (Rule 7: Reject always needs a reason) ─ */}
      {showRejectModal && (
        <Modal
          isOpen={true}
          title="Reject Candidate Application"
          onClose={() => {
            setShowRejectModal(false);
            setPendingRejectCard(null);
            setActionError('');
          }}
        >
          <form onSubmit={handleConfirmReject} className="space-y-4">
            <p className="text-xs text-slate-700 font-medium">
              Please specify the primary reason for rejecting{' '}
              <strong>{pendingRejectCard?.candidate_name || detail?.candidate?.full_name}</strong>.
              This reason will be recorded in the stage history and activity log.
            </p>

            {actionError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium bg-white"
              >
                {rejectionReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Additional Notes (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Internal notes regarding why this decision was made..."
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setPendingRejectCard(null);
                  setActionError('');
                }}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="btn bg-red-600 hover:bg-red-700 text-white text-xs py-2 px-4 rounded-lg font-semibold inline-flex items-center gap-1.5"
              >
                {actionLoading && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Bulk Reassign Modal (Phase 3) ── */}
      {showBulkReassignModal && (
        <BulkReassignModal
          recruiters={recruiters}
          selectedAppIds={selectedAppIds}
          submitting={bulkReassigning}
          onClose={() => setShowBulkReassignModal(false)}
          onConfirm={handleBulkReassign}
        />
      )}

      {/* ── Equal Split Distribute & Round-Robin Pool Settings Modal (Phase 4) ── */}
      {distributionModalTab && (
        <DistributionModal
          initialTab={distributionModalTab}
          recruiters={recruiters}
          unassignedCount={unassignedCount}
          onClose={() => setDistributionModalTab(null)}
          onDistributed={() => {
            loadStaticMeta();
            refreshActiveView();
          }}
        />
      )}

      {/* ── Kanban Drop into Interview: Existing Interview Round & Assign Flow ── */}
      {pendingInterviewDrop && (
        <MoveToInterviewModal
          application={pendingInterviewDrop.card}
          submitting={interviewDropSubmitting}
          onClose={() => setPendingInterviewDrop(null)}
          onConfirm={handleConfirmInterviewDrop}
        />
      )}

      {/* ── Kanban Drop into Offer: Open Offer Details Modal ── */}
      {kanbanOfferCard && (
        <OfferLetterModal
          applicationId={kanbanOfferCard.id}
          candidateName={kanbanOfferCard.candidate_name}
          jobTitle={kanbanOfferCard.job_title}
          onClose={() => {
            setKanbanOfferCard(null);
            refreshActiveView();
          }}
          onOpenConvertModal={async () => {
            const cardId = kanbanOfferCard.id;
            setKanbanOfferCard(null);
            try {
              const res = await getApplicationDetail(cardId);
              setKanbanHirePrompt({ app: kanbanOfferCard, detail: res.data });
            } catch {
              openApplicationDetail(cardId);
            }
          }}
          canManageOffers={canManageOffers}
          canConvertEmployee={canConvertEmployee}
        />
      )}

      {/* ── Kanban Drop into Hired: Offer "Create Employee" Action ── */}
      {kanbanHirePrompt && (
        <ConvertToEmployeeModal
          applicationId={kanbanHirePrompt.detail.id}
          candidate={kanbanHirePrompt.detail.candidate}
          job={kanbanHirePrompt.detail.job}
          latestOffer={
            kanbanHirePrompt.detail.offers && kanbanHirePrompt.detail.offers.length > 0
              ? kanbanHirePrompt.detail.offers[0]
              : null
          }
          alreadyConvertedEmployeeId={kanbanHirePrompt.detail.converted_employee_id}
          onClose={() => {
            setKanbanHirePrompt(null);
            refreshActiveView();
          }}
          onSuccess={() => {
            setKanbanHirePrompt(null);
            refreshActiveView();
          }}
        />
      )}

      {/* ── 5-Second Undo Reject Floating Toast ── */}
      {undoReject &&
        createPortal(
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-4 text-xs animate-in fade-in slide-in-from-bottom-4 duration-150">
            <span>
              Rejected <strong>{undoReject.card.candidate_name}</strong> ({undoReject.secondsLeft}s)
            </span>
            <button
              type="button"
              onClick={handleUndoReject}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold transition-colors"
            >
              <RotateCcw size={13} />
              <span>Undo</span>
            </button>
          </div>,
          document.body
        )}

      {/* ── Phase 4: Offer Letter Management & Browser Print Modal ── */}
      {showOfferModal && detail && (
        <OfferLetterModal
          applicationId={detail.id}
          candidateName={detail.candidate?.full_name}
          jobTitle={detail.job?.title}
          onClose={() => {
            setShowOfferModal(false);
            openApplicationDetail(detail.id);
            refreshActiveView();
          }}
          onOpenConvertModal={() => setShowConvertModal(true)}
          canManageOffers={canManageOffers}
          canConvertEmployee={canConvertEmployee}
        />
      )}

      {/* ── Phase 4: Convert Candidate to Employee Modal ─────────── */}
      {showConvertModal && detail && (
        <ConvertToEmployeeModal
          applicationId={detail.id}
          candidate={detail.candidate}
          job={detail.job}
          latestOffer={detail.offers && detail.offers.length > 0 ? detail.offers[0] : null}
          alreadyConvertedEmployeeId={detail.converted_employee_id}
          onClose={() => {
            setShowConvertModal(false);
            openApplicationDetail(detail.id);
            refreshActiveView();
          }}
          onSuccess={() => {
            openApplicationDetail(detail.id);
            refreshActiveView();
          }}
        />
      )}
    </div>
  );
}
