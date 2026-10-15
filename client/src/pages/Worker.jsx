import { useRef, useState } from 'react';
import { api } from '../api.js';
import {
  Alert, Button, Card, Empty, Evidence, PriorityPill, ReportsMap, StatusPill, ago, input, label, until, useApi,
} from '../ui.jsx';

export default function Worker() {
  const { data, loading, error, reload } = useApi(() => api.get('/reports').then((r) => r.data));
  const jobs = (data?.reports || []).filter((r) => r.status !== 'CLOSED');
  const done = (data?.reports || []).filter((r) => r.status === 'CLOSED');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">My work</h1>
        <p className="text-sm text-slate-500">Jobs assigned to you, most urgent first.</p>
      </div>

      <Alert>{error}</Alert>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && jobs.length === 0 && <Empty>Nothing assigned to you right now.</Empty>}

      {jobs.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="h-64"><ReportsMap reports={jobs} /></div>
        </Card>
      )}

      {jobs.map((r) => <Job key={r._id} report={r} onChange={reload} />)}

      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-slate-600">Completed jobs ({done.length})</summary>
          <div className="mt-3 space-y-3">{done.map((r) => <Job key={r._id} report={r} onChange={reload} />)}</div>
        </details>
      )}
    </div>
  );
}

function Job({ report, onChange }) {
  const fileRef = useRef();
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const act = (fn) => async () => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resolve = act(() => {
    const body = new FormData();
    body.append('note', note);
    body.append('image', fileRef.current.files[0]);
    return api.patch(`/reports/${report._id}/resolve`, body);
  });

  const [lng, lat] = report.location.coordinates;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
        <span className="font-mono text-sm font-semibold">{report.complaintId}</span>
        <PriorityPill report={report} />
        <StatusPill status={report.status} />
        {report.overdue && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">Overdue</span>}
        <span className="ml-auto text-xs text-slate-500">
          {report.slaDeadline && report.status !== 'CLOSED' ? until(report.slaDeadline) : ago(report.createdAt)}
        </span>
      </div>

      <div className="space-y-2 p-4">
        <div className="text-sm font-semibold">{label(report.category)} · {report.ward || 'Ward unknown'}</div>
        <p className="text-sm text-slate-600">{report.description}</p>
        {report.address && <p className="text-xs text-slate-500">Landmark: {report.address}</p>}
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-semibold text-emerald-700 hover:underline"
        >
          Open location in maps →
        </a>
        {report.rejectionReason && (
          <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700"><b>Reopened:</b> {report.rejectionReason}</p>
        )}
        <Evidence report={report} />
      </div>

      <div className="space-y-2 border-t border-slate-100 p-4">
        <Alert>{error}</Alert>

        {['ASSIGNED', 'REOPENED'].includes(report.status) && (
          <Button disabled={busy} onClick={act(() => api.patch(`/reports/${report._id}`, { status: 'IN_PROGRESS' }))}>
            Start work
          </Button>
        )}

        {report.status === 'IN_PROGRESS' && (
          <>
            <p className="text-sm font-semibold">Upload proof of the completed work</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPreview(e.target.files[0] ? URL.createObjectURL(e.target.files[0]) : null)}
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-white"
            />
            {preview && <img src={preview} alt="Preview" className="h-40 w-full rounded-lg object-cover" />}
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do?" />
            <Button disabled={busy || !preview} onClick={resolve}>Mark resolved and notify the citizen</Button>
          </>
        )}

        {report.status === 'RESOLVED_PENDING' && (
          <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-800">Waiting for the citizen to confirm your work.</p>
        )}
      </div>
    </Card>
  );
}
