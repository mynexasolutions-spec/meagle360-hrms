import { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  Video,
  FileText,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Star,
  Users,
  MapPin,
  Mail,
  Copy,
  Check,
  X,
  Send,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  getMyInterviews,
  setInterviewSlot,
  submitInterviewFeedback,
  getResumeBlob,
} from '../../api/ats';
import Modal from '../../components/Modal';

export default function MyInterviewsPage() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Set Slot Modal state
  const [slotModalIv, setSlotModalIv] = useState(null);
  const [slotDateTime, setSlotDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [slotInterviewType, setSlotInterviewType] = useState('Virtual');
  const [meetingLink, setMeetingLink] = useState('');
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotWarning, setSlotWarning] = useState('');
  const [slotError, setSlotError] = useState('');

  // Submit Feedback Modal state
  const [feedbackModalIv, setFeedbackModalIv] = useState(null);
  const [attended, setAttended] = useState(true);
  const [rating, setRating] = useState(4);
  const [recommendation, setRecommendation] = useState('Proceed');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  // Resume Opening state
  const [openingResumeAppId, setOpeningResumeAppId] = useState(null);

  // View Location / Meeting Link Modal state
  const [viewingLocationModal, setViewingLocationModal] = useState(null);
  const [copiedLocation, setCopiedLocation] = useState(false);

  const handleCopyLocation = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedLocation(true);
    setTimeout(() => setCopiedLocation(false), 2000);
  };

  const loadInterviews = async () => {
    try {
      setLoading(true);
      const res = await getMyInterviews();
      setInterviews(res.data || []);
    } catch (err) {
      console.error('Failed to load my interviews', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterviews();
  }, []);

  const openSlotModal = (iv) => {
    setSlotModalIv(iv);
    setSlotError('');
    setSlotWarning('');
    if (iv.scheduled_at) {
      // Format to YYYY-MM-DDTHH:mm for datetime-local
      const d = new Date(iv.scheduled_at);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setSlotDateTime(iso);
    } else {
      // Default to tomorrow 10:00 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setSlotDateTime(iso);
    }
    setDurationMinutes(iv.duration_minutes || 45);
    const rawType = String(iv.interview_type || '').toLowerCase();
    setSlotInterviewType(rawType.includes('person') ? 'In-Person' : 'Virtual');
    setMeetingLink(iv.meeting_link_or_location || '');
  };

  const handleSaveSlot = async (e) => {
    e.preventDefault();
    if (!slotDateTime) {
      setSlotError('Please choose a date and time.');
      return;
    }

    try {
      setSlotSaving(true);
      setSlotError('');

      const res = await setInterviewSlot(slotModalIv.id, {
        scheduled_at: new Date(slotDateTime).toISOString(),
        duration_minutes: parseInt(durationMinutes, 10) || 45,
        interview_type: slotInterviewType,
        meeting_link_or_location: meetingLink.trim() || null,
      });

      if (res.data?.overlap_warning) {
        setSlotWarning(
          res.data.warning_message ||
            'Warning: You have another interview scheduled around the same time.'
        );
      } else {
        setSlotModalIv(null);
        loadInterviews();
      }
    } catch (err) {
      setSlotError(err.response?.data?.detail || 'Failed to confirm slot.');
    } finally {
      setSlotSaving(false);
    }
  };

  const openFeedbackModal = (iv) => {
    setFeedbackModalIv(iv);
    setAttended(true);
    setRating(4);
    setRecommendation('Proceed');
    setFeedbackNotes('');
    setFeedbackError('');
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    try {
      setFeedbackSubmitting(true);
      setFeedbackError('');

      await submitInterviewFeedback(feedbackModalIv.id, {
        attended: attended,
        rating: attended ? rating : null,
        recommendation: attended ? recommendation : 'Absent',
        notes: feedbackNotes.trim() || null,
      });

      setFeedbackModalIv(null);
      loadInterviews();
    } catch (err) {
      setFeedbackError(err.response?.data?.detail || 'Failed to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const openResumePreview = async (applicationId) => {
    try {
      setOpeningResumeAppId(applicationId);
      const res = await getResumeBlob(applicationId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open candidate resume', err);
      alert('Failed to load candidate resume. Please try again.');
    } finally {
      setOpeningResumeAppId(null);
    }
  };

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">My Interviews</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Interviewer Portal
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Interviews assigned to you. Review candidate resumes, confirm your time slots, and submit feedback.
          </p>
        </div>

        <button
          type="button"
          onClick={loadInterviews}
          className="btn btn-secondary inline-flex items-center gap-2 text-sm self-start sm:self-auto"
        >
          <RotateCcw size={15} /> Refresh
        </button>
      </div>

      {/* Interviews List */}
      {loading ? (
        <div className="py-24 text-center text-gray-500">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading your assigned interviews...</p>
        </div>
      ) : interviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock size={32} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No interviews currently assigned</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            When recruiters assign candidates to you for technical or cultural rounds, they will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {interviews.map((iv) => {
            const roundInfo = getCleanRound(iv);
            const slotDate = iv.scheduled_at ? new Date(iv.scheduled_at) : null;
            const monthStr = slotDate
              ? slotDate.toLocaleString('default', { month: 'short' }).toUpperCase()
              : '';
            const dayStr = slotDate ? slotDate.getDate() : '';
            const weekdayTimeStr = slotDate
              ? `${slotDate.toLocaleString('default', { weekday: 'short' })}, ${slotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : '';

            return (
              <div
                key={iv.id}
                className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top: Candidate Hero + Status Pill */}
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                        {getInitials(iv.candidate_name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-gray-900 truncate leading-tight">
                          {iv.candidate_name}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                          {iv.job_title}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                        iv.status === 'Confirmed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : iv.status === 'Completed'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : iv.status === 'Absent'
                          ? 'bg-orange-50 text-orange-700 border border-orange-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {iv.status}
                    </span>
                  </div>

                  {/* Clean Round & Mode Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100/80">
                      Round {roundInfo.num} • {roundInfo.name}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
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

                  {/* Candidate Contact & Resume Pill */}
                  <div className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50/80 rounded-xl border border-gray-100 mb-3.5 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0 text-gray-600">
                      <Mail size={13} className="shrink-0 text-gray-400" />
                      <span className="truncate font-medium">{iv.candidate_email}</span>
                    </div>

                    {iv.has_resume && (
                      <button
                        type="button"
                        disabled={openingResumeAppId === iv.application_id}
                        onClick={() => openResumePreview(iv.application_id)}
                        className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 inline-flex items-center gap-1 transition-colors disabled:opacity-60 shadow-2xs"
                        title="Open candidate resume in new tab"
                      >
                        <FileText size={12} />
                        <span>
                          {openingResumeAppId === iv.application_id ? 'Opening...' : 'Resume'}
                        </span>
                        <ExternalLink size={10} className="text-blue-500" />
                      </button>
                    )}
                  </div>

                  {/* Scheduled Slot Info Tile */}
                  <div className="mb-4">
                    {iv.scheduled_at ? (
                      <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/70 text-emerald-950 flex items-start gap-3">
                        <div className="bg-white rounded-lg border border-emerald-200 px-2.5 py-1 text-center shrink-0 shadow-2xs min-w-[44px]">
                          <div className="text-[10px] font-bold tracking-wider text-emerald-700 uppercase leading-none">
                            {monthStr}
                          </div>
                          <div className="text-base font-extrabold text-emerald-900 leading-tight">
                            {dayStr}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                            <Clock size={13} className="text-emerald-700 shrink-0" />
                            <span>{weekdayTimeStr}</span>
                            <span className="text-[11px] font-normal text-emerald-700">
                              ({iv.duration_minutes}m)
                            </span>
                          </div>

                          {iv.meeting_link_or_location && (
                            <div className="pt-1">
                              {String(iv.interview_type || '').toLowerCase().includes('person') ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingLocationModal({
                                      candidateName: iv.candidate_name,
                                      roundName: `Round ${roundInfo.num} • ${roundInfo.name}`,
                                      type: 'In-Person',
                                      location: iv.meeting_link_or_location,
                                    })
                                  }
                                  className="w-full text-left py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100/90 border border-amber-200/90 text-[11px] font-medium text-amber-900 flex items-center justify-between gap-1 transition-colors group cursor-pointer"
                                  title="Click to view full office address"
                                >
                                  <span className="truncate flex items-center gap-1 min-w-0">
                                    <MapPin size={11} className="shrink-0 text-amber-700" />
                                    <span className="truncate">{iv.meeting_link_or_location}</span>
                                  </span>
                                  <span className="shrink-0 text-[10px] font-bold text-amber-700 underline group-hover:text-amber-900">
                                    View
                                  </span>
                                </button>
                              ) : iv.meeting_link_or_location.startsWith('http') ? (
                                <a
                                  href={iv.meeting_link_or_location}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[11px] font-semibold text-blue-700 transition-colors"
                                  title="Join virtual interview meeting"
                                >
                                  <Video size={11} className="shrink-0 text-blue-600" />
                                  <span>Join Meeting</span>
                                  <ExternalLink size={10} className="shrink-0 text-blue-500" />
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingLocationModal({
                                      candidateName: iv.candidate_name,
                                      roundName: `Round ${roundInfo.num} • ${roundInfo.name}`,
                                      type: 'Virtual',
                                      location: iv.meeting_link_or_location,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[11px] font-semibold text-blue-700 transition-colors"
                                >
                                  <Video size={11} className="shrink-0 text-blue-600" />
                                  <span>Meeting Link</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-900 text-xs font-medium flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0 text-amber-600" />
                        <span>Action needed: Please set your available slot and confirm.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  {/* Slot Confirmation / Reschedule */}
                  {iv.status !== 'Completed' && iv.status !== 'Absent' && (
                    <button
                      type="button"
                      onClick={() => openSlotModal(iv)}
                      className={`btn text-xs py-2 px-3 inline-flex items-center gap-1.5 flex-1 justify-center transition-all ${
                        iv.scheduled_at
                          ? 'btn-secondary text-gray-700'
                          : 'btn-primary shadow-xs'
                      }`}
                    >
                      <Calendar size={13} />
                      <span>{iv.scheduled_at ? 'Reschedule' : 'Set Slot & Confirm'}</span>
                    </button>
                  )}

                  {/* Feedback Submission */}
                  {iv.status === 'Confirmed' && (
                    <button
                      type="button"
                      onClick={() => openFeedbackModal(iv)}
                      className="btn btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5 flex-1 justify-center shadow-xs"
                    >
                      <Star size={13} />
                      <span>Submit Feedback</span>
                    </button>
                  )}

                  {iv.status === 'Completed' && (
                    <span className="w-full text-center py-2 text-xs font-semibold text-purple-700 bg-purple-50 rounded-xl border border-purple-200">
                      Feedback Submitted: {iv.my_feedback?.recommendation} ({iv.my_feedback?.rating}/5)
                    </span>
                  )}

                  {iv.status === 'Absent' && (
                    <span className="w-full text-center py-2 text-xs font-semibold text-orange-700 bg-orange-50 rounded-xl border border-orange-200">
                      Marked Absent
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Set Slot & Confirm Modal ──────────────────────────── */}
      {slotModalIv && (
        <Modal
          title={`Set Slot & Confirm — ${slotModalIv.candidate_name}`}
          onClose={() => setSlotModalIv(null)}
        >
          <form onSubmit={handleSaveSlot} className="space-y-4">
            {slotError && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold">
                {slotError}
              </div>
            )}

            {slotWarning && (
              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <span>{slotWarning}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Date & Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={slotDateTime}
                onChange={(e) => setSlotDateTime(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Type</label>
                <select
                  value={slotInterviewType}
                  onChange={(e) => setSlotInterviewType(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Virtual">Virtual</option>
                  <option value="In-Person">In-Person</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                {slotInterviewType === 'In-Person' ? 'Office Location / Room' : 'Meeting Link (Google Meet / Zoom)'}
              </label>
              <input
                type="text"
                placeholder={
                  slotInterviewType === 'In-Person'
                    ? 'e.g. Meagle360 HQ, Conference Room 2, 4th Floor'
                    : 'e.g. https://meet.google.com/xyz-abc or Zoom link'
                }
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSlotModalIv(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={slotSaving}
                className="btn btn-primary text-xs py-2 px-4 shadow-sm"
              >
                {slotSaving ? 'Confirming...' : 'Confirm Slot'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Submit Feedback Modal ─────────────────────────────── */}
      {feedbackModalIv && (
        <Modal
          title={`Submit Feedback — ${feedbackModalIv.candidate_name}`}
          onClose={() => setFeedbackModalIv(null)}
        >
          <form onSubmit={handleSubmitFeedback} className="space-y-4">
            {feedbackError && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold">
                {feedbackError}
              </div>
            )}

            {/* Attended Toggle */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900 block">Candidate Attended?</span>
                <span className="text-[11px] text-gray-500">
                  {attended
                    ? 'Candidate attended the scheduled interview.'
                    : 'Candidate did not attend (Status will become Absent).'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAttended(!attended)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  attended ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    attended ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {attended && (
              <>
                {/* Rating (1 to 5) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Rating (1-5 Stars)
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`p-1.5 rounded-lg transition-transform hover:scale-110 ${
                          rating >= star ? 'text-amber-500' : 'text-gray-300'
                        }`}
                      >
                        <Star size={24} fill={rating >= star ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-gray-700 ml-2">{rating} / 5</span>
                  </div>
                </div>

                {/* Recommendation */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Recommendation <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Proceed', label: 'Proceed (Pass)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                      { id: 'Hold', label: 'Hold (Undecided)', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                      { id: 'Reject', label: 'Reject (Fail)', color: 'text-red-700 bg-red-50 border-red-200' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRecommendation(opt.id)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-center ${
                          recommendation === opt.id
                            ? `${opt.color} ring-2 ring-blue-500/30`
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Detailed Interview Notes
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Candidate strengths, areas of improvement, and overall technical/cultural evaluation..."
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setFeedbackModalIv(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={feedbackSubmitting}
                className="btn btn-primary text-xs py-2 px-4 shadow-sm"
              >
                {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </form>
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
