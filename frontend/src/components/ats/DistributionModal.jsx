import { useState, useEffect } from 'react';
import {
  Shuffle,
  Settings,
  CheckCircle2,
  AlertCircle,
  Users,
  Sparkles,
} from 'lucide-react';
import Modal from '../Modal';
import {
  getDistributionSettings,
  updateDistributionSettings,
  distributeUnassignedEqualSplit,
} from '../../api/ats';

export default function DistributionModal({
  initialTab = 'equal_split', // 'equal_split' | 'round_robin'
  recruiters = [],
  unassignedCount = 0,
  onClose,
  onDistributed,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Round-robin settings state
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(true);
  const [poolIds, setPoolIds] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);

  // Equal split state
  const [selectedSplitIds, setSelectedSplitIds] = useState([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [distributing, setDistributing] = useState(false);
  const [splitResult, setSplitResult] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoadingSettings(true);
        const res = await getDistributionSettings();
        if (!active) return;
        const data = res.data || {};
        setAutoAssignEnabled(data.auto_assign_enabled !== false);
        const initialPool = data.round_robin_pool_ids || [];
        setPoolIds(initialPool);
        // Default equal-split selection to configured pool (or all recruiters if pool empty)
        if (initialPool.length > 0) {
          setSelectedSplitIds(initialPool);
        } else {
          setSelectedSplitIds(recruiters.map((r) => r.id));
        }
      } catch (err) {
        if (active) {
          setError(err.response?.data?.detail || 'Failed to load distribution settings.');
        }
      } finally {
        if (active) setLoadingSettings(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [recruiters]);

  const toggleId = (list, setList, id) => {
    setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      setSavingSettings(true);
      await updateDistributionSettings({
        auto_assign_enabled: autoAssignEnabled,
        round_robin_pool_ids: poolIds,
      });
      setSuccess('Round-robin pool settings saved. Applies to all new incoming applications.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save distribution settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleEqualSplit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSplitResult(null);

    if (selectedSplitIds.length === 0) {
      setError('Select at least one recruiter to distribute unassigned applications.');
      return;
    }

    try {
      setDistributing(true);
      const res = await distributeUnassignedEqualSplit({
        recruiter_ids: selectedSplitIds,
        only_active: onlyActive,
      });
      setSplitResult(res.data);
      setSuccess(
        res.data?.distributed_count > 0
          ? `Distributed ${res.data.distributed_count} unassigned application(s) equally.`
          : 'No unassigned applications were available to distribute.'
      );
      onDistributed?.();
    } catch (err) {
      setError(err.response?.data?.detail || 'Equal split distribution failed.');
    } finally {
      setDistributing(false);
    }
  };

  return (
    <Modal sheet isOpen={true} onClose={onClose} title="Applicant Distribution & Recruiter Pool">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('equal_split');
              setError('');
              setSuccess('');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
              activeTab === 'equal_split'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            <Shuffle size={13} />
            <span>Equal Split ({unassignedCount} Unassigned)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('round_robin');
              setError('');
              setSuccess('');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
              activeTab === 'round_robin'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            <Settings size={13} />
            <span>Round-Robin Pool Settings</span>
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {loadingSettings ? (
          <div className="py-10 text-center text-xs text-gray-600">
            <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Loading recruiter pool...</p>
          </div>
        ) : activeTab === 'equal_split' ? (
          <form onSubmit={handleEqualSplit} className="space-y-4">
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900">
              Splits all currently <strong>Unassigned</strong> applications equally among the
              recruiters you select below. Applications that are already assigned are{' '}
              <strong>never touched</strong>.
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700">
                  Select Recruiters ({selectedSplitIds.length} selected)
                </label>
                <div className="flex items-center gap-2 text-[0.8125rem]">
                  <button
                    type="button"
                    onClick={() => setSelectedSplitIds(recruiters.map((r) => r.id))}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSplitIds([])}
                    className="text-gray-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {recruiters.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-600 border border-dashed border-gray-200 rounded-xl">
                  No active recruiters found. Assign the Recruiter role on the Hiring Team page first.
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
                  {recruiters.map((rec) => {
                    const checked = selectedSplitIds.includes(rec.id);
                    return (
                      <label
                        key={rec.id}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 text-xs cursor-pointer hover:bg-gray-50 ${
                          checked ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleId(selectedSplitIds, setSelectedSplitIds, rec.id)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{rec.full_name}</div>
                            <div className="text-[0.8125rem] text-gray-600 truncate">
                              {(rec.role_names || []).join(', ')}
                            </div>
                          </div>
                        </div>
                        <span className="text-[0.8125rem] font-semibold text-gray-600 shrink-0">
                          {rec.pending_count ?? 0} pending
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Active pipeline only (exclude Hired &amp; Rejected)</span>
            </label>

            {splitResult && splitResult.breakdown && splitResult.breakdown.length > 0 && (
              <div className="p-3 bg-slate-50 border border-gray-200 rounded-xl space-y-1.5 text-xs">
                <div className="font-bold text-gray-700 text-[0.8125rem] uppercase tracking-wider">
                  Distribution Breakdown
                </div>
                {splitResult.breakdown.map((b) => (
                  <div key={b.recruiter_id} className="flex items-center justify-between">
                    <span className="text-gray-700">{b.recruiter_name}</span>
                    <span className="font-bold text-blue-700">+{b.assigned_count}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary text-xs py-2 px-3">
                Close
              </button>
              <button
                type="submit"
                disabled={distributing || selectedSplitIds.length === 0}
                className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
              >
                {distributing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Shuffle size={14} />
                )}
                <span>Distribute Unassigned</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-gray-200 rounded-xl flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-gray-900">
                  Automatic Round-Robin Assignment
                </div>
                <div className="text-[0.8125rem] text-gray-600 mt-0.5">
                  New applications rotate automatically through the selected recruiters (A → B → C → A).
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={autoAssignEnabled}
                  onChange={(e) => setAutoAssignEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700">
                  Round-Robin Recruiter Pool ({poolIds.length} active in rotation)
                </label>
                <div className="flex items-center gap-2 text-[0.8125rem]">
                  <button
                    type="button"
                    onClick={() => setPoolIds(recruiters.map((r) => r.id))}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Include all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setPoolIds([])}
                    className="text-gray-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {recruiters.map((rec) => {
                  const inPool = poolIds.includes(rec.id);
                  return (
                    <label
                      key={rec.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 text-xs cursor-pointer hover:bg-gray-50 ${
                        inPool ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={inPool}
                          onChange={() => toggleId(poolIds, setPoolIds, rec.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{rec.full_name}</div>
                          <div className="text-[0.8125rem] text-gray-600 truncate">
                            {(rec.role_names || []).join(', ')}
                          </div>
                        </div>
                      </div>
                      {inPool && (
                        <span className="px-2 py-0.5 rounded-full text-[0.8125rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          In Rotation
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-[0.8125rem] text-gray-600">
                If auto-assign is OFF or the pool is empty, new applications land in the Unassigned pool.
              </p>
            </div>

            <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary text-xs py-2 px-3">
                Close
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="btn btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
              >
                {savingSettings ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span>Save Pool Settings</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
