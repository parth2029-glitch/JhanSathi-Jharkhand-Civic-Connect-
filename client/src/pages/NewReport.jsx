import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, CATEGORY_LABELS, RANCHI, WARDS } from '../api.js';
import { useAuth } from '../App.jsx';
import { Alert, Button, Card, Field, PickerMap, StatusPill, ago, input, label } from '../ui.jsx';

const RADIUS = 50;
const SEVERITY = ['Minor', 'Low', 'Moderate', 'Serious', 'Critical'];

export default function NewReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef();

  const [coords, setCoords] = useState(RANCHI);
  const [gps, setGps] = useState('Locating you…');
  const [form, setForm] = useState({ category: 'garbage', description: '', severity: 3, ward: user.ward || WARDS[0], address: '' });
  const [preview, setPreview] = useState(null);
  const [nearby, setNearby] = useState([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!navigator.geolocation) return setGps('Location not available — drag the pin instead.');
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setGps('Using your GPS location. Drag the pin to fine-tune.'); },
      () => setGps('GPS permission denied — place the pin on the map manually.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // Crowdsourced duplicate check (§10): re-runs whenever the pin or category moves.
  useEffect(() => {
    setAcknowledged(false);
    const t = setTimeout(() => {
      api.get('/reports/nearby', { params: { ...coords, category: form.category, radius: RADIUS } })
        .then(({ data }) => setNearby(data.matches))
        .catch(() => setNearby([]));
    }, 400);
    return () => clearTimeout(t);
  }, [coords.lat, coords.lng, form.category]);

  const pickPhoto = (e) => {
    const file = e.target.files[0];
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const support = async (id) => {
    setBusy(true);
    try {
      await api.post(`/reports/${id}/support`);
      navigate('/my?tab=supported');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      Object.entries({ ...form, ...coords }).forEach(([k, v]) => body.append(k, v));
      if (fileRef.current.files[0]) body.append('image', fileRef.current.files[0]);
      const { data } = await api.post('/reports', body);
      navigate(`/my?highlight=${data.report._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const blocked = nearby.length > 0 && !acknowledged;

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="p-5">
          <h1 className="text-lg font-bold">Report a civic issue</h1>
          <p className="mt-1 text-sm text-slate-500">A photo and an accurate pin help the department act faster.</p>

          <div className="mt-4 space-y-3">
            <Field label="What is the problem?">
              <select className={input} value={form.category} onChange={set('category')}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>

            <Field label="Describe it">
              <textarea className={input} rows={3} maxLength={1000} required value={form.description} onChange={set('description')}
                placeholder="e.g. Bin overflowing at the market gate for three days, waste on the footpath." />
            </Field>

            <Field label={`How serious is it? — ${SEVERITY[form.severity - 1]}`} hint="Severity is the largest single input to the priority score.">
              <input type="range" min="1" max="5" value={form.severity} onChange={set('severity')} className="w-full accent-emerald-600" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Ward">
                <select className={input} value={form.ward} onChange={set('ward')}>
                  {WARDS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </Field>
              <Field label="Landmark (optional)">
                <input className={input} value={form.address} onChange={set('address')} placeholder="Near the bus stand" />
              </Field>
            </div>

            <Field label="Photo" hint="JPEG, PNG or WebP, up to 5 MB.">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickPhoto}
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-white" />
            </Field>
            {preview && <img src={preview} alt="Preview" className="h-40 w-full rounded-lg object-cover" />}

            <Alert>{error}</Alert>
            <Button className="w-full" disabled={busy || blocked}>
              {busy ? 'Submitting…' : blocked ? 'Check the nearby issue first' : 'Submit report'}
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="overflow-hidden p-0">
          <div className="h-80"><PickerMap value={coords} onChange={setCoords} others={nearby} radius={RADIUS} /></div>
          <div className="p-3 text-xs text-slate-500">
            {gps} · {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </div>
        </Card>

        {nearby.length > 0 && (
          <Card className="border-sky-300 bg-sky-50 p-5">
            <h2 className="font-bold text-sky-900">
              {nearby.length} similar {nearby.length === 1 ? 'issue is' : 'issues are'} already reported within {RADIUS} m
            </h2>
            <p className="mt-1 text-sm text-sky-800">
              Supporting an existing report raises its priority faster than filing a duplicate.
            </p>

            <div className="mt-3 space-y-2">
              {nearby.map((n) => (
                <div key={n._id} className="rounded-lg border border-sky-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{n.complaintId}</span>
                    <StatusPill status={n.status} />
                    <span className="text-xs text-slate-500">{n.distance} m away · {ago(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button type="button" disabled={busy || n.supported || n.mine} onClick={() => support(n._id)}>
                      {n.mine ? 'You reported this' : n.supported ? 'You already support this' : `Support this (${n.supporterCount})`}
                    </Button>
                    <span className="text-xs text-slate-500">{label(n.category)}</span>
                  </div>
                </div>
              ))}
            </div>

            {!acknowledged && (
              <button type="button" onClick={() => setAcknowledged(true)} className="mt-3 text-sm font-semibold text-sky-900 hover:underline">
                None of these match — report a separate issue →
              </button>
            )}
          </Card>
        )}
      </div>
    </form>
  );
}
