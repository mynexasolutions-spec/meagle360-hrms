import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core';
import { Search, SlidersHorizontal, Undo2, UserPlus, X } from 'lucide-react';
import Modal from '../Modal';
import { getOrganization, publishOrganization, updateDepartment } from '../../api/employees';
import { useAuth } from '../../context/AuthContext';
import { usePopup } from '../../context/PopupContext';
import errorText from '../../utils/errorText';
import OrgHealth from './OrgHealth';
import { Avatar, DepartmentColumn, OrgTree } from './OrgPanels';
import PopMenu from './PopMenu';
import ScrollPane from './ScrollPane';
import { ManageVacancyModal, NewVacancyModal } from './VacancyCard';
import {
  applyDraft, bySeniority, byId, canReport, cleanDraft, findIssues, findRoles, isBelow, moveManager, NO_MANAGER, teamTotal,
} from './orgDraft';
import './OrgEditor.css';

// Drag ids are zone:id, because a lead shows in both panels.
const targetOf = (over) => {
  if (!over) return null;
  const id = String(over.id);
  return id.startsWith('dept:') ? id : id.slice(id.indexOf(':') + 1);
};

function readSaved(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function MoveModal({ person, people, departments, headDept, onClose, onMove }) {
  const [managerId, setManagerId] = useState(person.manager_id || '');
  const [departmentId, setDepartmentId] = useState(person.department_id || '');
  const [withTeam, setWithTeam] = useState(true);
  const locked = headDept.get(person.id)?.has(person.department_id);
  const managers = people.filter((p) =>
    p.id === person.manager_id || canReport(people, person.id, p.id, withTeam));
  const listed = managers.some((p) => p.id === person.manager_id);

  return (
    <Modal sheet title={`Move ${person.full_name}`} onClose={onClose} maxWidth={460}>
      <form onSubmit={(e) => { e.preventDefault(); onMove(managerId || null, departmentId || null, withTeam); }}>
        <div className="input-group">
          <label className="input-label" htmlFor="move-manager">Manager</label>
          <select id="move-manager" className="input-field" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">No manager (top level)</option>
            {person.manager_id && !listed && <option value={person.manager_id}>Current manager (no longer active)</option>}
            {managers.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.employee_code})</option>)}
          </select>
        </div>
        {people.some((p) => p.manager_id === person.id) && (
          <label className="oe-check" style={{ marginBottom: 14 }}>
            <input
              type="checkbox" checked={withTeam}
              onChange={(e) => { setWithTeam(e.target.checked); setManagerId(person.manager_id || ''); }}
            />
            Move their team along
          </label>
        )}
        <div className="input-group">
          <label className="input-label" htmlFor="move-dept">Department</label>
          <select
            id="move-dept" className="input-field" value={departmentId} disabled={locked}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {!person.department_id && <option value="">No department</option>}
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {locked && <p className="oe-hint">Heads this department. Choose another head first.</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Add to draft</button>
        </div>
      </form>
    </Modal>
  );
}

// Pick who reports to `person`. Anyone above them is left out, since that would make a loop.
function TeamModal({ person, people, deptNames, onClose, onSave }) {
  const current = people.filter((p) => p.manager_id === person.id).map((p) => p.id);
  const [picked, setPicked] = useState(new Set(current));
  const [query, setQuery] = useState('');
  const [sameDept, setSameDept] = useState(true);
  const t = query.trim().toLowerCase();
  const deptName = deptNames.get(person.department_id);
  const options = people
    .filter((p) => p.id !== person.id && !isBelow(people, person.id, p.id))
    .filter((p) => current.includes(p.id) || picked.has(p.id) || !sameDept || p.department_id === person.department_id)
    .filter((p) => !t || [p.full_name, p.employee_code, p.designation_name].some((v) => v?.toLowerCase().includes(t)))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const toggle = (id) => setPicked((s) => {
    const next = new Set(s);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const added = [...picked].filter((id) => !current.includes(id)).length;
  const removed = current.filter((id) => !picked.has(id)).length;
  const title = current.length ? `Edit ${person.full_name}'s team` : `Make ${person.full_name} a team lead`;

  return (
    <Modal sheet title={title} onClose={onClose} maxWidth={480}>
      <p className="oe-hint">
        {current.length
          ? 'Tick who reports to them. People you untick move to their manager.'
          : 'Choose who will report to them. They become a team lead once someone does.'}
      </p>
      <div className="oe-search" style={{ marginBottom: 8 }}>
        <Search size={14} />
        <input value={query} placeholder="Search people" aria-label="Search people" style={{ flex: 1, width: 0 }} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {deptName && (
        <label className="oe-check" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={sameDept} onChange={(e) => setSameDept(e.target.checked)} /> Only {deptName}
        </label>
      )}
      <div className="oe-picklist">
        {options.map((p) => (
          <label key={p.id} className="oe-pick">
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <span className="oe-text">
              <span className="oe-name">{p.full_name}</span>
              <span className="oe-sub">{[p.designation_name, deptNames.get(p.department_id)].filter(Boolean).join(' · ')}</span>
            </span>
          </label>
        ))}
        {!options.length && <div className="oe-hint" style={{ padding: 10, margin: 0 }}>Nobody to show.</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!added && !removed} onClick={() => onSave(picked)}>
          Add to draft{added || removed ? ` (${[added && `+${added}`, removed && `-${removed}`].filter(Boolean).join(' ')})` : ''}
        </button>
      </div>
    </Modal>
  );
}

// Moves the whole team of `person` to someone else, so they are left as a plain member.
function DemoteModal({ person, people, headOf, onClose, onSave }) {
  const team = people.filter((p) => p.manager_id === person.id);
  const [target, setTarget] = useState(person.manager_id || '');
  const options = people.filter((p) => p.id !== person.id && !isBelow(people, p.id, person.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const known = options.some((p) => p.id === target);

  return (
    <Modal sheet title={`Demote ${person.full_name}`} onClose={onClose} maxWidth={460}>
      <p className="oe-hint">
        {person.full_name} leads {team.length} {team.length === 1 ? 'person' : 'people'}. Move them to someone else, and {person.full_name} becomes a member.
      </p>
      {headOf.length > 0 && (
        <p className="oe-hint">
          {person.full_name} stays head of {headOf.join(', ')}. This only changes their team; remove the head role separately if needed.
        </p>
      )}
      <div className="input-group">
        <label className="input-label" htmlFor="demote-to">New manager for {team.length === 1 ? 'this person' : 'the team'}</label>
        <select id="demote-to" className="input-field" value={known ? target : ''} onChange={(e) => setTarget(e.target.value)}>
          <option value="">No manager (top level)</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.id === person.manager_id ? ' (their manager)' : ''}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={() => onSave(known ? target : '')}>Add to draft</button>
      </div>
    </Modal>
  );
}

export default function OrgEditor({ onClose }) {
  const { user } = useAuth();
  const { showConfirm, showToast } = usePopup();
  const storageKey = `org-draft:${user?.employee_id}`;
  const [data, setData] = useState(null);
  const [saved, setDraft] = useState(() => readSaved(storageKey));
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('board');
  const [withTeam, setWithTeam] = useState(true);
  const [openDepts, setOpenDepts] = useState(new Set());
  const [treeOpen, setTreeOpen] = useState(null); // null: the default, two levels open
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const scrollRef = useRef(null);
  const editorRef = useRef(null);
  const loaded = !!data;
  const [moving, setMoving] = useState(null);
  const [teamEdit, setTeamEdit] = useState(null); // { id, mode: 'edit' | 'demote' }
  const [reviewing, setReviewing] = useState(false);
  const [addingVacancy, setAddingVacancy] = useState(false);
  const [vacancy, setVacancy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Mouse drags at once; touch needs a short hold so the page can still scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const load = async () => setData((await getOrganization()).data);

  useEffect(() => {
    load().catch((e) => setError(errorText(e, 'Could not load the organization.')));
  }, []);

  const draft = useMemo(
    () => (data ? cleanDraft(data.employees, data.departments, saved) : saved), [data, saved]);
  const count = Object.keys(draft).length;

  // Survives moving to another page in this tab.
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
  }, [storageKey, draft]);

  useEffect(() => {
    if (!count) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [count]);

  useEffect(() => {
    if (query.trim()) scrollRef.current?.querySelector('.match-current')?.scrollIntoView({ block: 'center' });
  }, [query, matchIndex, view]);

  // Fill exactly what is left of the screen; on very short screens let the page scroll instead.
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return undefined;
    el.closest('.app-content')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    const fit = () => {
      // The page's own bottom padding already leaves room for the mobile bottom bar.
      const page = el.closest('.app-content');
      const below = (page ? parseFloat(getComputedStyle(page).paddingBottom) : 24) + parseFloat(getComputedStyle(el).marginBottom);
      const height = window.innerHeight - el.getBoundingClientRect().top - below;
      el.classList.toggle('oe-flow', height < 330);
      el.style.setProperty('--oe-height', `${height}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [loaded]);

  if (!data) return <div className="section-card">{error || 'Loading...'}</div>;

  const people = applyDraft(data.employees, draft);
  const map = byId(people);
  const term = query.trim().toLowerCase();
  const findPeople = (text) => {
    const t = text.trim().toLowerCase();
    return t ? people.filter((p) =>
      [p.full_name, p.employee_code, p.designation_name].some((value) => value?.toLowerCase().includes(t))) : [];
  };
  const matches = findPeople(query);
  const matchAt = Math.min(matchIndex, Math.max(matches.length - 1, 0));
  const matchId = matches[matchAt]?.id;
  const deptNames = new Map(data.departments.map((d) => [d.id, d.name]));
  // Someone may head several departments, including one they do not sit in.
  const headDept = new Map();
  for (const d of data.departments) {
    if (d.head_id) headDept.set(d.head_id, (headDept.get(d.head_id) || new Set()).add(d.id));
  }
  const reports = new Map();
  const roots = [];
  for (const p of people) {
    if (map.has(p.manager_id) && !isBelow(people, p.id, p.id)) reports.set(p.manager_id, [...(reports.get(p.manager_id) || []), p]);
    // Loop members have no top; show them as roots so they can be fixed.
    if (!map.has(p.manager_id) || isBelow(people, p.id, p.id)) roots.push(p);
  }

  const canDrop = (target) => {
    const person = map.get(activeId);
    if (!person) return false;
    if (target.startsWith('dept:')) return target !== `dept:${person.department_id}`;
    return canReport(people, activeId, target === NO_MANAGER ? null : target, withTeam);
  };

  const stage = (moves) => {
    setHistory((h) => [...h, draft]);
    setDraft({ ...draft, ...moves });
    setError('');
  };

  const onDragEnd = ({ over }) => {
    setActiveId(null);
    setOverId(null);
    const target = targetOf(over);
    if (!target || !canDrop(target)) return;
    if (target.startsWith('dept:')) {
      stage({ [activeId]: { manager_id: map.get(activeId).manager_id, department_id: target.slice(5) } });
    } else {
      stage(moveManager(people, activeId, target === NO_MANAGER ? null : target, withTeam));
    }
  };

  const onMove = (managerId, departmentId, team) => {
    const person = map.get(moving);
    const moves = managerId === person.manager_id ? {} : moveManager(people, moving, managerId, team);
    moves[moving] = { manager_id: managerId, department_id: departmentId };
    if (managerId !== person.manager_id || departmentId !== person.department_id) stage(moves);
    setMoving(null);
  };

  const saveTeam = (picked) => {
    const boss = map.get(teamEdit.id);
    const moves = {};
    for (const p of people) {
      const has = p.manager_id === boss.id;
      if (picked.has(p.id) && !has) moves[p.id] = { manager_id: boss.id, department_id: p.department_id };
      if (!picked.has(p.id) && has) moves[p.id] = { manager_id: boss.manager_id || null, department_id: p.department_id };
    }
    if (Object.keys(moves).length) stage(moves);
    setTeamEdit(null);
  };

  const saveDemote = (target) => {
    const moves = {};
    for (const p of people) {
      if (p.manager_id === teamEdit.id) moves[p.id] = { manager_id: target || null, department_id: p.department_id };
    }
    stage(moves);
    setTeamEdit(null);
  };

  const undo = () => {
    setDraft(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };

  const discard = async () => {
    const ok = await showConfirm({
      title: 'Discard draft', message: `Discard all ${count} pending changes?`, type: 'warning', confirmText: 'Discard',
    });
    if (!ok) return;
    setDraft({});
    setHistory([]);
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    const base = byId(data.employees);
    try {
      await publishOrganization(Object.entries(draft).map(([id, to]) => ({
        employee_id: id, ...to,
        expected_manager_id: base.get(id).manager_id,
        expected_department_id: base.get(id).department_id,
      })));
      sessionStorage.removeItem(storageKey);
      showToast({ type: 'success', message: `${count} change${count === 1 ? '' : 's'} published.` });
      onClose();
    } catch (e) {
      if (e.response?.status === 409) {
        await load().catch(() => {});
        setHistory([]);
        setError(`${errorText(e, 'The organization was changed by someone else')}. The latest data is loaded; check your changes again.`);
      } else {
        setError(errorText(e, 'Could not publish. Nothing was changed.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const roles = findRoles(people);
  const sortedRoots = roots.slice().sort(bySeniority(roles));
  // People who lead nobody and report to nobody sit in the "No manager" zone; the other roots head the tree.
  const loose = sortedRoots.filter((p) => roles.get(p.id) === 'member' && !data.vacancies.some((v) => v.manager_id === p.id));
  const topLeads = sortedRoots.filter((p) => !loose.includes(p));
  const vacanciesBy = new Map();
  const looseVacancies = [];
  for (const v of data.vacancies) {
    if (map.has(v.manager_id)) vacanciesBy.set(v.manager_id, [...(vacanciesBy.get(v.manager_id) || []), v]);
    else looseVacancies.push(v);
  }

  // Everyone who can fold open, with how deep they sit.
  const foldable = [];
  const walk = (list, depth) => {
    for (const p of list) {
      if (reports.has(p.id) || vacanciesBy.has(p.id)) foldable.push({ id: p.id, depth });
      walk(reports.get(p.id) || [], depth + 1);
    }
  };
  walk(topLeads, 0);
  const openSet = treeOpen || new Set(foldable.filter((f) => f.depth < 2).map((f) => f.id));
  // Whoever the search found is always revealed.
  const revealed = new Set();
  if (term) {
    for (let up = map.get(matchId)?.manager_id; up && !revealed.has(up); up = map.get(up)?.manager_id) revealed.add(up);
  }

  const showMatch = (list, index) => setMatchIndex(index);
  const search = (text) => {
    setQuery(text);
    setMatchIndex(0);
  };

  const setHead = async (departmentId, person) => {
    const department = data.departments.find((d) => d.id === departmentId);
    const removing = department.head_id === person.id;
    const oldHead = map.get(department.head_id);
    const replaces = !removing && oldHead ? `${oldHead.full_name} will no longer be head. ` : '';
    const ok = await showConfirm({
      title: 'Department head',
      message: removing
        ? `Remove ${person.full_name} as head of ${department.name}? ${department.name} will have no head. This happens right away.`
        : `Make ${person.full_name} head of ${department.name}? ${replaces}This happens right away.`,
      type: 'warning',
      confirmText: removing ? 'Remove head' : 'Make head',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await updateDepartment(departmentId, { head_id: removing ? null : person.id });
      await load();
    } catch (e) {
      setError(errorText(e, 'Could not change the department head.'));
    } finally {
      setBusy(false);
    }
  };

  const vacancySaved = async () => {
    setAddingVacancy(false);
    setVacancy(null);
    await load().catch((e) => setError(errorText(e, 'Saved, but could not reload. Refresh the page.')));
  };

  const ctx = {
    busy, setHead, openVacancy: setVacancy,
    draft, activeId, canDrop, reports, deptNames, headDept,
    openMove: setMoving,
    openTeam: (id, mode) => setTeamEdit({ id, mode }),
    matchId, roles, people,
    isOpen: (id) => openSet.has(id) || revealed.has(id),
    toggleNode: (id) => setTreeOpen((() => {
      const next = new Set(openSet);
      if (!next.delete(id)) next.add(id);
      return next;
    })()),
    openDepts,
    toggleDept: (id) => setOpenDepts((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    }),
  };

  const columns = [
    ...data.departments.map((d) => ({ id: d.id, name: d.name, people: people.filter((p) => p.department_id === d.id), vacancies: data.vacancies.filter((v) => v.department_id === d.id) })),
    { id: null, name: 'No department', people: people.filter((p) => !deptNames.has(p.department_id)), vacancies: data.vacancies.filter((v) => !deptNames.has(v.department_id)) },
  ].filter((c) => c.id || c.people.length || c.vacancies.length);

  const originals = byId(data.employees);
  // While dragging, says in words what letting go would do.
  const dragHint = () => {
    const person = map.get(activeId);
    if (!overId) return view === 'chart' ? 'Drop on a team or person' : 'Drop on a department';
    if (overId === activeId) return 'Same person';
    if (overId.startsWith('dept:')) {
      const name = deptNames.get(overId.slice(5));
      return canDrop(overId) ? `Will move to ${name}` : `Already in ${name}`;
    }
    const boss = overId === NO_MANAGER ? 'nobody' : map.get(overId)?.full_name;
    const current = person.manager_id || NO_MANAGER;
    if (overId === current) return `Already reports to ${boss}`;
    if (!canDrop(overId)) return `Cannot: ${boss} is in ${person.full_name}'s team`;
    const size = withTeam ? teamTotal(people, activeId) : 0;
    return `Will report to ${boss}${size ? `, with ${size} below` : ''}`;
  };
  const managerName = (id) => (id ? map.get(id)?.full_name || 'Former employee' : 'No manager');

  const commit = (
    <>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!history.length} onClick={undo}><Undo2 size={14} /> Undo</button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!count} onClick={discard}>Discard</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={!count} onClick={() => { setError(''); setReviewing(true); }}>Review ({count})</button>
    </>
  );

  return (
    <div className="oe-editor" ref={editorRef}>
      <div className="oe-bar">
        <div className="oe-tabs" role="group" aria-label="Group by">
          <span className="oe-tabs-label">Group by</span>
          <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>Department</button>
          <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Manager</button>
        </div>
        <div className="oe-search">
          <Search size={14} />
          <input
            value={query} placeholder="Find a person" aria-label="Find a person"
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length) showMatch(matches, (matchAt + 1) % matches.length);
              if (e.key === 'Escape') search('');
            }}
          />
          {term && <span>{matches.length ? `${matchAt + 1}/${matches.length}` : 'None'}</span>}
        </div>
        <OrgHealth issues={findIssues(people, data.departments)} onPerson={setMoving} />
        <span className="oe-spacer" />
        <button
          type="button" className="btn btn-secondary btn-sm"
          onClick={() => {
            if (view === 'board') setOpenDepts(openDepts.size ? new Set() : new Set(columns.map((c) => c.id)));
            else setTreeOpen(openSet.size ? new Set() : new Set(foldable.map((f) => f.id)));
          }}
        >
          {(view === 'board' ? openDepts.size : openSet.size) ? 'Collapse all' : 'Expand all'}
        </button>
        <PopMenu className="btn btn-secondary btn-sm" label="Options" icon={<><SlidersHorizontal size={14} /> Options</>}>
          {(close) => (
            <>
              <label className="oe-check">
                <input type="checkbox" checked={withTeam} onChange={(e) => setWithTeam(e.target.checked)} /> Move team along
              </label>
              <div className="oe-menu-info">Off: when a lead moves, the team stays with the old manager.</div>
              <button type="button" onClick={() => { close(); setAddingVacancy(true); }}><UserPlus size={14} /> Add vacant position</button>
            </>
          )}
        </PopMenu>
        {(count > 0 || history.length > 0) && <div className="oe-commit oe-commit-top">{commit}</div>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}><X size={14} /> Exit</button>
      </div>

      {error && !reviewing && <div role="alert" className="oe-error">{error}</div>}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setActiveId(active.data.current.personId)}
        onDragOver={({ over }) => setOverId(targetOf(over))}
        onDragEnd={onDragEnd}
        onDragCancel={() => { setActiveId(null); setOverId(null); }}
      >
        <div className="oe-body" ref={scrollRef}>
          {view === 'chart' ? (
            <OrgTree roots={topLeads} loose={loose} vacanciesBy={vacanciesBy} looseVacancies={looseVacancies} ctx={ctx} />
          ) : (
            <ScrollPane className="oe-panel" innerClassName="oe-columns" label="Departments">
              {columns.map((c) => <DepartmentColumn key={c.id || 'none'} {...c} ctx={ctx} />)}
            </ScrollPane>
          )}
        </div>
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {activeId && map.has(activeId) && (
              <div className="oe-card oe-overlay">
                <div className="oe-person">
                  <Avatar person={map.get(activeId)} role={roles.get(activeId)} />
                  <div className="oe-text">
                    <div className="oe-name">{map.get(activeId).full_name}</div>
                    <div className="oe-sub">{dragHint()}</div>
                  </div>
                </div>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {(count > 0 || history.length > 0) && <div className="oe-commit oe-commit-bottom">{commit}</div>}

      {moving && map.has(moving) && (
        <MoveModal
          person={map.get(moving)} people={people} departments={data.departments} headDept={headDept}
          onClose={() => setMoving(null)} onMove={onMove}
        />
      )}

      {teamEdit && map.has(teamEdit.id) && (teamEdit.mode === 'demote' ? (
        <DemoteModal person={map.get(teamEdit.id)} people={people} headOf={[...(headDept.get(teamEdit.id) || [])].map((d) => deptNames.get(d)).filter(Boolean)} onClose={() => setTeamEdit(null)} onSave={saveDemote} />
      ) : (
        <TeamModal person={map.get(teamEdit.id)} people={people} deptNames={deptNames} onClose={() => setTeamEdit(null)} onSave={saveTeam} />
      ))}

      {addingVacancy && (
        <NewVacancyModal people={people} departments={data.departments} onClose={() => setAddingVacancy(false)} onSaved={vacancySaved} />
      )}
      {vacancy && (
        <ManageVacancyModal vacancy={vacancy} jobs={data.jobs} onClose={() => setVacancy(null)} onSaved={vacancySaved} />
      )}

      {reviewing && (
        <Modal sheet title={`Review ${count} change${count === 1 ? '' : 's'}`} onClose={() => !busy && setReviewing(false)} maxWidth={560}>
          <ul className="oe-changes">
            {Object.entries(draft).map(([id, to]) => {
              const from = originals.get(id);
              return (
                <li key={id}>
                  <strong>{from.full_name}</strong>
                  {from.manager_id !== to.manager_id && (
                    <div>Manager: {managerName(from.manager_id)} → <strong>{managerName(to.manager_id)}</strong></div>
                  )}
                  {from.department_id !== to.department_id && (
                    <div>Department: {deptNames.get(from.department_id) || 'None'} → <strong>{deptNames.get(to.department_id)}</strong></div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="oe-hint">Takes effect today. Everyone listed is notified. Roles and permissions do not change.</p>
          {error && <div role="alert" className="oe-error">{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReviewing(false)}>Back</button>
            <button type="button" className="btn btn-primary" disabled={busy || !count} onClick={publish}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
