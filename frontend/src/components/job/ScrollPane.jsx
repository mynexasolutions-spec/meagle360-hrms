import { useEffect, useRef, useState } from 'react';

// A scrolling box that says how many [data-item]s are hidden below its edge.
export default function ScrollPane({ as: Tag = 'div', className, innerClassName = '', label, footer, children }) {
  const ref = useRef(null);
  const [more, setMore] = useState(0);

  useEffect(() => {
    const el = ref.current;
    const count = () => {
      const edge = el.getBoundingClientRect().bottom;
      const scrolls = el.scrollHeight > el.clientHeight + 1;
      setMore(scrolls ? [...el.querySelectorAll('[data-item]')].filter((i) => i.getBoundingClientRect().bottom > edge + 6).length : 0);
    };
    count();
    el.addEventListener('scroll', count, { passive: true });
    const resized = new ResizeObserver(count);
    resized.observe(el);
    const changed = new MutationObserver(count);
    changed.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', count);
      resized.disconnect();
      changed.disconnect();
    };
  }, []);

  return (
    <Tag className={`oe-pane ${className}`} aria-label={label}>
      <div className="oe-pane-main">
        <div ref={ref} className={`oe-pane-scroll ${innerClassName}`}>{children}</div>
        {more > 0 && <div className="oe-more" aria-hidden="true">↓ {more} more</div>}
      </div>
      {footer}
    </Tag>
  );
}
