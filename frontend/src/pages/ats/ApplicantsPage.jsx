import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import {
  getAtsStages,
  getApplicants,
  getApplicationDetail,
  getResumeBlob,
  changeApplicationStage,
  addApplicationNote,
  bulkShortlistApplications,
  getJobOpenings,
} from '../../api/ats';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import OfferLetterModal from '../../components/ats/OfferLetterModal';
import ConvertToEmployeeModal from '../../components/ats/ConvertToEmployeeModal';

export default function ApplicantsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];
  const canManageOffers = isAdmin || !!user?.permissions?.['ats:offer:manage'] || !!user?.permissions?.['ats:offer:create'] || !!user?.permissions?.['ats:application:read'];
  const canConvertEmployee = isAdmin || !!user?.permissions?.['ats:hire:convert'];

  const [stages, setStages] = useState([]);
  const [activeStageId, setActiveStageId] = useState('ALL');
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('ALL');
  const [search, setSearch] = useState('');

  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Resume preview state
  const [resumeBlobUrl, setResumeBlobUrl] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState(false);

  // Actions state
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('Qualifications did not match job requirements');
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState('');

  // Note state
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Load stages & jobs
  const loadInitialData = async () => {
    try {
      const [stagesRes, jobsRes] = await Promise.all([
        getAtsStages(),
        getJobOpenings(),
      ]);
      setStages(stagesRes.data || []);
      setJobs(jobsRes.data || []);
    } catch (err) {
      console.error('Failed to load initial ATS data', err);
    }
  };

  // Load applicants
  const loadApplicants = async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeStageId !== 'ALL') params.stage_id = activeStageId;
      if (selectedJobId !== 'ALL') params.job_id = selectedJobId;
      if (search.trim()) params.search = search.trim();

      const res = await getApplicants(params);
      setApplicants(res.data || []);
      setSelectedAppIds([]);
    } catch (err) {
      console.error('Failed to load applicants', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadApplicants();
  }, [activeStageId, selectedJobId]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadApplicants();
  };

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
      });

      // Reload detail and list
      const updatedRes = await getApplicationDetail(detail.id);
      setDetail(updatedRes.data);
      setShowRejectModal(false);
      loadApplicants();
      // refresh stages count
      const stagesRes = await getAtsStages();
      setStages(stagesRes.data || []);
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
    await handleStageMove('Rejected', rejectReason, rejectNote);
  };

  // Add private note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    try {
      setAddingNote(true);
      await addApplicationNote(detail.id, { note: newNote.trim() });
      setNewNote('');
      const updatedRes = await getApplicationDetail(detail.id);
      setDetail(updatedRes.data);
    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.detail || 'Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  // Bulk Shortlist
  const handleBulkShortlist = async () => {
    if (selectedAppIds.length === 0) return;
    try {
      setBulkProcessing(true);
      await bulkShortlistApplications({ application_ids: selectedAppIds });
      await loadApplicants();
      const stagesRes = await getAtsStages();
      setStages(stagesRes.data || []);
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

  // Total applicants count
  const totalCount = useMemo(() => {
    return stages.reduce((acc, s) => acc + (s.applicants_count || 0), 0);
  }, [stages]);

  const activeStage = stages.find((s) => s.id === activeStageId);
  const isAppliedTab = activeStage?.is_initial;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Applicants</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
              {totalCount} Total
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Review candidate applications, view resumes in-app, shortlist, and manage hiring pipeline.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            loadInitialData();
            loadApplicants();
          }}
          className="btn btn-secondary inline-flex items-center gap-2 text-sm self-start sm:self-auto"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Dynamic Stage Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        <button
          type="button"
          onClick={() => setActiveStageId('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-2 ${
            activeStageId === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
          }`}
        >
          <span>All Applicants</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeStageId === 'ALL' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'
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
                  : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
              }`}
            >
              <span>{stage.name}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  isSelected ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {stage.applicants_count || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters & Actions Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Job Filter Dropdown */}
          <div className="w-full sm:w-64">
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full text-xs font-medium bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by candidate name, email, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="submit" className="btn btn-secondary text-xs py-2 px-3">
              Search
            </button>
          </form>
        </div>

        {/* Bulk Action (for Applied tab) */}
        {isAppliedTab && selectedAppIds.length > 0 && (
          <div className="flex items-center gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
            <span className="text-xs font-semibold text-gray-700">
              {selectedAppIds.length} selected
            </span>
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
              <span>Bulk Shortlist (Screening)</span>
            </button>
          </div>
        )}
      </div>

      {/* Applicants List */}
      {loading ? (
        <div className="py-24 text-center text-gray-500">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm font-medium">Loading applicants...</p>
        </div>
      ) : applicants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={32} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No applicants found</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            {search || activeStageId !== 'ALL' || selectedJobId !== 'ALL'
              ? 'Try adjusting your search criteria or stage tab.'
              : 'New applications submitted through your public careers portal will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  {isAppliedTab && (
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
                  )}
                  <th className="py-3.5 px-4">Candidate</th>
                  <th className="py-3.5 px-4">Job Role</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Time in Stage</th>
                  <th className="py-3.5 px-4">Resume</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {applicants.map((app) => {
                  const isSelected = selectedAppIds.includes(app.id);
                  return (
                    <tr
                      key={app.id}
                      onClick={() => openApplicationDetail(app.id)}
                      className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      {isAppliedTab && (
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
                      )}

                      {/* Candidate Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-sm">
                            {(app.candidate_name || 'C')[0].toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 block hover:text-blue-600">
                              {app.candidate_name}
                            </span>
                            <span className="text-[11px] text-gray-500 block">
                              {app.candidate_email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Job Role */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-gray-900 block">{app.job_title}</span>
                        <span className="text-[11px] text-gray-500 block">
                          {app.department_name || 'General'}
                        </span>
                      </td>

                      {/* Stage Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
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
                          <span className="block text-[10px] text-red-500 mt-0.5 truncate max-w-[140px]">
                            {app.rejection_reason}
                          </span>
                        )}
                      </td>

                      {/* Time in Stage (as required by PDF: "Show X days in stage on rows") */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-medium text-gray-600">
                          <Clock size={13} className="text-gray-400" />
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
                          <span className="text-gray-400">No file</span>
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
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">
                    {detail?.candidate?.full_name || 'Candidate Application'}
                  </h2>
                  <p className="text-xs text-gray-500">
                    Applying for <strong className="text-gray-700">{detail?.job?.title}</strong> • Stage:{' '}
                    <span className="font-semibold text-blue-600">{detail?.stage?.name}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDetail}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-20">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-xs font-medium text-gray-500">Loading applicant details...</p>
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
                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <span className="font-bold text-gray-600 uppercase tracking-wider text-[11px]">
                        Candidate Information
                      </span>
                      <span className="text-gray-500 text-[11px]">
                        Time in current stage: <strong className="text-gray-800">{detail.days_in_stage === 0 ? 'Today' : `${detail.days_in_stage} days`}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-gray-600">
                      <div>
                        <span className="text-[10px] text-gray-400 block font-semibold uppercase">Email</span>
                        <span className="font-medium text-gray-900 truncate block text-xs" title={detail.candidate.email}>
                          {detail.candidate.email}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block font-semibold uppercase">Phone</span>
                        <span className="font-medium text-gray-900 block text-xs">
                          {detail.candidate.phone || 'Not provided'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block font-semibold uppercase">Location</span>
                        <span className="font-medium text-gray-900 block text-xs">
                          {detail.candidate.current_location || 'Not provided'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 block font-semibold uppercase">Experience</span>
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
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                          Candidate Resume
                        </span>
                        <h4 className="text-xs font-bold text-gray-900 truncate mt-0.5" title={detail.resume_file_name || 'Resume.pdf'}>
                          {detail.resume_file_name || 'Attached Resume'}
                        </h4>
                        <span className="text-[11px] text-gray-500">Official PDF Document</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {resumeLoading ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
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
                            className="btn btn-secondary text-xs p-2 inline-flex items-center justify-center text-gray-600 hover:text-gray-900"
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
                        <span className="text-xs text-gray-400 italic">No resume attached</span>
                      )}
                    </div>
                  </div>
                </div>

                    {/* Stage Transition Action Bar */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Pipeline Actions
                      </h4>

                      {detail.stage.terminal_type === 'rejected' ? (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-red-800 block">Candidate Rejected</span>
                          <p className="text-red-700">Reason: {detail.rejection_reason}</p>
                          {detail.rejection_note && (
                            <p className="text-red-600 text-[11px] italic">Note: {detail.rejection_note}</p>
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
                                    className="text-emerald-700 underline hover:text-emerald-900 font-medium inline-flex items-center gap-1 text-[11px] ml-1"
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
                                : 'border-transparent text-gray-500 hover:text-gray-800'
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
                            <p className="text-gray-600 whitespace-pre-line leading-relaxed">
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
                                <span className="text-[11px] text-gray-400">
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
                                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                                  Annual CTC
                                </span>
                                <span className="font-bold text-purple-700 text-sm">
                                  ₹{detail.offers[0].ctc?.toLocaleString('en-IN')} / Year
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                                  Joining Date
                                </span>
                                <span className="font-semibold text-gray-900">
                                  {detail.offers[0].joining_date}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                                  Probation
                                </span>
                                <span className="text-gray-800">
                                  {detail.offers[0].probation_period_months} Months
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-400 font-semibold block uppercase text-[10px]">
                                  Validity
                                </span>
                                <span className="text-gray-800">
                                  {detail.offers[0].validity_date || 'Standard'}
                                </span>
                              </div>
                            </div>

                            {detail.offers[0].notes && (
                              <div className="p-2.5 bg-gray-50 rounded-lg text-gray-600 text-[11px]">
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
                              <p className="text-xs text-gray-500 max-w-xs mx-auto">
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

                    {/* Sub-Tab 2: Private Notes */}
                    {detailTab === 'notes' && (
                      <div className="space-y-4">
                        <form onSubmit={handleAddNote} className="space-y-2">
                          <textarea
                            rows={3}
                            placeholder="Add an internal recruiter/interviewer note..."
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            className="w-full p-3 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="submit"
                            disabled={addingNote || !newNote.trim()}
                            className="btn btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
                          >
                            <Send size={13} />
                            <span>{addingNote ? 'Saving...' : 'Add Note'}</span>
                          </button>
                        </form>

                        <div className="space-y-2">
                          {(detail.activities || [])
                            .filter((a) => a.event_type === 'note_added')
                            .map((noteItem) => (
                              <div
                                key={noteItem.id}
                                className="bg-white p-3 rounded-xl border border-gray-200 text-xs space-y-1 shadow-sm"
                              >
                                <div className="flex items-center justify-between text-[11px] text-gray-400">
                                  <span className="font-semibold text-gray-700">
                                    {noteItem.actor_name}
                                  </span>
                                  <span>{new Date(noteItem.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-gray-700 leading-relaxed">
                                  {noteItem.metadata?.note}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Sub-Tab 3: Activity Timeline */}
                    {detailTab === 'activity' && (
                      <div className="space-y-3">
                        <div className="relative pl-5 border-l-2 border-gray-200 space-y-4">
                          {(detail.activities || []).map((act) => (
                            <div key={act.id} className="relative text-xs">
                              <div className="absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white"></div>
                              <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-gray-400">
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
                                  {act.event_type === 'note_added' && 'Added a private note'}
                                </p>
                                {act.metadata?.note && (
                                  <p className="text-gray-500 text-[11px] italic bg-gray-50 p-2 rounded">
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
        <Modal title="Reject Candidate Application" onClose={() => setShowRejectModal(false)}>
          <form onSubmit={handleConfirmReject} className="space-y-4">
            <p className="text-xs text-gray-500">
              Please specify the primary reason for rejecting <strong>{detail?.candidate?.full_name}</strong>.
              This reason will be recorded in the append-only activity log.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
              >
                <option value="Qualifications did not match job requirements">
                  Qualifications did not match job requirements
                </option>
                <option value="Salary expectation mismatch">Salary expectation mismatch</option>
                <option value="Notice period too long">Notice period too long</option>
                <option value="Position filled by another candidate">
                  Position filled by another candidate
                </option>
                <option value="Did not attend screening/interview">
                  Did not attend screening/interview
                </option>
                <option value="Cultural / Communication fit">Cultural / Communication fit</option>
                <option value="Other">Other</option>
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
                onClick={() => setShowRejectModal(false)}
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

      {/* ── Phase 4: Offer Letter Management & Browser Print Modal ── */}
      {showOfferModal && detail && (
        <OfferLetterModal
          applicationId={detail.id}
          candidateName={detail.candidate?.full_name}
          jobTitle={detail.job?.title}
          onClose={() => {
            setShowOfferModal(false);
            openApplicationDetail(detail.id);
            loadApplicants();
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
            loadApplicants();
          }}
          onSuccess={() => {
            openApplicationDetail(detail.id);
            loadApplicants();
          }}
        />
      )}
    </div>
  );
}
