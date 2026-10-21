import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed } from 'lucide-react';

const DEFAULT_CENTER = [20.5937, 78.9629]; // India
const PIN_STYLE = { radius: 8, color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 1, weight: 2 };

/**
 * Map where the user drops a pin and sees the radius circle.
 * value: { lat, lng } | null; radius in metres; onChange({ lat, lng }).
 * `others` optionally draws other fences ({ lat, lng, radius_m, name }) in grey.
 */
export default function LocationPicker({ value, radius = 100, onChange, others = [], height = 300 }) {
  const el = useRef(null);
  const map = useRef(null);
  const pin = useRef(null);
  const circle = useRef(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  onChangeRef.current = onChange;

  useEffect(() => {
    map.current = L.map(el.current).setView(value ? [value.lat, value.lng] : DEFAULT_CENTER, value ? 16 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    map.current.on('click', (e) => onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    setTimeout(() => map.current && map.current.invalidateSize(), 150);
    return () => { map.current.remove(); map.current = null; pin.current = null; circle.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    if (!value) {
      pin.current?.remove(); circle.current?.remove(); pin.current = null; circle.current = null;
      return;
    }
    const ll = [value.lat, value.lng];
    if (!pin.current) pin.current = L.circleMarker(ll, PIN_STYLE).addTo(map.current);
    else pin.current.setLatLng(ll);
    if (!circle.current) circle.current = L.circle(ll, { radius, color: '#2563eb', fillOpacity: 0.12 }).addTo(map.current);
    else { circle.current.setLatLng(ll); circle.current.setRadius(radius); }
  }, [value, radius]);

  useEffect(() => {
    if (!map.current) return undefined;
    const layers = others.map((o) =>
      L.circle([o.latitude ?? o.lat, o.longitude ?? o.lng], { radius: o.radius_m, color: '#94a3b8', fillOpacity: 0.08, weight: 1 })
        .bindTooltip(o.name || '').addTo(map.current));
    return () => layers.forEach((l) => l.remove());
  }, [others]);

  const useMyLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) { setGeoError('Geolocation is not supported by this browser.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChangeRef.current?.(p);
        map.current?.setView([p.lat, p.lng], 17);
      },
      (err) => { setLocating(false); setGeoError(err.code === 1 ? 'Location permission denied.' : 'Could not get your location.'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div>
      <div ref={el} style={{ height, width: '100%', borderRadius: 12, border: '1px solid #e2e8f0', zIndex: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={useMyLocation} disabled={locating}>
          <LocateFixed size={14} /> {locating ? 'Locating...' : 'Use my current location'}
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {value ? `Pinned: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Click on the map to drop a pin'}
        </span>
        {geoError && <span style={{ fontSize: 12, color: '#dc2626' }}>{geoError}</span>}
      </div>
    </div>
  );
}
