import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { rowClick } from '../../utils/rowClick';
import { usePopup } from '../../context/PopupContext';
import {
  adjustParticipantScore, applyPayrollRevision, approvePayrollRevision, closeCycle, createAppraisal,
  createSlab, deleteAppraisal, deleteSlab, finalizeCycle, getAppraisal, getAppraisals,
  getPayrollRevisions, getPmsConfig, getSlabs, rejectPayrollRevision, releaseCycle, updatePmsConfig,
} from '../../api/pms';
import { FormModal, errorText, score, shiftMonth } from './shared';

const STATUS = {
  review: 'Checking scores',
  finalized: 'Finalized',
  released: 'Results shared',
  payroll_approved: 'Results shared',
  closed: 'Closed',
};

// The single next step for each stage of an appraisal.
const NEXT = {
  review: {
    label: 'Finalize scores', call: finalizeCycle,
    confirm: 'This locks all scores and the months in it, and creates salary hike suggestions. It cannot be undone.',
  },
  finalized: {
    label: 'Share results', call: releaseCycle,
    confirm: 'Employees will be able to see their appraisal score.',
  },
  released: { label: 'Close appraisal', call: closeCycle, confirm: 'Close this appraisal?' },
  payroll_approved: { label: 'Close appraisal', call: closeCycle, confirm: 'Close this appraisal?' },
};

const money = (v) => (v == null ? '-' : `₹${Number(v).toLocaleString('en-IN')}`);

function NewAppraisal({ current, first, onClose, onCreated }) {
  // Default to finished months; the running month is not reviewed yet.
  const last = first && first < current ? shiftMonth(current, -1) : current;
  const start = shiftMonth(last, -11);
  const [form, setForm] = useState({
    from_month: first && first > start ? first : start, to_month: last, min_months: 6,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <FormModal
      title="Start yearly appraisal" saveLabel="Start" onClose={onClose}
      onSave={async () => {
        const res = await createAppraisal({ ...form, min_months: Number(form.min_months) });
        await onCreated(res.data.id);
      }}
    >
      <p className="pms-muted">Each person&apos;s score is the average of their reviewed months.</p>
      <div className="pms-two">
        <div className="input-group">
          <label className="input-label" htmlFor="ap-from">From</label>
          <input id="ap-from" type="month" className="input-field" required max={current}
            placeholder="YYYY-MM" pattern="\d{4}-\d{2}" value={form.from_month} onChange={set('from_month')} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="ap-to">To</label>
          <input id="ap-to" type="month" className="input-field" required max={current}
            placeholder="YYYY-MM" pattern="\d{4}-\d{2}" value={form.to_month} onChange={set('to_month')} />
        </div>
      </div>
      <div className="input-group">
        <label className="input-label" htmlFor="ap-min">Reviewed months needed for a hike</label>
        <input id="ap-min" type="number" className="input-field" min="1" max="12" required
          value={form.min_months} onChange={set('min_months')} />
      </div>
    </FormModal>
  );
}

function AdjustModal({ person, cycleId, onClose, reload }) {
  const [value, setValue] = useState(person.score ?? '');
  const [reason, setReason] = useState(person.adjustment_reason || '');
  return (
    <FormModal
      title={`Change score: ${person.employee_name}`} onClose={onClose}
      onSave={async () => {
        await adjustParticipantScore(cycleId, person.employee_id, {
          adjusted_score: Number(value), reason: reason.trim(),
        });
        await reload();
      }}
    >
      <div className="input-group">
        <label className="input-label" htmlFor="adj-score">Score (0 to 5)</label>
        <input id="adj-score" type="number" min="0" max="5" step="0.01" required className="input-field"
          value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="input-group">
        <label className="input-label" htmlFor="adj-reason">Reason</label>
        <textarea id="adj-reason" required maxLength={1000} rows={2} className="input-field"
          value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FormModal>
  );
}

function HikeModal({ rev, onClose, reload }) {
  const [pct, setPct] = useState(rev.suggested_hike_percent);
  const [date, setDate] = useState(rev.effective_date || '');
  const [reason, setReason] = useState('');
  const needsReason = !rev.eligible || Number(pct) !== Number(rev.suggested_hike_percent);
  return (
    <FormModal
      title={`Approve hike: ${rev.employee_name}`} saveLabel="Approve" onClose={onClose}
      onSave={async () => {
        await approvePayrollRevision(rev.id, {
          approved_hike_percent: Number(pct), effective_date: date || null,
          override_reason: reason.trim() || null,
        });
        await reload();
      }}
    >
      {!rev.eligible && <p className="pms-muted">Not eligible: {rev.ineligible_reason}</p>}
      <div className="pms-two">
        <div className="input-group">
          <label className="input-label" htmlFor="hike-pct">Hike %</label>
          <input id="hike-pct" type="number" min="0" max="100" step="0.01" required className="input-field"
            value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="hike-date">Effective from</label>
          <input id="hike-date" type="date" required className="input-field"
            value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {needsReason && (
        <div className="input-group">
          <label className="input-label" htmlFor="hike-reason">Reason</label>
          <input id="hike-reason" required maxLength={1000} className="input-field"
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
    </FormModal>
  );
}

function Hikes({ cycleId }) {
  const { showConfirm, showPrompt } = usePopup();
  const [rows, setRows] = useState([]);
  const [approving, setApproving] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setRows((await getPayrollRevisions(cycleId)).data);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load salary hikes'));
    }
  }, [cycleId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err, 'That did not work, please try again'));
    }
  };
  const apply = async (r) => {
    const ok = await showConfirm({
      title: 'Apply hike', type: 'warning', confirmText: 'Apply',
      message: `Apply ${r.approved_hike_percent}% for ${r.employee_name} from ${r.effective_date}? This changes their salary.`,
    });
    if (ok) act(() => applyPayrollRevision(r.id));
  };
  const reject = async (r) => {
    const reason = await showPrompt({ title: 'Reject hike', message: `Reason for rejecting ${r.employee_name}'s hike` });
    if (reason) act(() => rejectPayrollRevision(r.id, reason));
  };

  return (
    <div className="glass-card">
      <h2>Salary hikes</h2>
      {error && <div className="pms-alert" role="alert">{error}</div>}
      {rows.map((r) => (
        <div key={r.id} className="pms-line">
          <div>
            <strong>{r.employee_name}</strong>
            <div className="pms-muted">
              {r.eligible && r.current_basic_pay == null && 'No salary on record yet'}
              {r.eligible && r.current_basic_pay != null
                ? `${money(r.current_basic_pay)} to ${money(r.new_basic_pay)} basic`
                : !r.eligible && r.ineligible_reason}
            </div>
          </div>
          <div className="pms-actions">
            <strong>{Number(r.approved_hike_percent ?? r.suggested_hike_percent)}%</strong>
            <span className="badge badge-info">{r.status}</span>
            {r.status === 'suggested' && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => reject(r)}>Reject</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setApproving(r)}>Approve</button>
              </>
            )}
            {r.status === 'approved' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => apply(r)}>Apply</button>
            )}
          </div>
        </div>
      ))}
      {approving && <HikeModal rev={approving} onClose={() => setApproving(null)} reload={load} />}
    </div>
  );
}

function Appraisal({ id, onBack }) {
  const { showConfirm } = usePopup();
  const [data, setData] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData((await getAppraisal(id)).data);
    } catch (err) {
      setError(errorText(err, 'Could not load the appraisal'));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="glass-card pms-empty">{error || 'Loading...'}</div>;
  const next = NEXT[data.status];
  const editable = data.status === 'review';

  const confirmThen = async (opts, fn) => {
    if (!(await showConfirm({ type: 'warning', ...opts }))) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, 'That did not work, please try again'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="glass-card pms-now">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>Back</button>
          <h2>{data.name}</h2>
          <span className="badge badge-info">{STATUS[data.status]}</span>
        </div>
        <div className="pms-actions">
          {editable && (
            <button
              type="button" className="btn btn-ghost" disabled={busy}
              onClick={() => confirmThen(
                { title: 'Delete appraisal', message: 'Monthly scores are kept. Delete this appraisal?', confirmText: 'Delete' },
                async () => { await deleteAppraisal(id); onBack(); },
              )}
            >
              Delete
            </button>
          )}
          {next && (
            <button
              type="button" className="btn btn-primary" disabled={busy}
              onClick={() => confirmThen(
                { title: next.label, message: next.confirm, confirmText: next.label },
                async () => { await next.call(id); await load(); },
              )}
            >
              {next.label}
            </button>
          )}
        </div>
      </div>
      {error && <div className="pms-alert" role="alert">{error}</div>}
      <div className="pms-cols pms-even">
        <div className="glass-card">
          <h2>Scores</h2>
          {data.people.map((p) => (
            <div key={p.employee_id} className="pms-line">
              <div>
                <strong>{p.employee_name}</strong>
                <div className="pms-muted">
                  {p.months_reviewed} month{p.months_reviewed === 1 ? '' : 's'} reviewed
                  {p.months_reviewed < data.min_months && ` (needs ${data.min_months} for a hike)`}
                  {p.adjusted_score != null && ` · changed from ${score(p.average)}: ${p.adjustment_reason}`}
                </div>
              </div>
              <div className="pms-actions">
                <span><strong>{score(p.score)}</strong> {p.label}</span>
                {editable && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjust(p)}>Change</button>
                )}
              </div>
            </div>
          ))}
        </div>
        {!editable && <Hikes cycleId={id} />}
      </div>
      {adjust && <AdjustModal person={adjust} cycleId={id} onClose={() => setAdjust(null)} reload={load} />}
    </>
  );
}

function Settings({ onSaved }) {
  const { showConfirm } = usePopup();
  const [weight, setWeight] = useState(null);
  const [reviewDays, setReviewDays] = useState({ opens: '', due: '' });
  const [slabs, setSlabs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [slab, setSlab] = useState({ label: '', min_score: '', max_score: '', hike_percent: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([getPmsConfig(), getSlabs()]);
      const g = Number(c.data.weight_goals);
      const r = Number(c.data.weight_competency);
      setWeight(g + r > 0 ? Math.round((g / (g + r)) * 100) : 60);
      setReviewDays({ opens: c.data.review_opens_days, due: c.data.review_due_day });
      setSlabs(s.data);
    } catch (err) {
      setMsg(errorText(err, 'Could not load settings'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, done) => {
    try {
      await fn();
      await load();
      setMsg(done);
    } catch (err) {
      setMsg(errorText(err, 'Could not save'));
    }
  };
  const remove = async (s) => {
    const ok = await showConfirm({
      title: 'Delete hike rule', message: `Delete "${s.label}"?`, type: 'warning', confirmText: 'Delete',
    });
    if (ok) act(() => deleteSlab(s.id), 'Hike rule deleted');
  };
  const set = (k) => (e) => setSlab({ ...slab, [k]: e.target.value });

  return (
    <div className="glass-card">
      <h2>Settings</h2>
      {msg && <div className="pms-alert" role="status">{msg}</div>}
      {weight != null && (
        <div className="input-group">
          <label className="input-label" htmlFor="set-weight">
            Monthly score: goals {weight}%, manager rating {100 - weight}%
          </label>
          <div className="pms-actions">
            <input id="set-weight" type="range" min="0" max="100" step="5" style={{ flex: 1 }}
              value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
            <button
              type="button" className="btn btn-secondary btn-sm"
              onClick={() => act(() => updatePmsConfig({
                weight_goals: weight, weight_competency: 100 - weight,
                weight_discipline: 0, weight_growth: 0,
              }), 'Saved. It applies from the next month.')}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {weight != null && (
        <form
          className="input-group"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await updatePmsConfig({
                review_opens_days: Number(reviewDays.opens), review_due_day: Number(reviewDays.due),
              });
              await onSaved();
            }, 'Review dates saved.');
          }}
        >
          <div className="pms-two">
            <div>
              <label className="input-label" htmlFor="set-opens">Reviews open on the last (days)</label>
              <input id="set-opens" type="number" min="1" max="31" step="1" required className="input-field"
                value={reviewDays.opens}
                onChange={(e) => setReviewDays({ ...reviewDays, opens: e.target.value })} />
            </div>
            <div>
              <label className="input-label" htmlFor="set-due">Due by (day of next month)</label>
              <input id="set-due" type="number" min="1" max="28" step="1" required className="input-field"
                value={reviewDays.due}
                onChange={(e) => setReviewDays({ ...reviewDays, due: e.target.value })} />
            </div>
          </div>
          <div className="pms-form-actions">
            <span className="pms-muted">31 days means open all month.</span>
            <button type="submit" className="btn btn-secondary btn-sm">Save dates</button>
          </div>
        </form>
      )}
      <div className="pms-card-head">
        <h3>Hike rules</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add rule
        </button>
      </div>
      {slabs.map((s) => (
        <div key={s.id} className="pms-line">
          <span>{s.label} <span className="pms-muted">score {Number(s.min_score)} to {Number(s.max_score)}</span></span>
          <div className="pms-actions">
            <strong>{Number(s.hike_percent)}% hike</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(s)}>Delete</button>
          </div>
        </div>
      ))}
      {adding && (
        <FormModal
          title="Add hike rule" onClose={() => setAdding(false)}
          onSave={async () => {
            await createSlab({
              label: slab.label.trim(), min_score: Number(slab.min_score),
              max_score: Number(slab.max_score), hike_percent: Number(slab.hike_percent),
            });
            setSlab({ label: '', min_score: '', max_score: '', hike_percent: '' });
            await load();
          }}
        >
          <div className="input-group">
            <label className="input-label" htmlFor="slab-label">Name</label>
            <input id="slab-label" className="input-field" required maxLength={100} value={slab.label} onChange={set('label')} />
          </div>
          <div className="pms-two">
            <div className="input-group">
              <label className="input-label" htmlFor="slab-min">Score from</label>
              <input id="slab-min" className="input-field" type="number" min="0" max="5" step="0.01" required value={slab.min_score} onChange={set('min_score')} />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="slab-max">Score to</label>
              <input id="slab-max" className="input-field" type="number" min="0.01" max="5" step="0.01" required value={slab.max_score} onChange={set('max_score')} />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="slab-pct">Hike %</label>
            <input id="slab-pct" className="input-field" type="number" min="0" max="100" step="0.01" required value={slab.hike_percent} onChange={set('hike_percent')} />
          </div>
        </FormModal>
      )}
    </div>
  );
}

export default function ManagePms({ current, first, onSettingsSaved }) {
  const [list, setList] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setList((await getAppraisals()).data);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load appraisals'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (openId) return <Appraisal id={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <>
      <div className="pms-cols pms-even">
        <div className="glass-card">
          <div className="pms-card-head">
            <h2>Yearly appraisals</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Start appraisal
            </button>
          </div>
          {error && <div className="pms-alert" role="alert">{error}</div>}
          {list.length === 0 && !error && (
            <p className="pms-muted">
              Monthly reviews run on their own. Start an appraisal once a year to decide salary hikes.
            </p>
          )}
          {list.map((a) => (
            <div key={a.id} {...rowClick(() => setOpenId(a.id), 'pms-line')}>
              <span>{a.name}</span>
              <div className="pms-actions">
                <span className="badge badge-info">{STATUS[a.status]}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(a.id)}>Open</button>
              </div>
            </div>
          ))}
        </div>
        <Settings onSaved={onSettingsSaved} />
      </div>
      {creating && (
        <NewAppraisal
          current={current} first={first} onClose={() => setCreating(false)}
          onCreated={async (id) => { await load(); setOpenId(id); }}
        />
      )}
    </>
  );
}
