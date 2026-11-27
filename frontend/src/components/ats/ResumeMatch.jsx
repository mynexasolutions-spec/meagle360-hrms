import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, RefreshCw, Sparkles, AlertCircle, X } from 'lucide-react';
import { getApplicationMatch, reparseApplicationResume, updateParsedOverrides } from '../../api/ats';

// Resume parsing + job-match score UI.
// The score is a suggestion for sorting/highlighting only. It never rejects anyone,
// so low scores are shown in neutral grey, not red.

const BUSY = ['pending', 'processing'];
const POLL_MS = 3000;
const POLL_LIMIT = 40; // ~2 minutes, then the backend sweeper marks it failed
const STEPS = ['Reading resume', 'Extracting skills', 'Matching with job'];

export function scoreTone(score) {
  if (score == null) return 'bg-gray-100 text-slate-700 border-gray-200';
  if (score >= 75) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

/** Small pill for the drawer header and the applicants table. */
export function MatchBadge({ match, compact = false }) {
  if (!match || !match.parse_status) return null;
  if (BUSY.includes(match.parse_status)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-[0.75rem] font-semibold animate-pulse">
        <Sparkles size={12} />
        {!compact && 'Analyzing resume…'}
      </span>
    );
  }
  if (match.parse_status !== 'done' || match.match_score == null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.75rem] font-bold ${scoreTone(match.match_score)}`}
      title="Resume match score: a suggestion for sorting only"
    >
      {Math.round(match.match_score)}%{!compact && ' match'}
    </span>
  );
}

function Chip({ children, tone }) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    miss: 'bg-white text-slate-700 border-dashed border-slate-300',
    soft: 'bg-gray-50 text-slate-700 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[0.75rem] font-medium ${tones[tone]}`}>
      {tone === 'ok' && <Check size={11} />}
      {children}
    </span>
  );
}

function Bar({ label, comp }) {
  if (!comp) return null;
  const pct = Math.round(comp.value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[0.75rem] font-medium text-slate-700">
        <span>{label}</span>
        <span>
          {pct}% <span className="text-slate-500">· weight {Math.round(comp.weight * 100)}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Step list shown while a re-scan runs. Steps advance on a timer (the backend
 *  only reports pending/processing) and the score appears when parsing is done. */
function ScanProgress({ step }) {
  return (
    <div className="space-y-2 py-2">
      {STEPS.map((label, i) => (
        <div key={label} className={`flex items-center gap-2 text-xs font-medium transition-opacity ${i <= step ? 'opacity-100' : 'opacity-40'}`}>
          {i < step ? (
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center"><Check size={10} /></span>
          ) : i === step ? (
            <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
          )}
          <span className="text-slate-700">{label}</span>
        </div>
      ))}
    </div>
  );
}

function OverrideEditor({ match, onCancel, onSave, saving }) {
  const parsedSkills = match.overrides?.skills ?? match.parsed?.skills ?? [];
  const parsedYears = match.overrides?.total_experience_years ?? match.parsed?.total_experience_years ?? '';
  const [skills, setSkills] = useState(parsedSkills.join(', '));
  const [years, setYears] = useState(parsedYears === null ? '' : String(parsedYears));

  const submit = () => {
    const list = skills.split(',').map((s) => s.trim()).filter(Boolean);
    const y = years.trim() === '' ? null : Number(years);
    onSave({ skills: list, total_experience_years: Number.isFinite(y) ? y : null });
  };

  return (
    <div className="space-y-3 p-3 rounded-lg border border-blue-200 bg-blue-50/40">
      <label className="block text-[0.75rem] font-semibold text-slate-700">
        Skills (comma separated)
        <textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={3}
          className="mt-1 w-full text-xs border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <label className="block text-[0.75rem] font-semibold text-slate-700">
        Total experience (years)
        <input
          type="number"
          min="0"
          max="60"
          step="0.5"
          value={years}
          onChange={(e) => setYears(e.target.value)}
          className="mt-1 w-32 text-xs border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={submit} className="btn btn-primary text-xs py-1.5 px-3">
          {saving ? 'Saving…' : 'Save corrections'}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="btn btn-secondary text-xs py-1.5 px-3">
          Cancel
        </button>
        {Object.keys(match.overrides || {}).length > 0 && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ skills: null, total_experience_years: null })}
            className="text-xs font-semibold text-blue-700 hover:underline ml-auto"
          >
            Reset to parsed values
          </button>
        )}
      </div>
    </div>
  );
}

/** Match card for the application detail view. */
export function MatchCard({ applicationId, match, onChange, canEdit = true }) {
  const [step, setStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const polls = useRef(0);

  const status = match?.parse_status;
  const busy = BUSY.includes(status);

  // Poll while the background job runs.
  useEffect(() => {
    if (!busy || !applicationId) return undefined;
    polls.current = 0;
    const t = setInterval(async () => {
      polls.current += 1;
      try {
        const res = await getApplicationMatch(applicationId);
        if (!BUSY.includes(res.data.parse_status) || polls.current >= POLL_LIMIT) {
          clearInterval(t);
          onChange(res.data);
        }
      } catch {
        clearInterval(t);
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [busy, applicationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step animation while a re-scan is visibly in progress.
  useEffect(() => {
    if (!scanning) return undefined;
    if (!busy) {
      setStep(STEPS.length);
      const done = setTimeout(() => setScanning(false), 600);
      return () => clearTimeout(done);
    }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [scanning, busy]);

  const rescan = async () => {
    setError('');
    setStep(0);
    setScanning(true);
    try {
      const res = await reparseApplicationResume(applicationId);
      onChange(res.data);
    } catch (err) {
      setScanning(false);
      setError(err?.response?.data?.detail || 'Could not start the re-scan.');
    }
  };

  const saveOverrides = async (data) => {
    setSaving(true);
    setError('');
    try {
      const res = await updateParsedOverrides(applicationId, data);
      onChange(res.data);
      setEditing(false);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save corrections.');
    } finally {
      setSaving(false);
    }
  };

  if (!match || !status) {
    return (
      <Shell>
        <p className="text-xs text-slate-700">This resume has not been analyzed yet.</p>
        <RescanButton onClick={rescan} label="Analyze resume" />
        {error && <ErrorLine text={error} />}
      </Shell>
    );
  }

  if (busy || scanning) {
    return (
      <Shell>
        <ScanProgress step={step} />
      </Shell>
    );
  }

  if (status === 'failed') {
    return (
      <Shell>
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{match.parse_error || 'This resume could not be analyzed.'} Please review the PDF manually.</span>
        </div>
        <RescanButton onClick={rescan} />
        {error && <ErrorLine text={error} />}
      </Shell>
    );
  }

  const comps = match.match_breakdown?.components || {};
  const skills = comps.skills;
  const exp = comps.experience;
  const parsed = match.parsed || {};
  const hasOverrides = Object.keys(match.overrides || {}).length > 0;

  return (
    <Shell
      right={
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1">
              <Pencil size={12} /> Correct
            </button>
          )}
          <button type="button" onClick={rescan} className="btn btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1" title="Re-scan resume">
            <RefreshCw size={12} /> Re-scan
          </button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex sm:flex-col items-center gap-3 sm:w-32 shrink-0">
          <div className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center ${scoreTone(match.match_score)}`}>
            <span className="text-2xl font-bold leading-none">{match.match_score != null ? Math.round(match.match_score) : '–'}</span>
            <span className="text-[0.65rem] font-semibold uppercase">match</span>
          </div>
          <p className="text-[0.7rem] text-slate-600 text-center leading-snug">
            Suggestion for sorting only{hasOverrides ? ' · includes your corrections' : ''}
          </p>
        </div>

        <div className="flex-1 space-y-4 min-w-0">
          <div className="space-y-2.5">
            <Bar label="Skills" comp={skills} />
            <Bar label="Experience" comp={exp} />
            <Bar label="Job description similarity" comp={comps.text_similarity} />
          </div>

          {skills && (
            <div className="space-y-2">
              <SkillRow title="Matched skills" items={[...skills.matched_required, ...skills.matched_preferred]} tone="ok" empty="None of the job's skills found" />
              <SkillRow title="Missing skills" items={skills.missing_required} tone="miss" empty="No required skill missing" />
              {skills.missing_preferred?.length > 0 && (
                <SkillRow title="Missing nice-to-have" items={skills.missing_preferred} tone="miss" />
              )}
              {skills.source === 'job_description' && (
                <p className="text-[0.7rem] text-slate-600">
                  This job has no required skills set, so skills were taken from its description. Add skills on the job opening for a better match.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <Fact label="Experience (resume)" value={fmtYears(exp?.candidate_years ?? parsed.total_experience_years)} />
            <Fact label="Required" value={exp ? fmtYears(exp.required_years) : 'Not set'} />
            <Fact
              label="Experience gap"
              value={exp ? (exp.gap_years > 0 ? `${exp.gap_years} yrs short` : 'Meets requirement') : '–'}
            />
            <Fact label="Highest education" value={parsed.highest_education || 'Not found'} />
            {parsed.linkedin && <Fact label="LinkedIn" value={parsed.linkedin} />}
          </div>

          {editing && (
            <OverrideEditor match={match} saving={saving} onCancel={() => setEditing(false)} onSave={saveOverrides} />
          )}
          {error && <ErrorLine text={error} />}
        </div>
      </div>
    </Shell>
  );
}

function fmtYears(v) {
  if (v == null) return 'Not found';
  return `${v} yrs`;
}

function Shell({ children, right }) {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 inline-flex items-center gap-1.5">
          <Sparkles size={14} className="text-blue-600" /> Resume Match
        </h4>
        {right}
      </div>
      {children}
    </div>
  );
}

function SkillRow({ title, items, tone, empty }) {
  return (
    <div>
      <span className="text-[0.75rem] font-semibold text-slate-700 block mb-1">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {items?.length ? items.map((s) => <Chip key={s} tone={tone}>{s}</Chip>) : <span className="text-[0.75rem] text-slate-500">{empty}</span>}
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <span className="text-[0.7rem] text-slate-600 block font-semibold uppercase">{label}</span>
      <span className="font-medium text-gray-900 block truncate" title={String(value)}>{value}</span>
    </div>
  );
}

function RescanButton({ onClick, label = 'Re-scan' }) {
  return (
    <button type="button" onClick={onClick} className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
      <RefreshCw size={13} /> {label}
    </button>
  );
}

function ErrorLine({ text }) {
  return (
    <p className="text-xs text-red-700 inline-flex items-center gap-1">
      <X size={12} /> {text}
    </p>
  );
}
