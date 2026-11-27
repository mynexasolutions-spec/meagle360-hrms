import { useState } from 'react';
import { X } from 'lucide-react';

/** Chip input for a list of skills. Enter or comma adds a skill, Backspace on
 *  an empty box removes the last one. Names are cleaned up on the server
 *  ("reactjs" -> "React"). */
export default function SkillsInput({ value = [], onChange, placeholder = 'Type a skill and press Enter' }) {
  const [draft, setDraft] = useState('');

  const add = (raw) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const existing = new Set(value.map((s) => s.toLowerCase()));
    const next = [...value];
    parts.forEach((p) => {
      if (!existing.has(p.toLowerCase())) {
        existing.add(p.toLowerCase());
        next.push(p);
      }
    });
    onChange(next);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 min-h-[42px] border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white">
      {value.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium">
          {s}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== s))}
            className="text-blue-600 hover:text-blue-900"
            aria-label={`Remove ${s}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={value.length ? '' : placeholder}
        className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
      />
    </div>
  );
}
