import { useCallback, useEffect, useRef, useState } from 'react';

// Zoom / fit / pinch for the A4 live preview in the letter studios.
// On phones the page is fitted to the screen width and can be pinched and panned.
export default function useLetterPreview(defaultZoom = 0.58, naturalWidth = 794) {
  const query = '(max-width: 900px)';
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);
  const [zoom, setZoom] = useState(defaultZoom);
  const [autoFit, setAutoFit] = useState(true);
  const [boxW, setBoxW] = useState(0);
  const [natural, setNatural] = useState({ w: naturalWidth, h: 1120 });
  const boxRef = useRef(null);
  const innerRef = useRef(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const min = isMobile ? 0.3 : 0.42;
  const max = isMobile ? 1.6 : 1.0;
  const clamp = useCallback((z) => Math.max(min, Math.min(max, Number(z.toFixed(2)))), [min, max]);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Width we can draw in (0 while the pane is hidden).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const read = () => setBoxW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Unscaled size of the letter, so the scroll area matches the scaled page.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const read = () => setNatural({ w: el.offsetWidth || naturalWidth, h: el.offsetHeight || 1120 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidth]);

  const fitZoom = useCallback(() => clamp((boxW - 4) / natural.w), [boxW, natural.w, clamp]);

  useEffect(() => {
    if (isMobile && autoFit && boxW > 0) setZoom(fitZoom());
  }, [isMobile, autoFit, boxW, fitZoom]);

  const zoomIn = () => { setAutoFit(false); setZoom((z) => clamp(z + 0.05)); };
  const zoomOut = () => { setAutoFit(false); setZoom((z) => clamp(z - 0.05)); };
  const fit = () => {
    if (isMobile) { setAutoFit(true); if (boxW > 0) setZoom(fitZoom()); } else setZoom(defaultZoom);
  };

  // Two-finger pinch.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    let startDist = 0;
    let startZoom = 1;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e) => {
      if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoomRef.current; }
    };
    const onMove = (e) => {
      if (e.touches.length === 2 && startDist) {
        e.preventDefault();
        setAutoFit(false);
        setZoom(clamp(startZoom * dist(e.touches) / startDist));
      }
    };
    const onEnd = () => { startDist = 0; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [clamp]);

  return { zoom, isMobile, natural, boxRef, innerRef, zoomIn, zoomOut, fit };
}
