import { useEffect, useState } from 'react';
import { CalendarHeart } from 'lucide-react';
import { getHolidays } from '../api/attendance';
import PageTitle from '../components/PageTitle';
import './Company.css';

const parse = (iso) => new Date(`${iso}T00:00:00`);

export default function Holidays() {
  const now = new Date();
  const [holidays, setHolidays] = useState(null);
  const [failed, setFailed] = useState(false);
  const [year, setYear] = useState(now.getFullYear());

  const load = () => {
    setFailed(false);
    getHolidays().then((r) => setHolidays(r.data)).catch(() => setFailed(true));
  };
  useEffect(load, []);

  const years = [...new Set([
    now.getFullYear(), ...(holidays || []).map((h) => parse(h.holiday_date).getFullYear()),
  ])].sort();
  const today = now.toLocaleDateString('en-CA');
  const list = (holidays || [])
    .filter((h) => parse(h.holiday_date).getFullYear() === year)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  const nextId = list.find((h) => h.holiday_date >= today)?.id;

  return (
    <div className="animate-fade-in company-page">
      <PageTitle icon={CalendarHeart} title="Holidays" subtitle="Company holidays for the year">
        <select
          className="input-field" aria-label="Year" style={{ width: 120 }}
          value={year} onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </PageTitle>

      {failed && (
        <div className="glass-card policy-empty" role="alert">
          <p>Could not load the holidays.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {!holidays && !failed && <div className="glass-card policy-empty">Loading...</div>}
      {holidays && list.length === 0 && <div className="glass-card policy-empty">No holidays added for {year}.</div>}
      {list.length > 0 && (
        <div className="holiday-grid">
          {list.map((h) => {
            const d = parse(h.holiday_date);
            const past = h.holiday_date < today;
            return (
              <div key={h.id} className={`glass-card holiday-card${past ? ' past' : ''}`}>
                <div className="holiday-date">
                  <strong>{d.getDate()}</strong>
                  <span>{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                </div>
                <div className="holiday-info">
                  <strong>{h.name}</strong>
                  <div className="policy-muted">{d.toLocaleDateString('en-IN', { weekday: 'long' })}</div>
                </div>
                {h.holiday_date === today
                  ? <span className="badge badge-active">Today</span>
                  : h.id === nextId && <span className="badge badge-info">Next</span>}
                {past && <span className="policy-muted">Past</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
