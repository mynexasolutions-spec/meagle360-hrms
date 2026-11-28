import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import Modal from './Modal';

/**
 * Phone-only tab switcher: [‹] [ current ▾ ] [›]. Tapping the middle opens the full list,
 * so any number of tabs works without sideways scrolling.
 * items: [{ id, label, count? }]
 */
export default function PhoneStepTabs({ items, value, onChange, title = 'Go to', className = '' }) {
  const [open, setOpen] = useState(false);
  const index = Math.max(0, items.findIndex((i) => i.id === value));
  const current = items[index];
  const step = (dir) => {
    const next = items[index + dir];
    if (next) onChange(next.id);
  };

  return (
    <div className={`md:hidden ${className}`}>
      <div className="flex items-stretch gap-2" role="group" aria-label={title}>
        <button
          type="button" onClick={() => step(-1)} disabled={index === 0} aria-label="Previous"
          className="w-11 min-h-[46px] shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
          className="flex-1 min-w-0 min-h-[46px] inline-flex items-center justify-between gap-2 px-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-sm"
        >
          <span className="truncate">{current?.label}</span>
          <span className="inline-flex items-center gap-1.5 shrink-0">
            {current?.count != null && <span className="px-2 rounded-full bg-blue-700 text-xs">{current.count}</span>}
            <ChevronDown size={16} />
          </span>
        </button>
        <button
          type="button" onClick={() => step(1)} disabled={index === items.length - 1} aria-label="Next"
          className="w-11 min-h-[46px] shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 disabled:opacity-40"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {open && (
        <Modal sheet title={title} onClose={() => setOpen(false)} closeOnOverlay>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <button
                key={item.id} type="button"
                onClick={() => { onChange(item.id); setOpen(false); }}
                className={`flex items-center justify-between min-h-[48px] px-3.5 rounded-xl border text-sm font-semibold text-left ${
                  value === item.id ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-slate-800'
                }`}
              >
                <span>{item.label}</span>
                <span className="inline-flex items-center gap-2">
                  {item.count != null && <span className="px-2 rounded-full bg-gray-100 text-xs text-slate-700">{item.count}</span>}
                  {value === item.id && <Check size={16} />}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
