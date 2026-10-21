import { useEffect, useState, useCallback } from 'react';
import { MapPin, Trash2 } from 'lucide-react';
import Modal from './Modal';
import LocationPicker from './LocationPicker';
import { usePopup } from '../context/PopupContext';
import { getGeofenceConfig, requestMyLocation, removeMyLocation } from '../api/geofence';

const STATUS_COLOR = { pending: '#b45309', approved: '#15803d', rejected: '#b91c1c' };

/** Employee-facing: request a personal clock-in location (e.g. home) and see its status. */
export default function MyClockInLocations() {
  const { showToast } = usePopup();
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', pin: null, radius: 100 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setCfg((await getGeofenceConfig()).data); } catch { /* geofence UI is optional */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!cfg?.enabled) return null;
  const mine = cfg.my_locations || [];

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast({ message: 'Enter a name (e.g. Home)', type: 'warning' });
    if (!form.pin) return showToast({ message: 'Drop a pin on the map', type: 'warning' });
    setSaving(true);
    try {
      await requestMyLocation({ name: form.name.trim(), latitude: form.pin.lat, longitude: form.pin.lng, radius_m: Number(form.radius) });
      showToast({ message: 'Request sent to admin for approval', type: 'success' });
      setForm({ name: '', pin: null, radius: cfg.default_radius_m });
      await load();
    } catch (err) {
      showToast({ message: err.response?.data?.detail || 'Failed to send request', type: 'error' });
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this location?')) return;
    try { await removeMyLocation(id); await load(); }
    catch (err) { showToast({ message: err.response?.data?.detail || 'Failed to remove', type: 'error' }); }
  };

  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <MapPin size={14} /> My clock-in locations
      </button>
      {open && (
        <Modal title="My clock-in locations" onClose={() => setOpen(false)}>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
            Working remotely? Request your location (e.g. home). Once your admin approves it,
            you can clock in within its radius.
          </p>
          {mine.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
              {mine.map((l) => (
                <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span>
                    <b>{l.name}</b> · {l.radius_m} m ·{' '}
                    <span style={{ color: STATUS_COLOR[l.status], textTransform: 'capitalize' }}>{l.status}</span>
                    {l.review_note && <span style={{ color: '#64748b' }}> — {l.review_note}</span>}
                  </span>
                  {(l.status === 'pending' || l.status === 'approved') && (
                    <button className="btn-icon btn-ghost" title="Remove" onClick={() => remove(l.id)}><Trash2 size={15} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submit}>
            <div className="input-group">
              <label className="input-label">Location name</label>
              <input className="input-field" value={form.name} maxLength={255}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Home" />
            </div>
            <div className="input-group">
              <label className="input-label">Pin your location</label>
              <LocationPicker value={form.pin} radius={Number(form.radius) || 100}
                onChange={(pin) => setForm((f) => ({ ...f, pin }))} height={240} />
            </div>
            <div className="input-group">
              <label className="input-label">Requested radius (m) — admin may adjust</label>
              <input type="number" className="input-field" min={cfg.min_radius_m} max={cfg.max_radius_m}
                value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Sending...' : 'Request approval'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
