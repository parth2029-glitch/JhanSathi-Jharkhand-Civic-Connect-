import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api.js';
import { Alert, Card, Empty, ReportsMap, STATUS, Stat, useApi } from '../ui.jsx';

const STATUS_COLOR = {
  SUBMITTED: '#94a3b8', VERIFIED: '#0ea5e9', ASSIGNED: '#6366f1', IN_PROGRESS: '#f59e0b',
  RESOLVED_PENDING: '#8b5cf6', CLOSED: '#10b981', REOPENED: '#f43f5e',
};

const Panel = ({ title, subtitle, children, className = '' }) => (
  <Card className={`p-4 ${className}`}>
    <h3 className="text-sm font-bold">{title}</h3>
    {subtitle && <p className="mb-2 text-xs text-slate-500">{subtitle}</p>}
    <div className="h-64">{children}</div>
  </Card>
);

const axis = { tick: { fontSize: 11, fill: '#64748b' }, stroke: '#cbd5e1' };

/** Shared by the public transparency page and the government analytics tab. */
export function Analytics({ stats }) {
  if (!stats) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Issues by category" subtitle="Where citizens are reporting the most problems">
        <ResponsiveContainer>
          <BarChart data={stats.byCategory} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axis} />
            <YAxis type="category" dataKey="label" width={130} {...axis} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="n" name="Reports" fill="#059669" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Resolution status" subtitle="How the current complaint load is split">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={stats.byStatus} dataKey="n" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {stats.byStatus.map((s) => <Cell key={s.status} fill={STATUS_COLOR[s.status] || '#94a3b8'} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [v, STATUS[n]?.label || n]} />
            <Legend formatter={(n) => STATUS[n]?.label || n} wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Ward-wise complaint volume" subtitle="Reported against resolved, by ward">
        <ResponsiveContainer>
          <BarChart data={stats.byWard}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ward" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="total" name="Reported" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Department resolution rate" subtitle="Percentage of complaints closed, per department">
        <ResponsiveContainer>
          <BarChart data={stats.byDepartment} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} unit="%" {...axis} />
            <YAxis type="category" dataKey="department" width={130} {...axis} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v, _n, p) => [`${v}%  (${p.payload.resolved}/${p.payload.total})`, 'Resolved']} />
            <Bar dataKey="rate" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

export function Hotspots({ hotspots }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="p-4">
        <h3 className="text-sm font-bold">Civic hotspots</h3>
        <p className="text-xs text-slate-500">
          Areas where several open complaints cluster together. {hotspots.length ? '' : 'None right now.'}
        </p>
      </div>
      <div className="h-80"><ReportsMap hotspots={hotspots} /></div>
    </Card>
  );
}

export default function PublicStats() {
  const { data: stats, loading, error } = useApi(() => api.get('/public/stats').then((r) => r.data));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Public accountability</h1>
        <p className="text-sm text-slate-500">
          Aggregate civic data, open to everyone. No personal or internal government information is published here.
        </p>
      </div>

      <Alert>{error}</Alert>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Issues reported" value={stats.total} />
            <Stat label="Issues resolved" value={stats.resolved} tone="text-emerald-600" />
            <Stat label="Resolution rate" value={`${stats.resolutionRate}%`} />
            <Stat label="Average resolution time" value={stats.avgResolutionHours ? `${stats.avgResolutionHours} h` : '—'} />
          </div>
          {stats.total === 0 ? <Empty>No civic issues have been reported yet.</Empty> : <Analytics stats={stats} />}
          <Hotspots hotspots={stats.hotspots} />
        </>
      )}
    </div>
  );
}
