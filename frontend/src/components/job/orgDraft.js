// Pure rules for the organization draft. `people` is the drafted list; nothing here talks to the server.

export const byId = (people) => new Map(people.map((p) => [p.id, p]));

// Is `id` somewhere below `managerId`?
export function isBelow(people, id, managerId) {
  const map = byId(people);
  const seen = new Set();
  let current = map.get(id)?.manager_id;
  while (current && !seen.has(current)) {
    if (current === managerId) return true;
    seen.add(current);
    current = map.get(current)?.manager_id;
  }
  return false;
}

export function canReport(people, id, managerId, withTeam) {
  if (id === managerId) return false;
  if (byId(people).get(id)?.manager_id === managerId) return false;
  return !withTeam || !managerId || !isBelow(people, managerId, id);
}

// Returns the new places, as { id: { manager_id, department_id } }, only for people who move.
export function moveManager(people, id, managerId, withTeam) {
  const map = byId(people);
  const person = map.get(id);
  const moves = { [id]: { manager_id: managerId, department_id: person.department_id } };
  if (!withTeam) {
    // The team stays behind with the old manager, if that person is still here.
    const stay = map.has(person.manager_id) ? person.manager_id : null;
    for (const p of people) {
      if (p.manager_id === id) moves[p.id] = { manager_id: stay, department_id: p.department_id };
    }
  }
  return moves;
}

export function applyDraft(base, draft) {
  return base.map((p) => (draft[p.id] ? { ...p, ...draft[p.id] } : p));
}

// Drops places that match the saved ones, people who left, and targets that no longer exist.
export function cleanDraft(base, departments, draft) {
  const map = byId(base);
  const depts = new Set(departments.map((d) => d.id));
  return Object.fromEntries(Object.entries(draft).flatMap(([id, to]) => {
    const p = map.get(id);
    if (!p) return [];
    const manager_id = to.manager_id === null || map.has(to.manager_id) ? to.manager_id : p.manager_id;
    const department_id = depts.has(to.department_id) ? to.department_id : p.department_id;
    return manager_id === p.manager_id && department_id === p.department_id ? [] : [[id, { manager_id, department_id }]];
  }));
}

export const MAX_REPORTS = 10;

// Things an admin should look at. `departments` carry head_id; people are active employees only.
export function findIssues(people, departments) {
  const map = byId(people);
  const count = new Map();
  for (const p of people) count.set(p.manager_id, (count.get(p.manager_id) || 0) + 1);
  const issues = [
    { label: 'No manager and no team', people: people.filter((p) => !p.manager_id && !count.get(p.id)) },
    { label: 'Manager is no longer active', people: people.filter((p) => p.manager_id && !map.has(p.manager_id)) },
    { label: 'Reporting in a loop', people: people.filter((p) => isBelow(people, p.id, p.id)) },
    {
      label: `More than ${MAX_REPORTS} direct reports`,
      people: people.filter((p) => count.get(p.id) > MAX_REPORTS).map((p) => ({ ...p, note: count.get(p.id) })),
    },
    { label: 'No department', people: people.filter((p) => !p.department_id) },
    { label: 'No designation', people: people.filter((p) => !p.designation_name) },
    { label: 'Department without a head', departments: departments.filter((d) => !d.head_id) },
    { label: 'Department head is no longer active', departments: departments.filter((d) => d.head_id && !map.has(d.head_id)) },
  ];
  return issues.filter((i) => (i.people || i.departments).length);
}

export const NO_MANAGER = 'no-manager';

// What someone does in the chart, worked out from who reports to them. Not a permission.
export const ROLES = {
  leadership: { label: 'Leadership', color: '#1d4ed8', bg: '#dbeafe' },
  manager: { label: 'Manager', color: '#047857', bg: '#d1fae5' },
  lead: { label: 'Team Lead', color: '#6d28d9', bg: '#ede9fe' },
  member: { label: 'Member', color: '#64748b', bg: '#f1f5f9' },
};

// hasTeam: someone reports to them. leadsLeads: one of those people has a team too.
export function roleFor({ hasTeam, leadsLeads, hasManager }) {
  if (!hasTeam) return 'member';
  if (!hasManager) return 'leadership';
  return leadsLeads ? 'manager' : 'lead';
}

export function findRoles(people) {
  const hasTeam = new Set(people.map((p) => p.manager_id));
  const leadsLeads = new Set(people.filter((p) => hasTeam.has(p.id)).map((p) => p.manager_id));
  return new Map(people.map((p) => [p.id, roleFor({
    hasTeam: hasTeam.has(p.id), leadsLeads: leadsLeads.has(p.id), hasManager: !!p.manager_id,
  })]));
}

// Everyone below this person, however deep.
export const teamTotal = (people, id) => people.filter((p) => p.id !== id && isBelow(people, p.id, id)).length;

// Sort: department heads first (if asked), then by role, then by name.
export const bySeniority = (roles, isHead = () => false) => (a, b) => {
  const order = Object.keys(ROLES);
  return isHead(b) - isHead(a)
    || order.indexOf(roles.get(a.id)) - order.indexOf(roles.get(b.id))
    || a.full_name.localeCompare(b.full_name);
};
