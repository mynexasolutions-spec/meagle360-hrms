import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Search, X, Loader2, MapPin } from 'lucide-react';

const DEFAULT_CENTER = [20.5937, 78.9629]; // India
const PIN_STYLE = { radius: 8, color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 1, weight: 2 };

/**
 * Map where the user drops a pin, searches via OpenStreetMap Nominatim, or uses current location.
 * value: { lat, lng } | null; radius in metres; onChange({ lat, lng, primaryName?, displayName? }).
 * `others` optionally draws other fences ({ lat, lng, radius_m, name }) in grey.
 */
export default function LocationPicker({ value, radius = 100, onChange, others = [], height = 300 }) {
  const el = useRef(null);
  const map = useRef(null);
  const pin = useRef(null);
  const circle = useRef(null);
  const onChangeRef = useRef(onChange);
  const searchContainerRef = useRef(null);

  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Search state for Nominatim
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  onChangeRef.current = onChange;

  // Initialize Leaflet map
  useEffect(() => {
    map.current = L.map(el.current).setView(value ? [value.lat, value.lng] : DEFAULT_CENTER, value ? 16 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);

    map.current.on('click', (e) => {
      setShowResults(false);
      onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    setTimeout(() => map.current && map.current.invalidateSize(), 150);
    return () => {
      map.current?.remove();
      map.current = null;
      pin.current = null;
      circle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync pin and circle when value/radius changes
  useEffect(() => {
    if (!map.current) return;
    if (!value) {
      pin.current?.remove();
      circle.current?.remove();
      pin.current = null;
      circle.current = null;
      return;
    }
    const ll = [value.lat, value.lng];
    if (!pin.current) pin.current = L.circleMarker(ll, PIN_STYLE).addTo(map.current);
    else pin.current.setLatLng(ll);

    if (!circle.current) circle.current = L.circle(ll, { radius, color: '#2563eb', fillOpacity: 0.12 }).addTo(map.current);
    else {
      circle.current.setLatLng(ll);
      circle.current.setRadius(radius);
    }
  }, [value, radius]);

  // Sync other fences
  useEffect(() => {
    if (!map.current) return undefined;
    const layers = others.map((o) =>
      L.circle([o.latitude ?? o.lat, o.longitude ?? o.lng], { radius: o.radius_m, color: '#94a3b8', fillOpacity: 0.08, weight: 1 })
        .bindTooltip(o.name || '').addTo(map.current));
    return () => layers.forEach((l) => l.remove());
  }, [others]);

  // Click outside listener to dismiss search results
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search with OpenStreetMap Nominatim
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
          {
            signal: controller.signal,
            headers: { 'Accept-Language': 'en' },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowResults(true);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Nominatim search error:', err);
        }
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const handleSelectLocation = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (isNaN(lat) || isNaN(lng)) return;

    const primaryName = item.name || item.display_name.split(',')[0].trim();
    setSearchQuery(primaryName);
    setShowResults(false);
    onChangeRef.current?.({
      lat,
      lng,
      displayName: item.display_name,
      primaryName,
    });

    if (map.current) {
      map.current.flyTo([lat, lng], 16, { duration: 1.2 });
    }
  };

  const useMyLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChangeRef.current?.(p);
        map.current?.flyTo([p.lat, p.lng], 17, { duration: 1 });
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === 1 ? 'Location permission denied.' : 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div>
      {/* Nominatim Location Search Bar */}
      <div style={{ position: 'relative', marginBottom: 8, zIndex: 1000 }} ref={searchContainerRef}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: '#64748b', pointerEvents: 'none' }} />
          <input
            type="text"
            className="form-control"
            style={{
              width: '100%',
              paddingLeft: 32,
              paddingRight: searching || searchQuery ? 32 : 12,
              fontSize: '0.85rem',
              height: 36,
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              outline: 'none',
              background: '#ffffff',
            }}
            placeholder="Search address, landmark, or city (e.g. Cyber Hub, Gurugram)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => {
              if (searchResults.length > 0) setShowResults(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowResults(false);
            }}
          />
          {searching && (
            <Loader2
              size={15}
              style={{
                position: 'absolute',
                right: 10,
                color: '#3b82f6',
                animation: 'spin 1s linear infinite',
              }}
            />
          )}
          {!searching && searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowResults(false);
              }}
              style={{
                position: 'absolute',
                right: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: 2,
                display: 'flex',
              }}
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Dropdown Suggestions */}
        {showResults && searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
              maxHeight: 220,
              overflowY: 'auto',
              zIndex: 1001,
            }}
          >
            {searchResults.map((item) => {
              const primaryName = item.name || item.display_name.split(',')[0].trim();
              return (
                <div
                  key={item.place_id}
                  onClick={() => handleSelectLocation(item)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <MapPin size={15} style={{ color: '#2563eb', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ overflow: 'hidden', textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {primaryName}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.display_name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state when searched but nothing found */}
        {showResults && searchQuery.trim().length >= 3 && !searching && searchResults.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              padding: '10px 14px',
              fontSize: '0.8rem',
              color: '#64748b',
              textAlign: 'center',
              zIndex: 1001,
            }}
          >
            No locations found. Try a different landmark or click directly on the map.
          </div>
        )}
      </div>

      {/* Map View */}
      <div ref={el} style={{ height, width: '100%', borderRadius: 12, border: '1px solid #e2e8f0', zIndex: 0 }} />

      {/* Footer Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={useMyLocation} disabled={locating}>
          <LocateFixed size={14} /> {locating ? 'Locating...' : 'Use my current location'}
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {value ? `Pinned: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Search above or click on the map to drop a pin'}
        </span>
        {geoError && <span style={{ fontSize: 12, color: '#dc2626' }}>{geoError}</span>}
      </div>
    </div>
  );
}
