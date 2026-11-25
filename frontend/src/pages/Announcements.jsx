import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { getAnnouncements } from '../api/announcements';
import PageTitle from '../components/PageTitle';
import { dateLabel } from '../components/policies/shared';
import './Company.css';

const PAGE = 50;

export default function Announcements() {
  const [items, setItems] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    setFailed(false);
    getAnnouncements(limit)
      .then((r) => { if (!stale) setItems(r.data); })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [limit, attempt]);

  const q = search.trim().toLowerCase();
  const shown = (items || []).filter((a) => !q || `${a.title}\n${a.body}`.toLowerCase().includes(q));

  return (
    <div className="animate-fade-in company-page">
      <PageTitle icon={Megaphone} title="Announcements" subtitle="News and notices from your company">
        <input
          className="input-field" type="search" placeholder="Search announcements..." aria-label="Search announcements"
          style={{ width: 300, maxWidth: '100%' }} value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </PageTitle>

      {failed && (
        <div className="glass-card policy-empty" role="alert">
          <p>Could not load the announcements.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt(attempt + 1)}>Try again</button>
        </div>
      )}
      {!items && !failed && <div className="glass-card policy-empty">Loading...</div>}
      {items && shown.length === 0 && (
        <div className="glass-card policy-empty">{q ? 'No announcement found.' : 'No announcements yet.'}</div>
      )}
      <div className="notice-list">
        {shown.map((a) => (
          <article key={a.id} className="glass-card notice-card">
            <h2>{a.title}</h2>
            <p className="policy-muted">
              {dateLabel(a.created_at)}{a.created_by_name ? ` · ${a.created_by_name}` : ''}
            </p>
            <p className="notice-body">{a.body}</p>
          </article>
        ))}
      </div>
      {items?.length === limit && (
        <button type="button" className="btn btn-secondary" onClick={() => setLimit(limit + PAGE)}>Show older</button>
      )}
    </div>
  );
}
