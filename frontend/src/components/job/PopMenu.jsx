import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A small menu drawn on the body, so scrolling panels never cut it off.
export default function PopMenu({ label, className, icon, children }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const menu = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const at = button.current.getBoundingClientRect();
    const box = menu.current;
    const left = Math.max(8, Math.min(at.right - box.offsetWidth, window.innerWidth - box.offsetWidth - 8));
    const below = at.bottom + 4;
    const top = below + box.offsetHeight > window.innerHeight - 8 ? Math.max(8, at.top - box.offsetHeight - 4) : below;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.querySelector('button, input')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button} type="button" className={className} aria-expanded={open}
        aria-label={label} title={label} onClick={() => setOpen(!open)}
      >
        {icon}
      </button>
      {open && createPortal(
        <div ref={menu} className="oe-menu">{children(() => setOpen(false))}</div>,
        document.body,
      )}
    </>
  );
}
