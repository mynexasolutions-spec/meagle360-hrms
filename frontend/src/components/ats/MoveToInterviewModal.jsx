import { useState, useEffect } from 'react';
import { Calendar, UserCheck, AlertCircle, Video } from 'lucide-react';
import Modal from '../Modal';
import { getRoundTemplates, getEligibleInterviewers } from '../../api/ats';

export default function MoveToInterviewModal({
  application,
  onClose,
  onConfirm,
  submitting = false,
}) {
  const [roundTemplates, setRoundTemplates] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [roundName, setRoundName] = useState('Technical Round');
  const [interviewType, setInterviewType] = useState('Virtual');
  const [interviewerId, setInterviewerId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const [rtRes, ivRes] = await Promise.all([
          getRoundTemplates().catch(() => ({ data: [] })),
          getEligibleInterviewers().catch(() => ({ data: [] })),
        ]);
        if (!active) return;
        const activeTemplates = (rtRes.data || []).filter((t) => t.is_active !== false);
        setRoundTemplates(activeTemplates);
        setInterviewers(ivRes.data || []);
        if (activeTemplates.length > 0) {
          setSelectedTemplateId(activeTemplates[0].id);
          setRoundName(activeTemplates[0].name);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleTemplateChange = (tplId) => {
    setSelectedTemplateId(tplId);
    const tpl = roundTemplates.find((t) => t.id === tplId);
    if (tpl) {
      setRoundName(tpl.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roundName.trim()) {
      setError('Please select or enter an interview round name.');
      return;
    }
    setError('');
    try {
      await onConfirm({
        round_template_id: selectedTemplateId || null,
        round_name: roundName.trim(),
        interview_type: interviewType,
        interviewer_employee_id: interviewerId || null,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to schedule interview.');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Move to Interview — Setup Round"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900">
          Moving <strong>{application?.candidate_name}</strong> ({application?.job_title}) into{' '}
          <strong>Interview</strong>. Pick the interview round and optionally assign an interviewer now.
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-xs text-gray-500">
            <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Loading interview templates &amp; panelists...</p>
          </div>
        ) : (
          <>
            {roundTemplates.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Interview Round Template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {roundTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                  <option value="">Custom round name...</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Round Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="e.g., Technical Round 1"
                required
                className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Video size={12} /> Interview Format
                  </span>
                </label>
                <select
                  value={interviewType}
                  onChange={(e) => setInterviewType(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Virtual">Virtual (Video Call)</option>
                  <option value="In-Person">In-Person</option>
                  <option value="Phone">Phone Screening</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <UserCheck size={12} /> Assign Interviewer (Optional)
                  </span>
                </label>
                <select
                  value={interviewerId}
                  onChange={(e) => setInterviewerId(e.target.value)}
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Assign later (Needs interviewer)</option>
                  {interviewers.map((iv) => (
                    <option key={iv.id} value={iv.id}>
                      {iv.full_name} {iv.department_name ? `(${iv.department_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn btn-secondary text-xs py-2 px-3"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loading}
            className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
          >
            {submitting ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Calendar size={14} />
            )}
            <span>{interviewerId ? 'Move & Assign Interviewer' : 'Move & Create Round'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
