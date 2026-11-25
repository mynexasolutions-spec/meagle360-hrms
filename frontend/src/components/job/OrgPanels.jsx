import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowLeft, Crown, MoreVertical, UserRoundX, Users } from 'lucide-react';
import PopMenu from './PopMenu';
import ScrollPane from './ScrollPane';
import { VacancyCard } from './VacancyCard';
import { bySeniority, NO_MANAGER, ROLES } from './orgDraft';

const SHOWN = 3; // people shown before "+N more"

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function RoleBadge({ role }) {
  const { label, color, bg } = ROLES[role];
  return <span className="oe-badge" style={{ color, background: bg }}>{label}</span>;
}

export function Avatar({ person, role }) {
  const [brokenUrl, setBrokenUrl] = useState(null);
  if (person.photo_url && person.photo_url !== brokenUrl) {
    return <img className="oe-avatar" src={person.photo_url} alt="" onError={() => setBrokenUrl(person.photo_url)} />;
  }
  const initials = person.full_name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="oe-avatar" style={{ background: ROLES[role].color }} aria-hidden="true">{initials}</span>;
}

function dropClass(ctx, drop) {
  if (!ctx.activeId) return '';
  if (drop.isOver) return ctx.canDrop(drop.id) ? ' oe-ok' : ' oe-no';
  return '';
}

// One person. `zone` keeps drag ids unique, since a lead shows in both panels.
// `actions` are extra menu items: { label, run, disabled }.
export function PersonCard({ person, ctx, zone, droppable, locked, showDepartment, actions = [], team = [] }) {
  const id = `${zone}:${person.id}`;
  const drag = useDraggable({ id, disabled: locked, data: { personId: person.id } });
  const drop = useDroppable({ id, disabled: !droppable });
  const role = ctx.roles.get(person.id);
  const isActive = ctx.activeId === person.id;
  const designation = person.designation_name || 'No designation';
  const department = ctx.deptNames.get(person.department_id) || 'No department';
  const sub = showDepartment ? `${designation} · ${department}` : designation;
  const opensTeam = showDepartment && role !== 'member';
  const classes = ['oe-card'];
  if (ctx.draft[person.id]) classes.push('changed');
  if (ctx.matchId === person.id) classes.push('match-current');
  if (isActive) classes.push('dragging');

  return (
    <div
      ref={drop.setNodeRef} data-item
      className={classes.join(' ') + (isActive ? '' : dropClass(ctx, { id: person.id, isOver: drop.isOver }))}
    >
      <div
        ref={drag.setNodeRef}
        {...(locked ? {} : drag.listeners)}
        className={`oe-person${locked ? '' : ' oe-grab'}`}
        title={locked ? 'Choose another department head before moving this person' : sub}
        onClick={opensTeam ? () => ctx.selectTeam(person.id) : undefined}
      >
        <Avatar person={person} role={role} />
        <div className="oe-text">
          <div className="oe-line">
            <span className="oe-name">{person.full_name}</span>
            {ctx.headDept.has(person.id) && <Crown size={13} className="oe-crown" aria-label="Department head" />}
            {role !== 'member' && <RoleBadge role={role} />}
          </div>
          <div className="oe-sub">{sub}</div>
        </div>
      </div>
      <PopMenu className="oe-dots" label={`Actions for ${person.full_name}`} icon={<MoreVertical size={16} />}>
        {(close) => (
          <>
            <div className="oe-menu-info"><strong>{person.full_name}</strong>{designation} · {department}</div>
            <button type="button" onClick={() => { close(); ctx.openMove(person.id); }}>Move to…</button>
            {opensTeam && <button type="button" onClick={() => { close(); ctx.selectTeam(person.id); }}>View team</button>}
            {actions.map((a) => (
              <button key={a.label} type="button" disabled={a.disabled} onClick={() => { close(); a.run(); }}>{a.label}</button>
            ))}
          </>
        )}
      </PopMenu>
      {team.length > 0 && (
        <button type="button" className="oe-preview" onClick={() => ctx.selectTeam(person.id)} title={`View ${person.full_name}'s team`}>
          {team.slice(0, SHOWN).map((t) => (
            <span key={t.id}>
              <span>{t.full_name}</span>
              {ctx.roles.get(t.id) !== 'member' && <em>{ROLES[ctx.roles.get(t.id)].label}</em>}
            </span>
          ))}
          {team.length > SHOWN && <b>+{team.length - SHOWN} more</b>}
        </button>
      )}
    </div>
  );
}

function TeamRow({ person, depth, ctx }) {
  const drag = useDraggable({ id: `team:${person.id}`, data: { personId: person.id } });
  const drop = useDroppable({ id: `team:${person.id}` });
  const role = ctx.roles.get(person.id);
  const selected = ctx.teamId === person.id;
  return (
    <div
      ref={drop.setNodeRef} data-item
      className={`oe-team${selected ? ' selected' : ''}${ctx.draft[person.id] ? ' changed' : ''}${
        ctx.activeId === person.id ? ' dragging' : dropClass(ctx, { id: person.id, isOver: drop.isOver })}`}
      style={{ marginLeft: Math.min(depth, 4) * 14 }}
    >
      <button
        ref={drag.setNodeRef} {...drag.listeners} type="button" className="oe-grab"
        aria-pressed={selected} onClick={() => ctx.selectTeam(person.id)}
      >
        <Avatar person={person} role={role} />
        <span className="oe-text oe-name" title={person.full_name}>{person.full_name}</span>
        <RoleBadge role={role} />
        <span className="oe-count" title="Direct reports">{(ctx.reports.get(person.id) || []).length}</span>
      </button>
    </div>
  );
}

function NoManagerRow({ count, ctx }) {
  const drop = useDroppable({ id: `team:${NO_MANAGER}` });
  const selected = ctx.teamId === NO_MANAGER;
  return (
    <div
      ref={drop.setNodeRef}
      className={`oe-team oe-none${selected ? ' selected' : ''}${dropClass(ctx, { id: NO_MANAGER, isOver: drop.isOver })}`}
    >
      <button type="button" aria-pressed={selected} onClick={() => ctx.selectTeam(NO_MANAGER)}>
        <UserRoundX size={18} />
        <span className="oe-text oe-name">No manager</span>
        <span className="oe-count">{count}</span>
      </button>
    </div>
  );
}

export function TeamList({ teams, looseCount, ctx }) {
  return (
    <ScrollPane as="nav" className="oe-teams" label="Teams" footer={<NoManagerRow count={looseCount} ctx={ctx} />}>
      <h4>Teams</h4>
      {teams.map(({ person, depth }) => <TeamRow key={person.id} person={person} depth={depth} ctx={ctx} />)}
    </ScrollPane>
  );
}

function Group({ title, people, ctx }) {
  if (!people.length) return null;
  return (
    <>
      <h4>{title} ({people.length})</h4>
      <div className="oe-grid">
        {people.map((p) => (
          <PersonCard
            key={p.id} person={p} ctx={ctx} zone="card" droppable showDepartment
            team={[...(ctx.reports.get(p.id) || [])].sort(bySeniority(ctx.roles))}
          />
        ))}
      </div>
    </>
  );
}

export function TeamPanel({ lead, people, vacancies, total, managerName, ctx }) {
  const leads = people.filter((p) => ctx.roles.get(p.id) !== 'member');
  const members = people.filter((p) => ctx.roles.get(p.id) === 'member');
  const role = lead && ctx.roles.get(lead.id);
  return (
    <ScrollPane as="section" className="oe-panel" label="Team members">
      <header className="oe-lead">
        <button type="button" className="oe-back" onClick={ctx.showList}><ArrowLeft size={15} /> Teams</button>
        {lead ? (
          <>
            <Avatar person={lead} role={role} />
            <div className="oe-text">
              <div className="oe-title">{lead.full_name}&apos;s team <RoleBadge role={role} /></div>
              <div className="oe-sub">
                {[lead.designation_name || 'No designation', ctx.deptNames.get(lead.department_id) || 'No department',
                  lead.manager_id ? `Reports to ${managerName}` : 'No manager'].join(' · ')}
              </div>
            </div>
            <div className="oe-size"><Users size={14} /> {plural(people.length, 'direct report')} · {total} in total</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ctx.openMove(lead.id)}>Move lead</button>
          </>
        ) : (
          <div className="oe-text">
            <div className="oe-title">No manager</div>
            <div className="oe-sub">These people report to nobody and lead no team. Drag each one onto a team.</div>
          </div>
        )}
      </header>
      <Group title="Leads in this team" people={leads} ctx={ctx} />
      <Group title={lead ? 'Members' : 'People'} people={members} ctx={ctx} />
      {vacancies.length > 0 && (
        <>
          <h4>Vacant positions ({vacancies.length})</h4>
          <div className="oe-grid">{vacancies.map((v) => <VacancyCard key={v.id} vacancy={v} onOpen={ctx.openVacancy} />)}</div>
        </>
      )}
      {!people.length && !vacancies.length && <p className="oe-hint">Nobody here.</p>}
    </ScrollPane>
  );
}

export function DepartmentColumn({ id, name, people, vacancies, ctx }) {
  const drop = useDroppable({ id: `dept:${id}`, disabled: !id });
  const open = ctx.openDepts.has(id);
  const isHead = (p) => !!ctx.headDept.get(p.id)?.has(id);
  const sorted = [...people].sort(bySeniority(ctx.roles, isHead));
  // Drafted people and the search match always show.
  const shown = sorted.filter((p, i) => open || i < SHOWN || ctx.draft[p.id] || ctx.matchId === p.id);
  const shownVacancies = open ? vacancies : vacancies.slice(0, Math.max(0, SHOWN - shown.length));
  const total = people.length + vacancies.length;
  const hidden = total - shown.length - shownVacancies.length;

  return (
    <div ref={drop.setNodeRef} className={`oe-column${dropClass(ctx, { id: `dept:${id}`, isOver: drop.isOver })}`}>
      <h4><span>{name}</span><span>{people.length}</span></h4>
      {shown.map((p) => (
        <PersonCard
          key={p.id} person={p} ctx={ctx} zone="dept" locked={isHead(p)}
          actions={id && !ctx.draft[p.id] ? [{
            label: isHead(p) ? 'Remove head' : 'Make head',
            disabled: ctx.busy,
            run: () => ctx.setHead(id, p),
          }] : []}
        />
      ))}
      {shownVacancies.map((v) => <VacancyCard key={v.id} vacancy={v} onOpen={ctx.openVacancy} />)}
      {id && total < SHOWN && <div className="oe-empty">Drop people here</div>}
      {(hidden > 0 || (open && total > SHOWN)) && (
        <button type="button" className="oe-expand" aria-expanded={open} onClick={() => ctx.toggleDept(id)}>
          {open ? 'Show less' : `+ ${hidden} more`}
        </button>
      )}
    </div>
  );
}
