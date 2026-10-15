import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CATEGORY_LABELS, RANCHI } from './api.js';

export const STATUS = {
  SUBMITTED:        { label: 'Submitted',             cls: 'bg-slate-200 text-slate-700' },
  VERIFIED:         { label: 'Verified',              cls: 'bg-sky-100 text-sky-700' },
  ASSIGNED:         { label: 'Assigned',              cls: 'bg-indigo-100 text-indigo-700' },
  IN_PROGRESS:      { label: 'In progress',           cls: 'bg-amber-100 text-amber-800' },
  RESOLVED_PENDING: { label: 'Awaiting confirmation', cls: 'bg-violet-100 text-violet-700' },
  CLOSED:           { label: 'Closed',                cls: 'bg-emerald-100 text-emerald-700' },
  REOPENED:         { label: 'Reopened',              cls: 'bg-rose-100 text-rose-700' },
};

export const PRIORITY_COLOR = { High: '#dc2626', Medium: '#f59e0b', Low: '#10b981' };

export const label = (c) => CATEGORY_LABELS[c] || c;

export function ago(date) {
  const mins = Math.round((Date.now() - new Date(date)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export const until = (date) => {
  const mins = Math.round((new Date(date) - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const span = abs < 60 ? `${abs}m` : abs < 1440 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  return mins < 0 ? `${span} overdue` : `${span} left`;
};

/* --------------------------------------------------------------- primitives */

export const Card = ({ className = '', ...props }) => (
  <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />
);

export const Pill = ({ className = '', children }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}>{children}</span>
);

export const StatusPill = ({ status }) => (
  <Pill className={STATUS[status]?.cls || 'bg-slate-200'}>{STATUS[status]?.label || status}</Pill>
);

export const PriorityPill = ({ report }) => (
  <Pill className={{ High: 'bg-red-100 text-red-700', Medium: 'bg-amber-100 text-amber-800', Low: 'bg-emerald-100 text-emerald-700' }[report.priorityLevel]}>
    {report.priorityLevel} · {report.priorityScore}
  </Pill>
);

export const Button = ({ variant = 'primary', className = '', ...props }) => (
  <button
    className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
      {
        primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
        ghost: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        danger: 'bg-rose-600 text-white hover:bg-rose-700',
      }[variant]
    } ${className}`}
    {...props}
  />
);

export const Field = ({ label: text, children, hint }) => (
  <label className="block text-sm">
    <span className="mb-1 block font-medium text-slate-700">{text}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

export const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

export const Alert = ({ children, tone = 'error' }) =>
  children ? (
    <div className={`rounded-lg px-3 py-2 text-sm ${tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{children}</div>
  ) : null;

export const Stat = ({ label: text, value, tone = 'text-slate-900' }) => (
  <Card className="p-4">
    <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{text}</div>
    <div className={`mt-1 text-2xl font-bold ${tone}`}>{value ?? '—'}</div>
  </Card>
);

export const Empty = ({ children }) => (
  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>
);

/* --------------------------------------------------------------------- maps */

// divIcon avoids Leaflet's bundled marker-image paths entirely and lets the pin
// carry the priority colour.
const pin = (color, text = '') =>
  L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${color}">${text}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], map.getZoom());
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const ClickToMove = ({ onChange }) => {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
};

const Tiles = () => (
  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  />
);

/** Draggable single marker for choosing where the issue is. */
export function PickerMap({ value, onChange, others = [], radius }) {
  return (
    <MapContainer center={[value.lat, value.lng]} zoom={17} scrollWheelZoom>
      <Tiles />
      <Recenter center={value} />
      <ClickToMove onChange={onChange} />
      {radius && <Circle center={[value.lat, value.lng]} radius={radius} pathOptions={{ color: '#0284c7', weight: 1, fillOpacity: 0.08 }} />}
      {others.map((o) => (
        <Marker key={o._id} position={[o.location.coordinates[1], o.location.coordinates[0]]} icon={pin('#0284c7')}>
          <Popup>
            <b>{o.complaintId}</b> · {label(o.category)}
            <br />
            {o.distance} m away
          </Popup>
        </Marker>
      ))}
      <Marker
        position={[value.lat, value.lng]}
        draggable
        icon={pin('#dc2626', '✚')}
        eventHandlers={{ dragend: (e) => onChange({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }) }}
      />
    </MapContainer>
  );
}

/** Many reports, coloured by priority, with optional hotspot halos. */
export function ReportsMap({ reports = [], hotspots = [], onSelect, center = RANCHI }) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={14} scrollWheelZoom>
      <Tiles />
      {hotspots.map((h, i) => (
        <Circle key={`h${i}`} center={[h.lat, h.lng]} radius={90} pathOptions={{ color: '#dc2626', weight: 1, fillOpacity: 0.15 }}>
          <Popup>
            <b>Civic hotspot</b>
            <br />
            {h.count} open complaints{h.ward ? ` · ${h.ward}` : ''}
          </Popup>
        </Circle>
      ))}
      {reports.map((r) => (
        <Marker
          key={r._id}
          position={[r.location.coordinates[1], r.location.coordinates[0]]}
          icon={pin(PRIORITY_COLOR[r.priorityLevel] || '#64748b')}
          eventHandlers={onSelect ? { click: () => onSelect(r) } : undefined}
        >
          <Popup>
            <b>{r.complaintId}</b> · {label(r.category)}
            <br />
            {STATUS[r.status]?.label} · {r.priorityLevel}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

/* ----------------------------------------------------------------- timeline */

export const Timeline = ({ report }) => (
  <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
    {report.timeline?.map((e, i) => (
      <li key={i} className="relative text-sm">
        <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={e.status} />
          <span className="text-xs text-slate-500">
            {new Date(e.at).toLocaleString()} {e.byName && `· ${e.byName}`}
          </span>
        </div>
        {e.note && <p className="mt-0.5 text-slate-600">{e.note}</p>}
      </li>
    ))}
  </ol>
);

/** Original vs resolution evidence, side by side. */
export const Evidence = ({ report }) => (
  <div className="grid grid-cols-2 gap-3">
    {[
      ['Reported', report.imageUrl],
      ['Resolution', report.resolutionImageUrl],
    ].map(([caption, src]) => (
      <div key={caption}>
        <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{caption}</div>
        {src ? (
          <a href={src} target="_blank" rel="noreferrer">
            <img src={src} alt={caption} className="h-36 w-full rounded-lg border border-slate-200 object-cover" />
          </a>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
            No photo yet
          </div>
        )}
      </div>
    ))}
  </div>
);

/** Tiny fetch-on-mount helper so pages don't each hand-roll loading state. */
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => live && setState({ loading: false, data }))
      .catch((error) => live && setState({ loading: false, error: error.message }));
    return () => { live = false; };
  }, [...deps, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
