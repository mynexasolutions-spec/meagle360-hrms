import { useState } from 'react';
import { Users, ArrowRight, AlertCircle, UserCheck } from 'lucide-react';
import Modal from '../Modal';

export default function BulkReassignModal({
  recruiters = [],
  selectedAppIds = [],
  onClose,
  onConfirm,
  submitting = false,
}) {
  const hasSelection = selectedAppIds.length > 0;
  const [mode, setMode] = useState(hasSelection ? 'selected' : 'recruiter');
  const [fromRecruiterId, setFromRecruiterId] = useState('');
  const [toRecruiterId, setToRecruiterId] = useState(''); // '' = Unassigned pool
  const [onlyActive, setOnlyActive] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'recruiter' && !fromRecruiterId) {
      setError('Please select the recruiter whose applications you want to reassign.');
      return;
    }
    if (mode === 'recruiter' && fromRecruiterId === toRecruiterId) {
      setError('Source and target recruiter cannot be the same.');
      return;
    }

    try {
      await onConfirm({
        application_ids: mode === 'selected' ? selectedAppIds : null,
        from_recruiter_id: mode === 'recruiter' ? fromRecruiterId : null,
        to_recruiter_id: toRecruiterId || null,
        only_active: onlyActive,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Bulk reassignment failed.');
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Bulk Reassign Applications">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-gray-600">
          Reassign selected applications or transfer an entire recruiter&apos;s pipeline (for example,
          when a recruiter leaves or goes on leave).
        </p>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => setMode('selected')}
            className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all ${
              mode === 'selected'
                ? 'border-blue-500 bg-blue-50 text-blue-800'
                : !hasSelection
                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="font-bold">Selected Cards ({selectedAppIds.length})</div>
            <div className="text-[0.8125rem] font-normal opacity-80 mt-0.5">
              Reassign checked rows in Table view
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('recruiter')}
            className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all ${
              mode === 'recruiter'
                ? 'border-blue-500 bg-blue-50 text-blue-800'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="font-bold">By Recruiter</div>
            <div className="text-[0.8125rem] font-normal opacity-80 mt-0.5">
              Transfer a recruiter&apos;s workload
            </div>
          </button>
        </div>

        {mode === 'recruiter' && (
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              From Recruiter <span className="text-red-500">*</span>
            </label>
            <select
              value={fromRecruiterId}
              onChange={(e) => setFromRecruiterId(e.target.value)}
              className="w-full p-2.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select recruiter...</option>
              {recruiters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.pending_count ?? 0} pending)
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">
            Assign To
          </label>
          <select
            value={toRecruiterId}
            onChange={(e) => setToRecruiterId(e.target.value)}
            className="w-full p-2.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Unassigned Pool (Remove assignee)</option>
            {recruiters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} ({r.pending_count ?? 0} pending)
              </option>
            ))}
          </select>
        </div>

        {mode === 'recruiter' && (
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Active pipeline only (exclude Hired &amp; Rejected applications)</span>
          </label>
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
            disabled={submitting}
            className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
          >
            {submitting ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UserCheck size={14} />
            )}
            <span>Confirm Reassign</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
