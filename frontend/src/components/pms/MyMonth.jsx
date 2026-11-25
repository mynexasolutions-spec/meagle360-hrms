import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { usePopup } from '../../context/PopupContext';
import {
  addMonthlyGoal, copyMonthlyGoals, deleteMonthlyGoal, getMyAppraisals,
  recordMonthlyProgress, saveMonthlyNote, updateMonthlyGoal,
} from '../../api/pms';
import { GoalModal, GoalRow, ProgressModal, dayLabel, errorText, monthLabel, score, RATINGS } from './shared';

/** The one line that tells the employee what to do now. */
function nextStep(data) {
  const { me } = data;
  if (me.reviewed) {
    return { status: 'Reviewed', text: `Your score is ${score(me.score)} out of 5${me.label ? `, ${me.label}` : ''}.` };
  }
  if (me.locked) return { status: 'Closed', text: 'This month was not reviewed and is not counted.' };
  if (data.upcoming) {
    return {
      status: 'Upcoming',
      text: `Starts on ${dayLabel(data.starts_on)}. You can set your goals now.`,
    };
  }
  if (me.goals.length === 0) {
    return { status: 'Goals', text: 'Add 2 to 4 goals for this month.' };
  }
  if (data.review_open) {
    return me.self_note
      ? { status: 'In progress', text: 'All done. Waiting for your manager to review.' }
      : { status: 'In progress', text: 'Update your progress and write a short note for your manager.' };
  }
  return {
    status: 'In progress',
    text: `Keep your progress updated. Reviews open on ${dayLabel(data.review_opens_on)}.`,
  };
}

export default function MyMonth({ data, reload }) {
  const { showConfirm } = usePopup();
  const [goalModal, setGoalModal] = useState(null); // null | 'new' | goal
  const [progressGoal, setProgressGoal] = useState(null);
  const [note, setNote] = useState(data.me?.self_note || '');
  const [noteSaved, setNoteSaved] = useState(false);
  const [error, setError] = useState('');
  const [appraisals, setAppraisals] = useState([]);

  useEffect(() => {
    getMyAppraisals().then((r) => setAppraisals(r.data)).catch(() => {});
  }, []);

  const run = async (fn, fallback) => {
    setError('');
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    }
  };

  const { me } = data;
  if (!me) {
    return (
      <div className="glass-card pms-empty">
        There is no review for you in {monthLabel(data.month)}.
      </div>
    );
  }

  const open = !me.reviewed && !me.locked;
  const step = nextStep(data);
  const isCurrent = data.month === data.current_month;

  const removeGoal = async (g) => {
    const ok = await showConfirm({
      title: 'Delete goal', message: `Delete "${g.title}" and its progress?`,
      type: 'warning', confirmText: 'Delete',
    });
    if (ok) run(() => deleteMonthlyGoal(g.id), 'Could not delete the goal');
  };

  const saveNote = async () => {
    setNoteSaved(await run(() => saveMonthlyNote(data.month, note), 'Could not save your note'));
  };

  return (
    <>
      <div className="glass-card pms-now">
        <div>
          <span className={`badge ${me.reviewed ? 'badge-active' : 'badge-info'}`}>{step.status}</span>
          {isCurrent && open && (
            <span className="pms-muted"> {data.days_left} day{data.days_left === 1 ? '' : 's'} left</span>
          )}
          <p>{step.text}</p>
        </div>
      </div>

      {error && <div className="pms-alert" role="alert">{error}</div>}

      <div className="pms-cols">
        <div className="pms-col">
        {me.reviewed && (
          <div className="glass-card">
            <h2>Manager review</h2>
            <p><strong>{me.manager_score} out of 5</strong>, {RATINGS[me.manager_score]}</p>
            {me.manager_comment && <p className="pms-quote">{me.manager_comment}</p>}
            <p className="pms-muted">
              {me.goals_score == null
                ? 'Score is your manager\'s rating, as there were no goals this month.'
                : `Score ${score(me.score)} = goals ${score(me.goals_score)} and manager rating ${score(me.manager_score)} combined.`}
            </p>
          </div>
        )}

        <div className="glass-card">
          <div className="pms-card-head">
            <h2>Goals</h2>
            {open && me.goals.length < 5 && (
              <div className="pms-actions">
                {data.can_copy_goals && (
                  <button
                    type="button" className="btn btn-ghost btn-sm"
                    onClick={() => run(() => copyMonthlyGoals(data.month), 'Could not copy goals')}
                  >
                    Copy last goals
                  </button>
                )}
                <button type="button" className={`btn btn-sm ${me.goals.length ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setGoalModal('new')}>
                  <Plus size={14} /> Add goal
                </button>
              </div>
            )}
          </div>
          {me.goals.length === 0 && <p className="pms-muted">No goals yet.</p>}
          {me.goals.map((g) => (
            <GoalRow key={g.id} goal={g}>
              {open && (
                <>
                  {!g.set_by_manager && (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeGoal(g)}>Delete</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGoalModal(g)}>Edit</button>
                    </>
                  )}
                  {!data.upcoming && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProgressGoal(g)}>
                      Update progress
                    </button>
                  )}
                </>
              )}
            </GoalRow>
          ))}
        </div>
        </div>
        <div className="pms-col pms-side">
        {((open && !data.upcoming) || me.self_note) && (
          <div className="glass-card">
            <h2><label htmlFor="pms-note">Note for your manager</label></h2>
            {open ? (
              <>
                <textarea
                  id="pms-note" className="input-field" rows={3} maxLength={2000}
                  placeholder="What went well? What was difficult?"
                  value={note} onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }}
                />
                <div className="pms-form-actions">
                  {noteSaved && <span className="pms-muted" role="status">Saved</span>}
                  <button
                    type="button" className="btn btn-secondary btn-sm" onClick={saveNote}
                    disabled={note.trim() === (me.self_note || '')}
                  >
                    Save note
                  </button>
                </div>
              </>
            ) : <p className="pms-quote">{me.self_note}</p>}
          </div>
        )}

        {data.history.length > 0 && (
          <div className="glass-card">
            <div className="pms-card-head">
              <h2>{data.month.slice(0, 4)} so far</h2>
              <strong>Average {score(data.average)}</strong>
            </div>
            <div className="pms-history">
              {data.history.map((h) => (
                <div key={h.month} className={h.month === data.month ? 'active' : ''}>
                  <span>{monthLabel(h.month, 'short')}</span>
                  <strong>{score(h.score)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {appraisals.length > 0 && (
          <div className="glass-card">
            <h2>Yearly appraisals</h2>
            {appraisals.map((a) => (
              <div key={a.id} className="pms-line">
                <span>{a.name}</span>
                <span><strong>{score(a.score)}</strong> {a.label}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {goalModal && (
        <GoalModal
          goal={goalModal === 'new' ? null : goalModal} onClose={() => setGoalModal(null)}
          onSave={async (form) => {
            if (goalModal === 'new') await addMonthlyGoal({ ...form, month: data.month });
            else await updateMonthlyGoal(goalModal.id, form);
            await reload();
          }}
        />
      )}
      {progressGoal && (
        <ProgressModal
          goal={progressGoal} onClose={() => setProgressGoal(null)}
          onSave={async (form) => { await recordMonthlyProgress(progressGoal.id, form); await reload(); }}
        />
      )}
    </>
  );
}
