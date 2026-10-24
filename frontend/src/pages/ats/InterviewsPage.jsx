import { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Settings,
  Filter,
  Plus,
  ArrowRight,
  RotateCcw,
  Star,
  Video,
  MapPin,
  ExternalLink,
  Users,
  Eye,
  FileText,
  Copy,
  Check,
  X,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import {
  getAdminInterviews,
  getEligibleInterviewers,
  getRoundTemplates,
  createRoundTemplate,
  toggleRoundTemplate,
  getRejectionReasons,
  createRejectionReason,
  assignInterviewer,
  createInterview,
  changeApplicationStage,
  getAtsStages,
} from '../../api/ats';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

export default function InterviewsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role_name === 'Admin' || !!user?.permissions?.['settings:write'];
  const canManageSettings = isAdmin || !!user?.permissions?.['ats:settings:manage'];

  const [activeTab, setActiveTab] = useState('ALL');
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // ATS Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [roundTemplates, setRoundTemplates] = useState([]);
  const [rejectionReasons, setRejectionReasons] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newReason, setNewReason] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Assign Interviewer modal state
  const [assigningInterview, setAssigningInterview] = useState(null);
  const [interviewers, setInterviewers] = useState([]);
  const [selectedInterviewerId, setSelectedInterviewerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Next round modal state
  const [nextRoundApp, setNextRoundApp] = useState(null);
  const [nextRoundName, setNextRoundName] = useState('Technical Round');
  const [nextRoundType, setNextRoundType] = useState('Virtual');
  const [creatingRound, setCreatingRound] = useState(false);

  // View feedback modal state
  const [viewingFeedbackIv, setViewingFeedbackIv] = useState(null);

  // View Location / Meeting Link modal state
  const [viewingLocationModal, setViewingLocationModal] = useState(null);
  const [copiedLocation, setCopiedLocation] = useState(false);

  // Show past rounds history toggle
  const [showHistory, setShowHistory] = useState(false);

  const handleCopyLocation = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedLocation(true);
    setTimeout(() => setCopiedLocation(false), 2000);
  };

  // Error/Success state
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const tabs = [
    { id: 'ALL', label: 'All Interviews' },
    { id: 'Needs interviewer', label: 'Needs Interviewer' },
    { id: 'Awaiting slot', label: 'Awaiting Slot' },
    { id: 'Confirmed', label: 'Slot Confirmed' },
    { id: 'Feedback pending', label: 'Feedback Pending' },
    { id: 'Awaiting decision', label: 'Awaiting Decision' },
  ];

  const loadInterviews = async () => {
    try {
      setLoading(true);
      const res = await getAdminInterviews({
        tab: activeTab,
        include_history: showHistory,
      });
      setInterviews(res.data || []);
    } catch (err) {
      console.error('Failed to load admin interviews', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSettingsData = async () => {
    try {
      const [rtRes, rrRes, ivRes] = await Promise.all([
        getRoundTemplates(),
        getRejectionReasons(),
        getEligibleInterviewers(),
      ]);
      setRoundTemplates(rtRes.data || []);
      setRejectionReasons(rrRes.data || []);
      setInterviewers(ivRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadInterviews();
  }, [activeTab, showHistory]);

  useEffect(() => {
    loadSettingsData();
  }, []);

  const openAssignModal = async (iv) => {
    setAssigningInterview(iv);
    setSelectedInterviewerId(iv.interviewer_employee_id || '');
    setErrorMsg('');
    try {
      const res = await getEligibleInterviewers();
      setInterviewers(res.data || []);
    } catch (e) {
      console.error('Failed to refresh eligible interviewers', e);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInterviewerId) {
      setErrorMsg('Please select an interviewer.');
      return;
    }
    try {
      setAssigning(true);
      await assignInterviewer(assigningInterview.id, {
        interviewer_employee_id: selectedInterviewerId,
      });
      setAssigningInterview(null);
      loadInterviews();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to assign interviewer.');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddRoundTemplate = async (e) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    try {
      setSettingsLoading(true);
      await createRoundTemplate({
        name: newTemplateName.trim(),
        display_order: roundTemplates.length + 1,
      });
      setNewTemplateName('');
      const res = await getRoundTemplates();
      setRoundTemplates(res.data || []);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add round template.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleToggleTemplate = async (templateId, currentActive) => {
    try {
      await toggleRoundTemplate(templateId, !currentActive);
      const res = await getRoundTemplates();
      setRoundTemplates(res.data || []);
    } catch (err) {
      alert('Failed to update template status.');
    }
  };

  const handleAddRejectionReason = async (e) => {
    e.preventDefault();
    if (!newReason.trim()) return;
    try {
      setSettingsLoading(true);
      await createRejectionReason(newReason.trim());
      setNewReason('');
      const res = await getRejectionReasons();
      setRejectionReasons(res.data || []);
    } catch (err) {
      alert('Failed to add rejection reason.');
    } finally {
      setSettingsLoading(false);
    }
  };

  // Step 7: Admin Decision Handlers
  const handleMoveToOffer = async (applicationId) => {
    try {
      const stagesRes = await getAtsStages();
      const allStages = stagesRes.data || [];
      const offerStage = allStages.find((s) => s.name === 'Offer');
      const interviewStage = allStages.find((s) => s.name === 'Interview');

      if (!offerStage) {
        alert('Offer stage not found in pipeline.');
        return;
      }

      await changeApplicationStage(applicationId, {
        current_stage_id: interviewStage.id,
        target_stage_id: offerStage.id,
      });

      alert('Candidate moved to Offer stage.');
      loadInterviews();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to move to Offer.');
    }
  };

  const handleScheduleNextRound = async (e) => {
    e.preventDefault();
    if (!nextRoundApp) return;

    try {
      setCreatingRound(true);
      await createInterview({
        application_id: nextRoundApp.application_id,
        round_name: nextRoundName,
        round_number: (nextRoundApp.round_number || 1) + 1,
        interview_type: nextRoundType,
      });
      setNextRoundApp(null);
      loadInterviews();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to schedule next round.');
    } finally {
      setCreatingRound(false);
    }
  };

  const getCleanRound = (iv) => {
    const roundNum = iv.round_number || 1;
    let name = (iv.round_name || '').trim();
    name = name.replace(new RegExp(`^Round\\s*${roundNum}\\s*[:-]?\\s*`, 'i'), '');
    return {
      num: roundNum,
      name: name || 'Interview Round',
    };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Interview Management</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              ATS Coordination
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Assign interviewers, coordinate candidate slots, and review feedback across rounds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canManageSettings && (
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="btn btn-secondary inline-flex items-center gap-2 text-sm"
            >
              <Settings size={16} />
              <span>ATS Settings</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadInterviews}
            className="btn btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <RotateCcw size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === t.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-bar below Tabs: Count on Left, History Toggle on Right */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1 pt-0.5">
        <span>
          Showing <strong className="text-gray-800">{interviews.length}</strong> {interviews.length === 1 ? 'interview' : 'interviews'}
          {showHistory ? ' (including past completed & offered rounds)' : ' (active pipeline)'}
        </span>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer select-none bg-white px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors shadow-2xs">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
          <span>Show Past Completed Rounds</span>
        </label>
      </div>

      {/* Interviews Table / List */}
      {loading ? (
        <div className="py-24 text-center text-gray-500">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading interviews...</p>
        </div>
      ) : interviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CalendarDays size={32} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No interviews in this view</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            Move candidates to the Interview stage from the Applicants tab to start scheduling rounds.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Candidate & Role</th>
                  <th className="py-3.5 px-4">Round</th>
                  <th className="py-3.5 px-4">Interviewer</th>
                  <th className="py-3.5 px-4">Slot Status</th>
                  <th className="py-3.5 px-4">Feedback</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {interviews.map((iv) => (
                  <tr key={iv.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Candidate */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-gray-900 block">{iv.candidate_name}</span>
                      <span className="text-[11px] text-gray-500 block">{iv.job_title}</span>
                    </td>

                    {/* Round */}
                    <td className="py-3.5 px-4">
                      {(() => {
                        const cr = getCleanRound(iv);
                        return (
                          <div className="space-y-1">
                            <div>
                              <span className="font-semibold text-gray-800 block">
                                Round {cr.num}: {cr.name}
                              </span>
                              <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                {String(iv.interview_type || '').toLowerCase().includes('person') ? (
                                  <>
                                    <MapPin size={11} className="text-amber-600" /> In-Person
                                  </>
                                ) : (
                                  <>
                                    <Video size={11} className="text-blue-600" /> Virtual
                                  </>
                                )}
                              </span>
                            </div>

                            {/* Previous rounds history pills */}
                            {iv.previous_rounds && iv.previous_rounds.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {iv.previous_rounds.map((pr) => (
                                  <button
                                    key={pr.round_number}
                                    type="button"
                                    onClick={() =>
                                      setViewingFeedbackIv({
                                        candidate_name: iv.candidate_name,
                                        job_title: iv.job_title,
                                        round_number: pr.round_number,
                                        round_name: pr.round_name,
                                        interviewer_name: pr.interviewer_name,
                                        feedback: {
                                          attended: pr.status !== 'Absent',
                                          rating: pr.rating,
                                          recommendation: pr.recommendation || 'Proceed',
                                          notes: pr.notes,
                                        },
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 text-emerald-800 transition-colors cursor-pointer"
                                    title="Click to view previous round evaluation"
                                  >
                                    <span>R{pr.round_number}: {pr.recommendation || 'Passed'}</span>
                                    {pr.rating && <span>({pr.rating}/5)</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Interviewer */}
                    <td className="py-3.5 px-4">
                      {iv.interviewer_name ? (
                        <div className="flex items-center gap-1.5 font-medium text-gray-900">
                          <UserCheck size={14} className="text-emerald-600" />
                          <span>{iv.interviewer_name}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Needs Interviewer
                        </span>
                      )}
                    </td>

                    {/* Slot Status */}
                    <td className="py-3.5 px-4">
                      {iv.scheduled_at ? (
                        <div className="space-y-1">
                          <div>
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                              <CheckCircle2 size={13} /> Slot Confirmed
                            </span>
                            <span className="block text-[11px] text-gray-500">
                              {new Date(iv.scheduled_at).toLocaleString([], {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>

                          {iv.meeting_link_or_location ? (
                            <div>
                              {String(iv.interview_type || '').toLowerCase().includes('person') ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingLocationModal({
                                      candidateName: iv.candidate_name,
                                      roundName: `Round ${iv.round_number}: ${iv.round_name}`,
                                      type: 'In-Person',
                                      location: iv.meeting_link_or_location,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 transition-colors cursor-pointer"
                                  title="View interview venue/address"
                                >
                                  <MapPin size={10} className="text-amber-600" />
                                  <span>View Address</span>
                                </button>
                              ) : iv.meeting_link_or_location.startsWith('http') ? (
                                <a
                                  href={iv.meeting_link_or_location}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 transition-colors"
                                  title="Open Google Meet / Zoom link"
                                >
                                  <Video size={10} className="text-blue-600" />
                                  <span>Meet Link</span>
                                  <ExternalLink size={9} />
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingLocationModal({
                                      candidateName: iv.candidate_name,
                                      roundName: `Round ${iv.round_number}: ${iv.round_name}`,
                                      type: 'Virtual',
                                      location: iv.meeting_link_or_location,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 transition-colors"
                                >
                                  <Video size={10} className="text-blue-600" />
                                  <span>Meet Link</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="block text-[10px] text-gray-400 italic">No link/location set</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Awaiting Interviewer Slot</span>
                      )}
                    </td>

                    {/* Feedback Status */}
                    <td className="py-3.5 px-4">
                      {iv.feedback ? (
                        <div className="space-y-1.5">
                          <div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                iv.feedback.recommendation === 'Proceed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : iv.feedback.recommendation === 'Hold'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : iv.feedback.recommendation === 'Absent'
                                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {iv.feedback.recommendation}
                              {iv.feedback.rating && ` (${iv.feedback.rating}/5)`}
                            </span>
                          </div>

                          <div>
                            <button
                              type="button"
                              onClick={() => setViewingFeedbackIv(iv)}
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 hover:underline"
                              title="Click to view full feedback & evaluation"
                            >
                              <FileText size={12} />
                              <span>View Feedback</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">
                          {iv.feedback_status === 'submitted' ? 'Feedback Submitted' : 'Pending'}
                        </span>
                      )}
                    </td>

                    {/* Decision Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {iv.status === 'Needs interviewer' && (
                          <button
                            type="button"
                            onClick={() => openAssignModal(iv)}
                            className="btn btn-primary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 shadow-sm"
                          >
                            <UserCheck size={13} />
                            <span>Assign</span>
                          </button>
                        )}

                        {iv.status === 'Assigned' && (
                          <button
                            type="button"
                            onClick={() => openAssignModal(iv)}
                            className="btn btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1"
                          >
                            <span>Reassign</span>
                          </button>
                        )}

                        {/* Admin Decision when completed or absent */}
                        {isAdmin && (iv.status === 'Completed' || iv.status === 'Absent') && (
                          iv.stage_name === 'Offer' ? (
                            <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
                              Moved to Offer
                            </span>
                          ) : iv.stage_name === 'Hired' ? (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                              Hired
                            </span>
                          ) : iv.is_active_round === false ? (
                            <span className="text-[11px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
                              Past Round
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setNextRoundApp(iv)}
                                className="btn btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 text-blue-600 hover:bg-blue-50 border-blue-200"
                              >
                                <span>Next Round</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveToOffer(iv.application_id)}
                                className="btn btn-primary text-xs py-1.5 px-2.5 inline-flex items-center gap-1 shadow-sm"
                              >
                                <span>Move to Offer</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Assign Interviewer Modal ──────────────────────────── */}
      {assigningInterview && (
        <Modal
          title={`Assign Interviewer — ${assigningInterview.candidate_name}`}
          onClose={() => setAssigningInterview(null)}
        >
          <form onSubmit={handleAssignSubmit} className="space-y-4">
            <p className="text-xs text-gray-500">
              Select an active employee holding the <strong>Interviewer</strong> role for Round {assigningInterview.round_number} ({assigningInterview.round_name}).
            </p>

            {errorMsg && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Interviewer <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={selectedInterviewerId}
                onChange={(e) => setSelectedInterviewerId(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">Select Interviewer</option>
                {interviewers
                  .filter((emp) => {
                    const roles = (emp.role_names || []).map((r) => String(r).toLowerCase());
                    return roles.includes('admin') || roles.includes('interviewer');
                  })
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.department_name || 'General'} - {emp.employee_code})
                    </option>
                  ))}
              </select>
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssigningInterview(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={assigning}
                className="btn btn-primary text-xs py-2 px-4 shadow-sm"
              >
                {assigning ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Schedule Next Round Modal ────────────────────────── */}
      {nextRoundApp && (
        <Modal
          title={`Schedule Next Round — ${nextRoundApp.candidate_name}`}
          onClose={() => setNextRoundApp(null)}
        >
          <form onSubmit={handleScheduleNextRound} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Round Name <span className="text-red-500">*</span>
              </label>
              <select
                value={nextRoundName}
                onChange={(e) => setNextRoundName(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg font-medium"
              >
                {roundTemplates.filter((r) => r.is_active).map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
                <option value="Executive / Partner Round">Executive / Partner Round</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Round Type <span className="text-red-500">*</span>
              </label>
              <select
                value={nextRoundType}
                onChange={(e) => setNextRoundType(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg font-medium"
              >
                <option value="Virtual">Virtual</option>
                <option value="In-Person">In-Person</option>
              </select>
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setNextRoundApp(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingRound}
                className="btn btn-primary text-xs py-2 px-4 shadow-sm"
              >
                {creatingRound ? 'Scheduling...' : 'Create Round'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── ATS Settings Modal (Round Templates & Rejection Reasons) ─ */}
      {showSettingsModal && (
        <Modal title="ATS Configuration Settings" onClose={() => setShowSettingsModal(false)}>
          <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1">
            {/* Round Templates Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Interview Round Templates</h4>
                  <p className="text-[11px] text-gray-500">
                    Templates can be deactivated, never deleted (to preserve historic logs).
                  </p>
                </div>
              </div>

              {/* Add Template */}
              <form onSubmit={handleAddRoundTemplate} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. System Design Round"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="flex-1 p-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={settingsLoading || !newTemplateName.trim()}
                  className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Add Template
                </button>
              </form>

              {/* List */}
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                {roundTemplates.map((rt) => (
                  <div key={rt.id} className="p-3 flex items-center justify-between text-xs">
                    <span className={`font-semibold ${rt.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                      {rt.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleTemplate(rt.id, rt.is_active)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                        rt.is_active
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {rt.is_active ? 'Active' : 'Deactivated'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Rejection Reasons Section */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <div>
                <h4 className="text-sm font-bold text-gray-900">Configured Rejection Reasons</h4>
                <p className="text-[11px] text-gray-500">
                  Mandatory options presented to HR/recruiters when rejecting an applicant.
                </p>
              </div>

              <form onSubmit={handleAddRejectionReason} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Incompatible time zone"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="flex-1 p-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={settingsLoading || !newReason.trim()}
                  className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Add Reason
                </button>
              </form>

              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white max-h-48 overflow-y-auto">
                {rejectionReasons.map((rr) => (
                  <div key={rr.id} className="p-2.5 text-xs text-gray-700 font-medium">
                    • {rr.reason}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* ── View Interview Feedback Modal ────────────────────── */}
      {viewingFeedbackIv && viewingFeedbackIv.feedback && (
        <Modal
          title="Interview Evaluation & Feedback"
          onClose={() => setViewingFeedbackIv(null)}
        >
          <div className="space-y-5">
            {/* Top Summary Banner */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
                  Round {viewingFeedbackIv.round_number}: {viewingFeedbackIv.round_name}
                </span>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">
                  {viewingFeedbackIv.candidate_name}
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  {viewingFeedbackIv.job_title}
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-1">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                    viewingFeedbackIv.feedback.recommendation === 'Proceed'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : viewingFeedbackIv.feedback.recommendation === 'Hold'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : viewingFeedbackIv.feedback.recommendation === 'Absent'
                      ? 'bg-orange-100 text-orange-800 border border-orange-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  Decision: {viewingFeedbackIv.feedback.recommendation}
                </span>
                <span className="text-[11px] text-gray-500 font-medium">
                  Attendance: {viewingFeedbackIv.feedback.attended ? 'Attended' : 'Marked Absent'}
                </span>
              </div>
            </div>

            {/* Key Evaluation Metrics */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-gray-200">
                <span className="text-[11px] font-semibold text-gray-500 block mb-1">
                  Interviewer
                </span>
                <div className="flex items-center gap-1.5 font-bold text-gray-900">
                  <UserCheck size={14} className="text-emerald-600" />
                  <span>{viewingFeedbackIv.interviewer_name || 'Assigned Interviewer'}</span>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-gray-200">
                <span className="text-[11px] font-semibold text-gray-500 block mb-1">
                  Overall Rating
                </span>
                <div className="flex items-center gap-1.5 font-bold text-gray-900">
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={13}
                        className={
                          star <= (viewingFeedbackIv.feedback.rating || 0)
                            ? 'fill-amber-400 text-amber-500'
                            : 'text-gray-300'
                        }
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-700 ml-1">
                    ({viewingFeedbackIv.feedback.rating || 0}/5)
                  </span>
                </div>
              </div>
            </div>

            {/* Detailed Notes */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Detailed Evaluation Notes & Feedback
              </label>
              {viewingFeedbackIv.feedback.notes ? (
                <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200 text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                  {viewingFeedbackIv.feedback.notes}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic p-4 bg-gray-50 rounded-xl border border-gray-200">
                  No written notes provided by interviewer.
                </p>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const app = viewingFeedbackIv;
                        setViewingFeedbackIv(null);
                        setNextRoundApp(app);
                      }}
                      className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 text-blue-600 hover:bg-blue-50 border-blue-200"
                    >
                      <span>Schedule Next Round</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const appId = viewingFeedbackIv.application_id;
                        setViewingFeedbackIv(null);
                        handleMoveToOffer(appId);
                      }}
                      className="btn btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1 shadow-xs"
                    >
                      <span>Move to Offer</span>
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setViewingFeedbackIv(null)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* ── View Location / Meeting Details Modal ───────────── */}
      {viewingLocationModal && (
        <Modal
          title={
            viewingLocationModal.type === 'In-Person'
              ? 'Interview Location & Room'
              : 'Virtual Meeting Details'
          }
          onClose={() => {
            setViewingLocationModal(null);
            setCopiedLocation(false);
          }}
        >
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-gray-700">
              <span className="font-bold text-gray-900 block">
                {viewingLocationModal.candidateName}
              </span>
              <span className="text-[11px] text-gray-500 block">
                {viewingLocationModal.roundName}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {viewingLocationModal.type === 'In-Person'
                  ? 'Office Address / Meeting Room'
                  : 'Meeting Link / Instructions'}
              </label>
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-800 font-medium leading-relaxed break-words whitespace-pre-wrap select-all">
                {viewingLocationModal.location}
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleCopyLocation(viewingLocationModal.location)}
                className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 border-blue-200"
              >
                {copiedLocation ? (
                  <>
                    <Check size={13} className="text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewingLocationModal(null);
                  setCopiedLocation(false);
                }}
                className="btn btn-primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
