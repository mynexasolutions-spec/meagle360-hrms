import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Crown, MoreVertical, UserRoundX } from 'lucide-react';
import PopMenu from './PopMenu';
import ScrollPane from './ScrollPane';
import { VacancyCard } from './VacancyCard';
import { bySeniority, NO_MANAGER, ROLES } from './orgDraft';

const SHOWN = 3; // people shown before "+N more"

const ACCENTS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626'];
const accentFor = (name) => ACCENTS[[...String(name)].reduce((n, c) => n + c.charCodeAt(0), 0) % ACCENTS.length];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function RoleBadge({ role }) {
  const { label, color, bg } = ROLES[role];
  return <span className={`oe-badge oe-badge-${role}`} style={{ color, background: bg }}>{label}</span>;
}

export function Avatar({ person, role }) {
  const [brokenUrl, setBrokenUrl] = useState(null);
  if (person.photo_url && person.photo_url !== brokenUrl) {
    return <img className="oe-avatar" src={person.photo_url} alt="" onError={() => setBrokenUrl(person.photo_url)} />;
  }
  const initials = person.full_name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="oe-avatar" style={{ background: ROLES[role].color }} aria-hidden="true">{initials}</span>;
}

// Menu items that change who leads whom. A lead is whoever has people reporting to them.
function teamActions(person, ctx) {
  const hasTeam = (ctx.reports.get(person.id) || []).length > 0;
  return hasTeam
    ? [
      { label: 'Edit team…', run: () => ctx.openTeam(person.id, 'edit') },
      { label: 'Demote to member…', run: () => ctx.openTeam(person.id, 'demote') },
    ]
    : [{ label: 'Make team lead…', run: () => ctx.openTeam(person.id, 'edit') }];
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
  const designation = person.designation_name || '';
  const department = ctx.deptNames.get(person.department_id) || '';
  const sub = (showDepartment ? [designation, department] : [designation]).filter(Boolean).join(' · ');
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
          {sub && <div className="oe-sub">{sub}</div>}
        </div>
      </div>
      <PopMenu className="oe-dots" label={`Actions for ${person.full_name}`} icon={<MoreVertical size={16} />}>
        {(close) => (
          <>
            <div className="oe-menu-info"><strong>{person.full_name}</strong>{[designation, department].filter(Boolean).join(' · ') || 'No designation'}</div>
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

function TreeNode({ person, depth, ctx, vacanciesBy }) {
  const id = `team:${person.id}`;
  const drag = useDraggable({ id, data: { personId: person.id } });
  const drop = useDroppable({ id });
  const role = ctx.roles.get(person.id);
  const kids = [...(ctx.reports.get(person.id) || [])].sort(bySeniority(ctx.roles));
  const vacancies = vacanciesBy.get(person.id) || [];
  const expandable = kids.length > 0 || vacancies.length > 0;
  const open = expandable && ctx.isOpen(person.id, depth);
  const isActive = ctx.activeId === person.id;
  const sub = [person.designation_name, ctx.deptNames.get(person.department_id)].filter(Boolean).join(' · ');
  const classes = ['oe-node'];
  if (ctx.draft[person.id]) classes.push('changed');
  if (ctx.matchId === person.id) classes.push('match-current');

  return (
    <div className="oe-branch">
      <div
        ref={drop.setNodeRef} data-item
        className={`${classes.join(' ')}${isActive ? ' dragging' : dropClass(ctx, { id: person.id, isOver: drop.isOver })}`}
      >
        {expandable ? (
          <button
            type="button" className="oe-chevron" aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${person.full_name}'s team`}
            onClick={() => ctx.toggleNode(person.id, depth)}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : <span className="oe-chevron" aria-hidden="true" />}
        <div ref={drag.setNodeRef} {...drag.listeners} className="oe-person oe-grab" title={sub}>
          <Avatar person={person} role={role} />
          <div className="oe-text">
            <div className="oe-line">
              <span className="oe-name">{person.full_name}</span>
              {ctx.headDept.has(person.id) && <Crown size={13} className="oe-crown" aria-label="Department head" />}
              {role !== 'member' && <RoleBadge role={role} />}
            </div>
            {sub && <div className="oe-sub">{sub}</div>}
          </div>
        </div>
        {kids.length > 0 && (
          <span className="oe-count" title={plural(kids.length, 'direct report')}>
            {kids.length}
          </span>
        )}
        <PopMenu className="oe-dots" label={`Actions for ${person.full_name}`} icon={<MoreVertical size={16} />}>
          {(close) => (
            <>
              <div className="oe-menu-info"><strong>{person.full_name}</strong>{sub || 'No designation'}</div>
              <button type="button" onClick={() => { close(); ctx.openMove(person.id); }}>Move to…</button>
              {teamActions(person, ctx).map((a) => (
                <button key={a.label} type="button" onClick={() => { close(); a.run(); }}>{a.label}</button>
              ))}
            </>
          )}
        </PopMenu>
      </div>
      {open && (
        <div className="oe-children">
          {kids.map((k) => <TreeNode key={k.id} person={k} depth={depth + 1} ctx={ctx} vacanciesBy={vacanciesBy} />)}
          {vacancies.map((v) => <VacancyCard key={v.id} vacancy={v} onOpen={ctx.openVacancy} />)}
        </div>
      )}
    </div>
  );
}

function NoManagerZone({ people, vacancies, ctx }) {
  const drop = useDroppable({ id: `team:${NO_MANAGER}` });
  return (
    <section
      ref={drop.setNodeRef} data-item
      className={`oe-none${dropClass(ctx, { id: NO_MANAGER, isOver: drop.isOver })}`}
    >
      <h4><UserRoundX size={15} /> No manager <span className="oe-count">{people.length}</span></h4>
      {people.length > 0 || vacancies.length > 0 ? (
        <>
          {people.map((p) => <TreeNode key={p.id} person={p} depth={0} ctx={ctx} vacanciesBy={new Map()} />)}
          {vacancies.map((v) => <VacancyCard key={v.id} vacancy={v} onOpen={ctx.openVacancy} />)}
        </>
      ) : <div className="oe-hint" style={{ margin: 0 }}>Drop here to remove someone&apos;s manager.</div>}
    </section>
  );
}

// The reporting tree. Everyone with a team can fold open; drop a person on anyone to change who they report to.
export function OrgTree({ roots, loose, vacanciesBy, looseVacancies, ctx }) {
  return (
    <ScrollPane className="oe-panel" label="Organization by manager">
      {roots.map((p) => <TreeNode key={p.id} person={p} depth={0} ctx={ctx} vacanciesBy={vacanciesBy} />)}
      <NoManagerZone people={loose} vacancies={looseVacancies} ctx={ctx} />
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
    <div
      ref={drop.setNodeRef} style={{ '--accent': accentFor(name) }}
      className={`oe-column${total === 0 ? ' oe-column-empty' : ''}${dropClass(ctx, { id: `dept:${id}`, isOver: drop.isOver })}`}
    >
      <h4><span>{name}</span><span className="oe-count">{people.length}</span></h4>
      {shown.map((p) => (
        <PersonCard
          key={p.id} person={p} ctx={ctx} zone="dept" locked={isHead(p)}
          actions={[
            ...teamActions(p, ctx),
            ...(id && !ctx.draft[p.id] ? [{
              label: isHead(p) ? 'Remove department head' : 'Make department head',
              disabled: ctx.busy,
              run: () => ctx.setHead(id, p),
            }] : []),
          ]}
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
