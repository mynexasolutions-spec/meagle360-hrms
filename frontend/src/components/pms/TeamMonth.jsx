import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  addMonthlyGoal, deleteMonthlyGoal, getTeamMonth, recordMonthlyProgress, reviewMonth,
} from '../../api/pms';
import Modal from '../Modal';
import { rowClick } from '../../utils/rowClick';
import { usePopup } from '../../context/PopupContext';
import { GoalModal, GoalRow, ProgressModal, RATINGS, dayLabel, errorText, monthLabel, score } from './shared';

function summary(team) {
  const todo = team.people.filter((p) => p.can_review && !p.reviewed && !p.locked).length;
  if (team.people.length === 0) return 'No one to review this month.';
  if (team.upcoming) return `Starts on ${dayLabel(team.starts_on)}. You can set goals for your team now.`;
  if (todo === 0) return 'All reviews are done.';
  const people = `${todo} review${todo === 1 ? '' : 's'}`;
  if (!team.review_open) return `${people} will open on ${dayLabel(team.review_opens_on)}.`;
  return team.overdue
    ? `${people} overdue (was due ${dayLabel(team.review_due_on)}).`
    : `${people} to give by ${dayLabel(team.review_due_on)}.`;
}

function ReviewModal({ person, team, onClose, reload, onNext }) {
  const { showConfirm } = usePopup();
  const [rating, setRating] = useState(person.manager_score);
  const [comment, setComment] = useState(person.manager_comment || '');
  const [goalOpen, setGoalOpen] = useState(false);
  const [progressGoal, setProgressGoal] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = person.can_review && !person.locked;
  const goalsOpen = canEdit && !person.reviewed;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await reviewMonth({
        month: team.month, employee_id: person.employee_id, score: rating, comment: comment.trim(),
      });
      await reload();
      onNext();
    } catch (err) {
      setError(errorText(err, 'Could not save the review'));
      setBusy(false);
    }
  };

  const removeGoal = async (g) => {
    const ok = await showConfirm({
      title: 'Delete goal', message: `Delete "${g.title}" and its progress?`,
      type: 'warning', confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteMonthlyGoal(g.id);
      await reload();
    } catch (err) {
      setError(errorText(err, 'Could not delete the goal'));
    }
  };

  // Child modals replace this one rather than stacking on top of it.
  if (goalOpen) {
    return (
      <GoalModal
        onClose={() => setGoalOpen(false)}
        onSave={async (form) => {
          await addMonthlyGoal({ ...form, month: team.month, employee_id: person.employee_id });
          await reload();
        }}
      />
    );
  }
  if (progressGoal) {
    return (
      <ProgressModal
        goal={progressGoal} onClose={() => setProgressGoal(null)}
        onSave={async (form) => { await recordMonthlyProgress(progressGoal.id, form); await reload(); }}
      />
    );
  }

  return (
    <Modal title={`${person.employee_name}, ${monthLabel(team.month)}`} onClose={onClose} maxWidth={560} compact>
      <form className="pms-review" onSubmit={submit}>
        <div className="pms-card-head">
          <h3>Goals</h3>
          {goalsOpen && person.goals.length < 5 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGoalOpen(true)}>
              <Plus size={14} /> Add goal
            </button>
          )}
        </div>
        {person.goals.length === 0 && <p className="pms-muted">No goals this month.</p>}
        {person.goals.map((g) => (
          <GoalRow key={g.id} goal={g}>
            {goalsOpen && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeGoal(g)}>Delete</button>
                {!team.upcoming && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProgressGoal(g)}>
                    Update progress
                  </button>
                )}
              </>
            )}
          </GoalRow>
        ))}

        <h3>Their note</h3>
        {person.self_note
          ? <p className="pms-quote">{person.self_note}</p>
          : <p className="pms-muted">No note written.</p>}

        <h3>Your rating</h3>
        {!team.review_open && (
          <p className="pms-muted">Reviews open on {dayLabel(team.review_opens_on)}.</p>
        )}
        {person.locked && (
          <p className="pms-muted">This month is part of a finalized appraisal and cannot be changed.</p>
        )}
        {goalsOpen && team.review_open && person.goals.some((g) => g.achievement_pct == null) && (
          <p className="pms-muted">Goals with no update count as 0%. Update them first if work was done.</p>
        )}
        {(team.review_open || person.reviewed) && (
          <>
            <div className="pms-rating" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button" role="radio" aria-checked={rating === n}
                  aria-label={`${n}, ${RATINGS[n]}`} disabled={!canEdit}
                  className={rating === n ? 'active' : ''} onClick={() => setRating(n)}
                >
                  {n}
                </button>
              ))}
              <span className="pms-muted">{rating ? RATINGS[rating] : 'Pick a rating'}</span>
            </div>
            <label className="input-label" htmlFor="review-comment">Comment</label>
            <textarea
              id="review-comment" className="input-field" rows={3} maxLength={2000} disabled={!canEdit}
              placeholder="One thing that went well, one thing to improve"
              value={comment} onChange={(e) => setComment(e.target.value)}
            />
          </>
        )}
        {error && <div className="pms-alert" role="alert">{error}</div>}
        <div className="pms-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          {canEdit && team.review_open && (
            <button type="submit" className="btn btn-primary" disabled={!rating || busy}>
              {busy ? 'Saving...' : person.reviewed ? 'Update review' : 'Submit review'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default function TeamMonth({ month, isAdmin, hasTeam }) {
  const [everyone, setEveryone] = useState(isAdmin && !hasTeam);
  const [team, setTeam] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getTeamMonth(month, everyone);
    setTeam(res.data);
    return res.data;
  }, [month, everyone]);

  useEffect(() => {
    let stale = false;
    setTeam(null);
    getTeamMonth(month, everyone)
      .then((r) => { if (!stale) { setTeam(r.data); setError(''); } })
      .catch((err) => { if (!stale) setError(errorText(err, 'Could not load your team')); });
    return () => { stale = true; };
  }, [month, everyone]);

  if (error) return <div className="pms-alert" role="alert">{error}</div>;
  if (!team) return <div className="glass-card pms-empty">Loading...</div>;

  const person = team.people.find((p) => p.employee_id === openId);
  const pending = (p) => p.can_review && !p.reviewed && !p.locked;
  const next = team.people.find((p) => pending(p) && p.employee_id !== openId);

  return (
    <>
      <div className="glass-card pms-now">
        <p>{summary(team)}</p>
        {isAdmin && hasTeam && (
          <label className="pms-check">
            <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
            Show everyone
          </label>
        )}
      </div>
      {team.people.length > 0 && (
        <div className="pms-people">
          {team.people.map((p) => (
            <div key={p.employee_id} {...rowClick(() => setOpenId(p.employee_id), 'glass-card pms-person')}>
              <div>
                <strong>{p.employee_name}</strong>
                <div className="pms-muted">
                  {p.goals.length} goal{p.goals.length === 1 ? '' : 's'}
                  {p.self_note ? ' · note added' : ''}
                  {everyone ? ` · ${p.manager_name ? `manager: ${p.manager_name}` : 'no manager'}` : ''}
                </div>
              </div>
              <div className="pms-actions">
                {p.reviewed && <strong>{score(p.score)}</strong>}
                <button
                  type="button" onClick={() => setOpenId(p.employee_id)}
                  className={`btn btn-sm ${pending(p) && team.review_open ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {pending(p) && team.review_open ? 'Review' : 'View'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {person && (
        <ReviewModal
          key={person.employee_id} person={person} team={team} reload={load}
          onClose={() => setOpenId(null)}
          onNext={() => setOpenId(person.reviewed || !next ? null : next.employee_id)}
        />
      )}
    </>
  );
}
