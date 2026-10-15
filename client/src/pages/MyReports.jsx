import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Button, Card, Empty, Evidence, PriorityPill, StatusPill, Timeline, ago, input, label, until, useApi } from '../ui.jsx';

const TABS = [
  ['mine', 'My reports'],
  ['supported', 'Issues I support'],
];

export default function MyReports() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'supported' ? 'supported' : 'mine';
  const { data, loading, error, reload } = useApi(
    () => api.get('/reports', { params: { mine: tab === 'mine' ? 'true' : 'supported', sort: 'recent' } }).then((r) => r.data),
    [tab],
  );

  const reports = data?.reports || [];
  const open = reports.filter((r) => r.status !== 'CLOSED');
  const done = reports.filter((r) => r.status === 'CLOSED');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([key, text]) => (
          <button
            key={key}
            onClick={() => setParams(key === 'mine' ? {} : { tab: key })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {text}
          </button>
        ))}
        <Link to="/report" className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Report an issue
        </Link>
      </div>

      <Alert>{error}</Alert>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && reports.length === 0 && (
        <Empty>
          {tab === 'mine' ? 'You have not reported anything yet.' : 'You have not supported any nearby issue yet.'}
        </Empty>
      )}

      {[['Active', open], ['Closed', done]].map(([heading, list]) =>
        list.length ? (
          <section key={heading} className="space-y-3">
            <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">{heading} ({list.length})</h2>
            {list.map((r) => <ReportCard key={r._id} report={r} onChange={reload} highlight={params.get('highlight') === r._id} />)}
          </section>
        ) : null,
      )}
    </div>
  );
}

function ReportCard({ report, onChange, highlight }) {
  const [open, setOpen] = useState(highlight);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
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

  const awaitingMe = report.status === 'RESOLVED_PENDING';

  return (
    <Card className={highlight ? 'ring-2 ring-emerald-400' : ''}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
        <span className="font-mono text-sm font-semibold">{report.complaintId}</span>
        <StatusPill status={report.status} />
        <PriorityPill report={report} />
        {report.overdue && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">SLA breached</span>}
        <span className="ml-auto text-xs text-slate-500">{ago(report.createdAt)}</span>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="text-sm font-semibold">{label(report.category)}</div>
          <p className="mt-1 text-sm text-slate-600">{report.description}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
            <div><dt className="inline font-medium">Department: </dt><dd className="inline">{report.department}</dd></div>
            <div><dt className="inline font-medium">Ward: </dt><dd className="inline">{report.ward || '—'}</dd></div>
            <div><dt className="inline font-medium">Supporters: </dt><dd className="inline">{report.supporters?.length || 0}</dd></div>
            {report.slaDeadline && report.status !== 'CLOSED' && (
              <div><dt className="inline font-medium">SLA: </dt><dd className={`inline ${report.overdue ? 'font-semibold text-rose-600' : ''}`}>{until(report.slaDeadline)}</dd></div>
            )}
          </dl>
        </div>
        {report.imageUrl && <img src={report.imageUrl} alt="" className="h-24 w-32 rounded-lg object-cover" />}
      </div>

      {awaitingMe && (
        <div className="border-t border-slate-100 bg-violet-50 p-4">
          <h3 className="text-sm font-bold text-violet-900">Was this actually fixed?</h3>
          <p className="mt-1 mb-3 text-sm text-violet-800">
            {report.resolutionNote || 'The department has marked this complete and uploaded evidence.'}
          </p>
          <Evidence report={report} />
          <Alert>{error}</Alert>
          {rejecting ? (
            <div className="mt-3 space-y-2">
              <textarea className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="What is still wrong?" />
              <div className="flex gap-2">
                <Button variant="danger" disabled={busy || !reason.trim()} onClick={act(() => api.post(`/reports/${report._id}/reopen`, { reason }))}>
                  Reopen complaint
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button disabled={busy} onClick={act(() => api.post(`/reports/${report._id}/verify`))}>Yes, confirm resolved</Button>
              <Button variant="ghost" onClick={() => setRejecting(true)}>No, it is not fixed</Button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 p-4">
        <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-emerald-700 hover:underline">
          {open ? 'Hide' : 'Show'} full timeline
        </button>
        {open && (
          <div className="mt-3 space-y-4">
            <Timeline report={report} />
            {(report.imageUrl || report.resolutionImageUrl) && !awaitingMe && <Evidence report={report} />}
            {report.rejectionReason && (
              <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">You reported: {report.rejectionReason}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
