import { useEffect, useState, useCallback } from 'react';
import { MapPin, ShieldCheck, Trash2, Pencil, Check, X } from 'lucide-react';
import Modal from './Modal';
import LocationPicker from './LocationPicker';
import { usePopup } from '../context/PopupContext';
import {
  getGeofenceConfig, updateGeofenceConfig, createOffice, updateOffice, deleteOffice,
  getLocationRequests, reviewLocationRequest, getFlaggedAttendance, reviewFlaggedAttendance,
} from '../api/geofence';

const errMsg = (e, fallback) => e?.response?.data?.detail || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function GeofenceSettings() {
  const { showToast } = usePopup();
  const [cfg, setCfg] = useState(null);
  const [requests, setRequests] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [form, setForm] = useState(null); // { id?, name, pin, radius, mode?, enabling? }
  const [radii, setRadii] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getGeofenceConfig();
      setCfg(data);
      if (data.enabled) {
        const [r, f] = await Promise.all([
          getLocationRequests({ status: 'pending' }),
          getFlaggedAttendance({ status: 'pending' }),
        ]);
        setRequests(r.data);
        setFlagged(f.data);
      }
    } catch (e) {
      showToast({ message: errMsg(e, 'Failed to load geofence settings'), type: 'error' });
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  if (!cfg) return <div className="section-card">Loading...</div>;

  const act = async (fn, okMsg) => {
    setSaving(true);
    try {
      await fn();
      if (okMsg) showToast({ message: okMsg, type: 'success' });
      setForm(null);
      await load();
    } catch (e) {
      showToast({ message: errMsg(e, 'Action failed'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openEnable = () => setForm({ enabling: true, name: '', pin: null, radius: cfg.default_radius_m, mode: cfg.mode });
  const openAdd = () => setForm({ name: '', pin: null, radius: cfg.default_radius_m });
  const openEdit = (o) => setForm({ id: o.id, name: o.name, pin: { lat: o.latitude, lng: o.longitude }, radius: o.radius_m });

  const submitForm = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast({ message: 'Enter the office name', type: 'warning' });
    if (!form.pin) return showToast({ message: 'Drop a pin on the map', type: 'warning' });
    const office = { name: form.name.trim(), latitude: form.pin.lat, longitude: form.pin.lng, radius_m: Number(form.radius) };
    if (form.enabling) return act(() => updateGeofenceConfig({ enabled: true, mode: form.mode, office }), 'Geofencing enabled');
    if (form.id) return act(() => updateOffice(form.id, office), 'Office updated');
    return act(() => createOffice(office), 'Office added');
  };

  const disable = () => {
    if (window.confirm('Turn off geofencing? Employees will be able to clock in from anywhere.')) {
      act(() => updateGeofenceConfig({ enabled: false }), 'Geofencing disabled');
    }
  };

  return (
    <div className="section-card" style={{ borderTop: '3px solid #2563eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <h3 style={{ marginBottom: 0 }}><ShieldCheck size={18} style={{ color: '#2563eb' }} /> Geofenced Clock-In</h3>
        {cfg.enabled
          ? <button className="btn btn-secondary btn-sm" onClick={disable} disabled={saving}>Turn off</button>
          : <button className="btn btn-primary btn-sm" onClick={openEnable}>Enable</button>}
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Employees can clock in only within the radius of an office or an approved personal location.
        Currently <b>{cfg.enabled ? 'ON' : 'OFF'}</b>.
      </p>

      {cfg.enabled && (
        <>
          <div className="input-group" style={{ maxWidth: 420 }}>
            <label className="input-label">When an employee is outside the radius</label>
            <select className="input-field" value={cfg.mode} disabled={saving}
              onChange={(e) => act(() => updateGeofenceConfig({ mode: e.target.value }), 'Mode updated')}>
              <option value="flag">Allow clock-in, but flag it for admin review</option>
              <option value="block">Block the clock-in</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
            <h4 style={{ margin: 0 }}>Office locations</h4>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add office</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Coordinates</th><th>Radius</th><th /></tr></thead>
              <tbody>
                {cfg.offices.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}><MapPin size={14} /> {o.name}</td>
                    <td>{o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}</td>
                    <td>{o.radius_m} m</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-icon btn-ghost" title="Edit" onClick={() => openEdit(o)}><Pencil size={15} /></button>
                      <button className="btn-icon btn-ghost" title="Remove" disabled={saving}
                        onClick={() => window.confirm(`Remove ${o.name}?`) && act(() => deleteOffice(o.id), 'Office removed')}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ margin: '24px 0 8px' }}>Pending location requests ({requests.length})</h4>
          {requests.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No pending requests.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Location</th><th>Requested</th><th>Radius (m)</th><th /></tr></thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.employee_name}</td>
                      <td>
                        {r.name}<br />
                        <a href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=17/${r.latitude}/${r.longitude}`}
                          target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>View on map</a>
                      </td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>
                        <input type="number" className="input-field" style={{ width: 90 }}
                          min={cfg.min_radius_m} max={cfg.max_radius_m}
                          value={radii[r.id] ?? r.radius_m}
                          onChange={(e) => setRadii({ ...radii, [r.id]: e.target.value })} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-primary btn-sm" disabled={saving}
                          onClick={() => act(() => reviewLocationRequest(r.id, { approve: true, radius_m: Number(radii[r.id] ?? r.radius_m) }), 'Location approved')}>
                          <Check size={14} /> Approve
                        </button>{' '}
                        <button className="btn btn-secondary btn-sm" disabled={saving}
                          onClick={() => act(() => reviewLocationRequest(r.id, { approve: false }), 'Location rejected')}>
                          <X size={14} /> Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 style={{ margin: '24px 0 8px' }}>Flagged clock-ins ({flagged.length})</h4>
          {flagged.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>Nothing to review.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Clock-in</th><th>Reason</th><th>Location</th><th /></tr></thead>
                <tbody>
                  {flagged.map((f) => (
                    <tr key={f.id}>
                      <td>{f.employee_name}</td>
                      <td>{fmtDate(f.clock_in)}</td>
                      <td>
                        {f.geofence_status === 'outside'
                          ? `${Math.round(f.distance_m)} m from ${f.geofence_location_name || 'nearest location'}`
                          : 'Location unavailable / low accuracy'}
                      </td>
                      <td>
                        {f.latitude != null ? (
                          <a href={`https://www.openstreetmap.org/?mlat=${f.latitude}&mlon=${f.longitude}#map=17/${f.latitude}/${f.longitude}`}
                            target="_blank" rel="noreferrer">View on map</a>
                        ) : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-primary btn-sm" disabled={saving}
                          onClick={() => act(() => reviewFlaggedAttendance(f.id, { approve: true }), 'Clock-in approved')}>
                          <Check size={14} /> Approve
                        </button>{' '}
                        <button className="btn btn-secondary btn-sm" disabled={saving}
                          onClick={() => act(() => reviewFlaggedAttendance(f.id, { approve: false }), 'Clock-in rejected')}>
                          <X size={14} /> Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {form && (
        <Modal title={form.enabling ? 'Enable geofencing — set your office' : form.id ? 'Edit office' : 'Add office'} onClose={() => setForm(null)} maxWidth="620px">
          <form onSubmit={submitForm}>
            <div className="input-group">
              <label className="input-label">Office name</label>
              <input className="input-field" value={form.name} maxLength={255}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Head Office" />
            </div>
            <div className="input-group">
              <label className="input-label">Location (click map to pin)</label>
              <LocationPicker value={form.pin} radius={Number(form.radius) || cfg.default_radius_m}
                onChange={(pin) => setForm((f) => ({ ...f, pin }))}
                others={cfg.offices.filter((o) => o.id !== form.id)} />
            </div>
            <div className="input-group">
              <label className="input-label">Radius (metres, {cfg.min_radius_m}–{cfg.max_radius_m})</label>
              <input type="number" className="input-field" min={cfg.min_radius_m} max={cfg.max_radius_m}
                value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} />
            </div>
            {form.enabling && (
              <div className="input-group">
                <label className="input-label">If an employee is outside the radius</label>
                <select className="input-field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  <option value="flag">Allow clock-in, but flag it for admin review</option>
                  <option value="block">Block the clock-in</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
