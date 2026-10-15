import { useEffect, useState } from 'react';
import { api, CATEGORY_LABELS, DEPARTMENTS, WARDS } from '../api.js';
import {
  Alert, Button, Card, Empty, Evidence, PriorityPill, ReportsMap, STATUS, Stat, StatusPill, Timeline,
  ago, input, label, until, useApi,
} from '../ui.jsx';
import { Analytics, Hotspots } from './PublicStats.jsx';

const BLANK ={ q: '', status: '', category: '', ward: '', priority: '', overdue: '' };

export default function Dashboard() {
  const [tab, setTab] = useState('queue');
  const [filters, setFilters] = useState(BLANK);
  const [selectedId, setSelectedId] = useState(null);

  const overview = useApi(() => api.get('/admin/dashboard').then((r) => r.data));
  const list = useApi(
    () => api.get('/reports', { params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then((r) => r.data),
    [JSON.stringify(filters)],
  );

  const refresh = () => { overview.reload(); list.reload(); };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const o = overview.data || {};

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total reports" value={o.total} />
        <Stat label="Pending review" value={o.pending} />
        <Stat label="In progress" value={o.inProgress} />
        <Stat label="Awaiting citizen" value={o.awaitingCitizen} tone="text-violet-600" />
        <Stat label="High priority" value={o.highPriority} tone="text-rose-600" />
        <Stat label="SLA breached" value={o.slaBreached} tone="text-rose-600" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[['queue', 'Complaint queue'], ['map', 'Map view'], ['analytics', 'Analytics']].map(([key, text]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === key ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {text}
          </button>
        ))}
        {o.slaBreached > 0 && tab === 'queue' && (
          <button
            onClick={() => setFilters({ ...BLANK, overdue: filters.overdue ? '' : 'true' })}
            className={`ml-auto rounded-lg px-3 py-2 text-sm font-semibold ${filters.overdue ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
          >
            {o.slaBreached} SLA breach{o.slaBreached > 1 ? 'es' : ''}
          </button>
        )}
      </div>

      <Alert>{overview.error || list.error}</Alert>

      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'map' && (
        <Card className="overflow-hidden p-0">
          <div className="h-[32rem]"><ReportsMap reports={list.data?.reports || []} onSelect={(r) => { setSelectedId(r._id); setTab('queue'); }} /></div>
        </Card>
      )}

      {tab === 'queue' && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              <input className={input} placeholder="Search ID or text" value={filters.q} onChange={set('q')} />
              <select className={input} value={filters.status} onChange={set('status')}>
                <option value="">All statuses</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className={input} value={filters.priority} onChange={set('priority')}>
                <option value="">All priorities</option>
                {['High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <select className={input} value={filters.category} onChange={set('category')}>
                <option value="">All categories</option>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className={input} value={filters.ward} onChange={set('ward')}>
                <option value="">All wards</option>
                {WARDS.map((w) => <option key={w}>{w}</option>)}
              </select>
              <Button variant="ghost" onClick={() => setFilters(BLANK)}>Clear filters</Button>
            </Card>

            <p className="text-xs text-slate-500">
              {list.loading ? 'Loading…' : `${list.data?.total ?? 0} complaints, highest priority first`}
            </p>

            {list.data?.reports.length === 0 && <Empty>No complaints match these filters.</Empty>}
            {list.data?.reports.map((r) => (
              <button key={r._id} onClick={() => setSelectedId(r._id)} className="block w-full text-left">
                <Card className={`p-3 transition hover:border-emerald-400 ${selectedId === r._id ? 'border-emerald-500 ring-2 ring-emerald-100' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{r.complaintId}</span>
                    <PriorityPill report={r} />
                    <StatusPill status={r.status} />
                    {r.overdue && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">Overdue</span>}
                    <span className="ml-auto text-xs text-slate-500">{ago(r.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium">{label(r.category)} · {r.ward || 'Ward unknown'}</div>
                  <p className="line-clamp-1 text-sm text-slate-500">{r.description}</p>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.department} · {r.supporters?.length || 0} supporter(s)
                    {r.slaDeadline && r.status !== 'CLOSED' && ` · SLA ${until(r.slaDeadline)}`}
                  </div>
                </Card>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-4">
              {selectedId ? <Detail id={selectedId} onChange={refresh} onClose={() => setSelectedId(null)} />
                : <Empty>Select a complaint to review, assign and track it.</Empty>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const AnalyticsTab = () => {
  const { data, error } = useApi(() => api.get('/public/stats').then((r) => r.data));
  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Resolution rate" value={`${data.resolutionRate}%`} />
            <Stat label="Average resolution time" value={data.avgResolutionHours ? `${data.avgResolutionHours} h` : '—'} />
            <Stat label="Civic hotspots" value={data.hotspots.length} tone="text-rose-600" />
          </div>
          <Analytics stats={data} />
          <Hotspots hotspots={data.hotspots} />
        </>
      )}
    </div>
  );
};

function Detail({ id, onChange, onClose }) {
  const { data, loading, error, reload } = useApi(() => api.get(`/reports/${id}`).then((r) => r.data.report), [id]);
  const [department, setDepartment] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [workers, setWorkers] = useState([]);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const report = data;

  useEffect(() => { if (report) setDepartment(report.department || ''); }, [report?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!department) return;
    setWorkerId('');
    api.get('/admin/workers', { params: { department } }).then(({ data }) => setWorkers(data.workers)).catch(() => setWorkers([]));
  }, [department]);

  const act = (fn) => async () => {
    setBusy(true);
    setActionError('');
    try {
      await fn();
      reload();
      onChange();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Card className="p-4 text-sm text-slate-500">Loading…</Card>;
  if (error || !report) return <Card className="p-4"><Alert>{error || 'Not found'}</Alert></Card>;

  const canAssign = ['VERIFIED', 'ASSIGNED', 'REOPENED'].includes(report.status);

  return (
    <Card className="max-h-[calc(100vh-2rem)] space-y-4 overflow-auto p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold">{report.complaintId}</span>
        <StatusPill status={report.status} />
        <button onClick={onClose} className="ml-auto text-sm text-slate-400 hover:text-slate-700">✕</button>
      </div>

      <div>
        <div className="text-sm font-semibold">{label(report.category)}</div>
        <p className="mt-1 text-sm text-slate-600">{report.description}</p>
        <p className="mt-1 text-xs text-slate-500">
          {report.ward || 'Ward unknown'}{report.address && ` · ${report.address}`} · reported by {report.reporter?.name} {ago(report.createdAt)}
        </p>
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <PriorityPill report={report} />
          <span className="text-xs text-slate-500">why this score:</span>
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-600">
          {Object.entries(report.priorityBreakdown || {}).map(([k, v]) => (
            <li key={k} className="flex justify-between border-b border-slate-200 pb-0.5">
              <span className="capitalize">{k}</span><span className="font-semibold">+{v}</span>
            </li>
          ))}
          <li className="flex justify-between pb-0.5"><span>Supporters</span><span className="font-semibold">{report.supporters?.length || 0}</span></li>
        </ul>
      </div>

      {report.slaDeadline && (
        <div className={`rounded-lg p-3 text-sm ${report.overdue ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-800'}`}>
          <b>SLA:</b> {new Date(report.slaDeadline).toLocaleString()} · {until(report.slaDeadline)}
          {report.overdue && ' — escalated to the department.'}
        </div>
      )}

      <div className="h-48 overflow-hidden rounded-xl">
        <ReportsMap reports={[report]} center={{ lat: report.location.coordinates[1], lng: report.location.coordinates[0] }} />
      </div>

      <Evidence report={report} />
      {report.rejectionReason && (
        <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700"><b>Citizen rejected:</b> {report.rejectionReason}</p>
      )}

      <Alert>{actionError}</Alert>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        {report.status === 'SUBMITTED' && (
          <Button className="w-full" disabled={busy} onClick={act(() => api.patch(`/reports/${report._id}`, { status: 'VERIFIED' }))}>
            Verify report and start the SLA clock
          </Button>
        )}

        {canAssign && (
          <>
            <select className={input} value={department} onChange={(e) => setDepartment(e.target.value)}>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className={input} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Select a field worker…</option>
              {workers.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>
            <Button className="w-full" disabled={busy || !workerId}
              onClick={act(() => api.patch(`/reports/${report._id}/assign`, { department, workerId }))}>
              {report.status === 'ASSIGNED' ? 'Reassign' : 'Assign'} to {department}
            </Button>
            {report.assignedWorker && (
              <p className="text-xs text-slate-500">Currently with {report.assignedWorker.name}{report.assignedWorker.phone && ` · ${report.assignedWorker.phone}`}</p>
            )}
          </>
        )}

        {report.status === 'RESOLVED_PENDING' && (
          <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-800">
            Evidence uploaded. Waiting for {report.reporter?.name} to confirm or reject the fix.
          </p>
        )}
        {report.status === 'CLOSED' && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Citizen confirmed this was resolved.</p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <h4 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">Complaint timeline</h4>
        <Timeline report={report} />
      </div>
    </Card>
  );
}
