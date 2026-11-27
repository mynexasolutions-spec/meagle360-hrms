import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { getPublicSkillCatalog } from '../../api/ats';

// Skill picker for the public application form.
// The candidate picks skills from the same taxonomy the resume parser uses
// (or types their own) and can add years for each. Value shape:
// [{ name: string, years: number | null }]

export const MAX_SKILLS = 30;
const MAX_RESULTS = 8;

let catalogPromise = null;
function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = getPublicSkillCatalog()
      .then((res) => res.data?.skills || [])
      .catch(() => {
        catalogPromise = null; // allow a retry next time the form opens
        return [];
      });
  }
  return catalogPromise;
}

export default function SkillPicker({ value, onChange, suggested = [] }) {
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCatalog().then((list) => alive && setCatalog(list));
    return () => {
      alive = false;
    };
  }, []);

  const chosen = useMemo(() => new Set(value.map((s) => s.name.toLowerCase())), [value]);
  const full = value.length >= MAX_SKILLS;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const s of catalog) {
      const n = s.name.toLowerCase();
      if (chosen.has(n)) continue;
      if (n.startsWith(q)) starts.push(s);
      else if (n.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [query, catalog, chosen]);

  const add = (name) => {
    const clean = name.trim().slice(0, 80);
    if (!clean || full || chosen.has(clean.toLowerCase())) return;
    onChange([...value, { name: clean, years: null }]);
    setQuery('');
  };

  const remove = (name) => onChange(value.filter((s) => s.name !== name));

  const setYears = (name, raw) => {
    const n = raw === '' ? null : Math.min(50, Math.max(0, Number(raw)));
    onChange(value.map((s) => (s.name === name ? { ...s, years: Number.isFinite(n) ? n : null } : s)));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // do not submit the application
      if (results.length) add(results[0].name);
      else add(query);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const quickAdd = suggested.filter((s) => s && !chosen.has(s.toLowerCase()));
  const exact = results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="skill-picker">
      {quickAdd.length > 0 && !full && (
        <div className="skill-picker-suggest">
          <span className="skill-picker-hint">Skills this role asks for. Tap the ones you have:</span>
          <div className="skill-picker-chips">
            {quickAdd.map((s) => (
              <button key={s} type="button" className="skill-chip skill-chip-add" onClick={() => add(s)}>
                <Plus size={12} /> {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="skill-picker-search">
        <input
          type="text"
          value={query}
          disabled={full}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={full ? `You can add up to ${MAX_SKILLS} skills` : 'Search a skill, e.g. React, Payroll, Tally'}
          className="form-input"
          aria-label="Search skills"
          maxLength={80}
        />
        {open && query.trim() && (
          <ul className="skill-picker-menu" role="listbox">
            {results.map((s) => (
              <li key={s.name}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.name)}>
                  <span>{s.name}</span>
                  <span className="skill-picker-cat">{s.category}</span>
                </button>
              </li>
            ))}
            {!exact && (
              <li>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(query)}>
                  <span>Add “{query.trim()}”</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <div className="skill-picker-selected">
          {value.map((s) => (
            <div key={s.name} className="skill-chip skill-chip-selected">
              <span>{s.name}</span>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={s.years ?? ''}
                onChange={(e) => setYears(s.name, e.target.value)}
                placeholder="yrs"
                aria-label={`Years of ${s.name}`}
                className="skill-chip-years"
              />
              <button type="button" onClick={() => remove(s.name)} aria-label={`Remove ${s.name}`} className="skill-chip-remove">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
