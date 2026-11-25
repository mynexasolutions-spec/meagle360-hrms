import { useEffect, useState } from 'react';
import { Mail, Search, Users } from 'lucide-react';
import { findColleagues, getMyTeam } from '../api/employees';
import useUrlFilters from '../utils/useUrlFilters';
import './MyTeam.css';

const STATUS = {
  present: { label: 'Present', badge: 'badge-active' },
  on_leave: { label: 'On Leave', badge: 'badge-pending' },
  not_in: { label: 'Not clocked in', badge: 'team-badge-neutral' },
};

const initials = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function PersonCard({ person }) {
  const status = STATUS[person.status];
  return (
    <div className="glass-card team-card">
      {person.photo_url
        ? <img src={person.photo_url} alt="" className="team-avatar" />
        : <div className="team-avatar" aria-hidden="true">{initials(person.full_name)}</div>}
      <div className="team-info">
        <div className="team-name">
          <strong>{person.full_name}</strong>
          {status && <span className={`badge ${status.badge}`}>{status.label}</span>}
        </div>
        <div className="team-muted">
          {[person.designation, person.department_name].filter(Boolean).join(' · ') || 'No department'}
        </div>
        {person.email && (
          <a className="team-email" href={`mailto:${person.email}`}><Mail size={13} /> {person.email}</a>
        )}
      </div>
    </div>
  );
}

function Group({ title, people }) {
  if (people.length === 0) return null;
  return (
    <section className="team-group">
      <h2>{title} <span className="team-muted">({people.length})</span></h2>
      <div className="team-grid">{people.map((p) => <PersonCard key={p.id} person={p} />)}</div>
    </section>
  );
}

// How many of the team are in. Status is empty on a holiday or weekly off.
function Today({ people }) {
  const count = (status) => people.filter((p) => p.status === status).length;
  return (
    <section className="team-group">
      <h2>Today</h2>
      <div className="glass-card team-today">
        {people.every((p) => !p.status)
          ? <p className="team-muted">Day off</p>
          : Object.entries(STATUS).map(([key, { label, badge }]) => (
            <div key={key}>
              <span className={`badge ${badge}`}>{label}</span>
              <strong>{count(key)}</strong>
            </div>
          ))}
      </div>
    </section>
  );
}

export default function MyTeam() {
  const [filters, setFilters] = useUrlFilters({ q: '' });
  // Typed text stays local; ?q= only carries a search in from the top bar.
  const [text, setText] = useState(filters.q);
  const [found, setFound] = useState(null); // { q, people } or { q, failed }
  const [team, setTeam] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    getMyTeam().then((r) => setTeam(r.data)).catch(() => setFailed(true));
  };
  useEffect(load, []);
  useEffect(() => { if (filters.q) setText(filters.q); }, [filters.q]);

  const q = text.trim();
  const searching = q.length >= 2;
  useEffect(() => {
    if (!searching) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      findColleagues(q)
        .then((r) => { if (!stale) setFound({ q, people: r.data }); })
        .catch(() => { if (!stale) setFound({ q, failed: true }); });
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [q, searching]);

  const results = found?.q === q ? found : null;
  const empty = team && !team.manager && team.peers.length === 0 && team.reports.length === 0;

  return (
    <div className="animate-fade-in team-page">
      <div className="page-header team-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="team-page-icon"><Users size={22} /></div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>My Team</h1>
            <p style={{ color: '#334155', fontSize: '0.95rem', fontWeight: 500, margin: '2px 0 0 0' }}>
              The people you work with, and who is in today
            </p>
          </div>
        </div>
        <div className="team-search">
          <Search size={18} aria-hidden="true" />
          <input
            className="input-field" type="search" maxLength={80}
            placeholder="Find a colleague by name or department..."
            aria-label="Find a colleague by name or department"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (filters.q) setFilters({ q: '' });
            }}
          />
        </div>
      </div>

      {searching ? (
        <>
          {!results && <p className="team-muted" role="status">Searching...</p>}
          {results?.failed && <p className="team-muted" role="alert">Search failed. Please try again.</p>}
          {results?.people?.length === 0 && <p className="team-muted" role="status">No colleague found.</p>}
          {results?.people && <Group title="Colleagues" people={results.people} />}
          {results?.people?.length === 20 && <p className="team-muted">Showing the first 20. Type more to narrow it down.</p>}
        </>
      ) : (
        <>
          {failed && (
            <div className="glass-card team-empty" role="alert">
              <p>Could not load your team.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
            </div>
          )}
          {!team && !failed && <div className="glass-card team-empty">Loading...</div>}
          {empty && (
            <div className="glass-card team-empty">
              No manager or team is set for you yet. Please ask HR, or search for a colleague above.
            </div>
          )}
          {team && !empty && (
            <div className="team-layout">
              <div>
                <Group title="My Manager" people={team.manager ? [team.manager] : []} />
                <Today people={[...(team.manager ? [team.manager] : []), ...team.peers, ...team.reports]} />
              </div>
              {team.peers.length + team.reports.length > 0 && (
                <div>
                  <Group title="Teammates" people={team.peers} />
                  <Group title="Reporting to Me" people={team.reports} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
