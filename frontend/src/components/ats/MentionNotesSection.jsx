import { useState, useRef, useMemo } from 'react';
import { Send, AtSign, X } from 'lucide-react';

function renderHighlightedContent(content, mentionedEmployees = []) {
  if (!content) return null;
  if (!mentionedEmployees || mentionedEmployees.length === 0) {
    return content;
  }

  // Highlight @Full Name tokens for mentioned employees
  const names = mentionedEmployees
    .map((m) => m.full_name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (names.length === 0) return content;

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(@(?:${escaped.join('|')}))`, 'gi');
  const parts = content.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith('@') && names.some((n) => `@${n}`.toLowerCase() === part.toLowerCase())) {
      return (
        <span
          key={idx}
          className="inline-block px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold"
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function MentionNotesSection({
  notes = [],
  mentionableUsers = [],
  onAddNote,
  addingNote = false,
}) {
  const [text, setText] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]); // [{ id, full_name }]
  const [mentionQuery, setMentionQuery] = useState(null); // string | null
  const [mentionStartIdx, setMentionStartIdx] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef(null);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers
      .filter(
        (u) =>
          u.full_name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.department_name?.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [mentionQuery, mentionableUsers]);

  const handleChange = (e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setText(val);

    // Detect active @mention token before cursor
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(^|\s)@([^\s@]{0,30})$/);
    if (match) {
      const start = cursorPos - match[2].length - 1;
      setMentionStartIdx(start);
      setMentionQuery(match[2]);
      setActiveIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStartIdx(-1);
    }
  };

  const insertMention = (user) => {
    const el = textareaRef.current;
    const cursorPos = el ? el.selectionStart : text.length;
    const before = mentionStartIdx >= 0 ? text.slice(0, mentionStartIdx) : text;
    const after = text.slice(cursorPos);
    const inserted = `@${user.full_name} `;
    const nextText = `${before}${inserted}${after}`;

    setText(nextText);
    setSelectedMentions((prev) =>
      prev.some((m) => m.id === user.id) ? prev : [...prev, { id: user.id, full_name: user.full_name }]
    );
    setMentionQuery(null);
    setMentionStartIdx(-1);

    requestAnimationFrame(() => {
      if (el) {
        const nextPos = before.length + inserted.length;
        el.focus();
        el.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
      }
    }
  };

  const removeMention = (empId) => {
    setSelectedMentions((prev) => prev.filter((m) => m.id !== empId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    // Keep only mentions still referenced or explicitly selected
    const mentionedIds = selectedMentions.map((m) => m.id);
    const ok = await onAddNote(text.trim(), mentionedIds);
    if (ok) {
      setText('');
      setSelectedMentions([]);
      setMentionQuery(null);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2 relative">
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            placeholder="Add an internal note... Type @ to mention a teammate"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="w-full p-3 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* @mention Autocomplete Dropdown */}
          {mentionQuery !== null && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[0.8125rem] font-bold uppercase tracking-wider text-gray-600">
                Mention Team Member
              </div>
              {suggestions.map((u, idx) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(u);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                    idx === activeIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {(u.full_name || 'U')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{u.full_name}</div>
                      <div className="text-[0.8125rem] text-gray-600 truncate">
                        {u.department_name || u.email || 'Team'}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Mentions Chips */}
        {selectedMentions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.8125rem] text-gray-600 inline-flex items-center gap-1">
              <AtSign size={11} /> Will notify:
            </span>
            {selectedMentions.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[0.8125rem] font-semibold"
              >
                <span>{m.full_name}</span>
                <button
                  type="button"
                  onClick={() => removeMention(m.id)}
                  className="hover:text-blue-900"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[0.8125rem] text-gray-600">
            Tip: Type <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">@name</code> to notify a teammate
          </span>
          <button
            type="submit"
            disabled={addingNote || !text.trim()}
            className="btn btn-primary text-xs py-1.5 px-3.5 inline-flex items-center gap-1.5"
          >
            <Send size={13} />
            <span>{addingNote ? 'Saving...' : 'Add Note'}</span>
          </button>
        </div>
      </form>

      {/* Notes List */}
      <div className="space-y-2.5">
        {notes.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-600">
            No internal notes yet. Add a note or @mention a teammate above.
          </div>
        ) : (
          notes.map((noteItem) => (
            <div
              key={noteItem.id}
              className="bg-white p-3.5 rounded-xl border border-gray-200 text-xs space-y-1.5 shadow-xs"
            >
              <div className="flex items-center justify-between text-[0.8125rem] text-gray-600">
                <span className="font-semibold text-gray-800">{noteItem.author_name}</span>
                <span>
                  {noteItem.created_at ? new Date(noteItem.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                {renderHighlightedContent(noteItem.content, noteItem.mentioned_employees)}
              </p>
              {noteItem.mentioned_employees && noteItem.mentioned_employees.length > 0 && (
                <div className="pt-1 flex flex-wrap gap-1">
                  {noteItem.mentioned_employees.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[0.8125rem] font-medium"
                    >
                      <AtSign size={9} />
                      {m.full_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
