/**
 * Definition of Done (PRD §28) as one runnable check: the whole complaint
 * lifecycle over HTTP, with no manual database edits along the way.
 *
 *   node --test        (from server/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, Report, Notification } from './db.js';
import { seed } from './seed.js';
import { app, tick } from './index.js';

let base, server;
const png = new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' });

test.before(async () => {
  await connect();
  await seed();
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => { server?.close(); await disconnect(); });

async function api(path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(base + path, {
    method: form ? (method === 'GET' ? 'POST' : method) : method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
    body: form || (body && JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json() };
}

const login = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: 'password123' } })).body.token;

const reportForm = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append('image', png, 'issue.png');
  return f;
};

test('citizen reports -> duplicate detected -> supported -> resolved -> verified', async (t) => {
  const citizen = await login('citizen@demo.com');
  const neighbour = await login('citizen2@demo.com');
  const official = await login('official@demo.gov');
  const worker = await login('worker@demo.gov');
  const spot = { lng: 85.32, lat: 23.35 };

  await t.test('report is created with photo, location, priority and routed department', async () => {
    const { status, body } = await api('/reports', {
      token: citizen, method: 'POST',
      form: reportForm({ category: 'garbage', description: 'Bin overflowing outside the ward office', severity: 4, ward: 'Ward 1', ...spot }),
    });
    assert.equal(status, 201);
    assert.match(body.report.complaintId, /^CIV-/);
    assert.match(body.report.imageUrl, /^\/uploads\//);
    assert.equal(body.report.department, 'Waste Management');       // §12 routing
    assert.deepEqual(body.report.location.coordinates, [spot.lng, spot.lat]);
    assert.equal(body.report.priorityBreakdown.severity, 40, 'the score is explainable, part by part');
    assert.equal(body.report.priorityScore, 40 + 12 + 5);          // severity + garbage weight + sensitive ward
    t.reportId = body.report._id;
    t.baseScore = body.report.priorityScore;
  });

  await t.test('a nearby report of the same category is offered as a duplicate', async () => {
    const near = await api(`/reports/nearby?lng=${spot.lng + 0.0002}&lat=${spot.lat}&category=garbage`, { token: neighbour });
    assert.equal(near.status, 200);
    assert.equal(near.body.matches[0]._id, t.reportId);
    assert.ok(near.body.matches[0].distance <= 50, 'match is inside the 50 m radius');

    const far = await api(`/reports/nearby?lng=${spot.lng + 0.01}&lat=${spot.lat}&category=garbage`, { token: neighbour });
    assert.equal(far.body.matches.length, 0, 'nothing matches outside the radius');

    const other = await api(`/reports/nearby?lng=${spot.lng}&lat=${spot.lat}&category=pothole`, { token: neighbour });
    assert.equal(other.body.matches.length, 0, 'a different category is not a duplicate');
  });

  await t.test('supporting raises priority, and nobody can support twice', async () => {
    const first = await api(`/reports/${t.reportId}/support`, { token: neighbour, method: 'POST' });
    assert.equal(first.status, 200);
    assert.ok(first.body.report.priorityScore > t.baseScore, 'community support moves the score');

    const again = await api(`/reports/${t.reportId}/support`, { token: neighbour, method: 'POST' });
    assert.equal(again.status, 409);

    const own = await api(`/reports/${t.reportId}/support`, { token: citizen, method: 'POST' });
    assert.equal(own.status, 409, 'the reporter cannot support their own report');
  });

  await t.test('workflow is guarded: no skipping straight to resolved', async () => {
    const skip = await api(`/reports/${t.reportId}`, { token: official, method: 'PATCH', body: { status: 'IN_PROGRESS' } });
    assert.equal(skip.status, 409);
    const byCitizen = await api(`/reports/${t.reportId}`, { token: citizen, method: 'PATCH', body: { status: 'VERIFIED' } });
    assert.equal(byCitizen.status, 403);
  });

  await t.test('official verifies (SLA clock starts) and assigns a field worker', async () => {
    const verified = await api(`/reports/${t.reportId}`, { token: official, method: 'PATCH', body: { status: 'VERIFIED' } });
    assert.equal(verified.body.report.status, 'VERIFIED');
    assert.ok(new Date(verified.body.report.slaDeadline) > new Date(), 'SLA deadline is set on verification');

    const { workers } = (await api('/admin/workers?department=Waste Management', { token: official })).body;
    const assigned = await api(`/reports/${t.reportId}/assign`, {
      token: official, method: 'PATCH', body: { department: 'Waste Management', workerId: workers[0]._id },
    });
    assert.equal(assigned.body.report.status, 'ASSIGNED');
    assert.equal(assigned.body.report.assignedWorker.name, workers[0].name);
  });

  await t.test('worker uploads resolution evidence', async () => {
    await api(`/reports/${t.reportId}`, { token: worker, method: 'PATCH', body: { status: 'IN_PROGRESS' } });
    const noPhoto = await api(`/reports/${t.reportId}/resolve`, { token: worker, method: 'PATCH', form: new FormData() });
    assert.equal(noPhoto.status, 400, 'evidence photo is mandatory');

    const f = new FormData();
    f.append('note', 'Bin emptied and area cleaned');
    f.append('image', png, 'done.png');
    const done = await api(`/reports/${t.reportId}/resolve`, { token: worker, method: 'PATCH', form: f });
    assert.equal(done.body.report.status, 'RESOLVED_PENDING');
    assert.match(done.body.report.resolutionImageUrl, /^\/uploads\//);
  });

  await t.test('citizen rejects -> reopened, then confirms -> closed', async () => {
    const noReason = await api(`/reports/${t.reportId}/reopen`, { token: citizen, method: 'POST', body: {} });
    assert.equal(noReason.status, 400);
    const stranger = await api(`/reports/${t.reportId}/reopen`, { token: neighbour, method: 'POST', body: { reason: 'nope' } });
    assert.equal(stranger.status, 403, 'only the reporter can reject');

    const reopened = await api(`/reports/${t.reportId}/reopen`, { token: citizen, method: 'POST', body: { reason: 'Half the waste is still lying there' } });
    assert.equal(reopened.body.report.status, 'REOPENED');

    await api(`/reports/${t.reportId}`, { token: worker, method: 'PATCH', body: { status: 'IN_PROGRESS' } });
    const f = new FormData();
    f.append('image', png, 'done2.png');
    await api(`/reports/${t.reportId}/resolve`, { token: worker, method: 'PATCH', form: f });

    const closed = await api(`/reports/${t.reportId}/verify`, { token: citizen, method: 'POST', body: {} });
    assert.equal(closed.body.report.status, 'CLOSED');
    assert.deepEqual(
      closed.body.report.timeline.map((e) => e.status),
      ['SUBMITTED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED_PENDING', 'REOPENED', 'IN_PROGRESS', 'RESOLVED_PENDING', 'CLOSED'],
      'the full history is retained',
    );
  });

  await t.test('citizen and official notifications were raised along the way', async () => {
    const mine = await api('/notifications', { token: citizen });
    const types = mine.body.notifications.map((n) => n.type);
    assert.ok(types.includes('submitted') && types.includes('verify_request') && types.includes('support'));
    assert.ok(mine.body.unread > 0);
  });
});

test('overdue complaints are flagged and escalated by the cron tick', async () => {
  const official = await login('official@demo.gov');
  const citizen = await login('citizen@demo.com');
  const created = await api('/reports', {
    token: citizen, method: 'POST',
    form: reportForm({ category: 'waterlogging', description: 'Water standing at the clinic gate', severity: 5, ward: 'Ward 1', lng: 85.31, lat: 23.34 }),
  });
  const id = created.body.report._id;
  assert.equal(created.body.report.priorityLevel, 'High', 'severe waterlogging in a sensitive ward is High');

  await api(`/reports/${id}`, { token: official, method: 'PATCH', body: { status: 'VERIFIED' } });
  await Report.updateOne({ _id: id }, { slaDeadline: new Date(Date.now() - 3600e3) });   // fast-forward the clock

  const { breached } = await tick();
  assert.ok(breached >= 1);
  assert.equal((await Report.findById(id)).overdue, true);

  const breaches = await api('/admin/sla-breaches', { token: official });
  assert.ok(breaches.body.reports.some((r) => r._id === id));
  assert.ok(await Notification.exists({ type: 'sla' }), 'the responsible official was notified');
});

test('dashboard, analytics and hotspots reflect the data', async () => {
  const official = await login('official@demo.gov');
  const dash = (await api('/admin/dashboard', { token: official })).body;
  assert.ok(dash.total >= 9 && dash.closed >= 1 && dash.slaBreached >= 1 && dash.reopened >= 1);

  const stats = (await api('/public/stats')).body;
  assert.ok(stats.resolutionRate > 0 && stats.avgResolutionHours !== null);
  assert.ok(stats.byCategory.some((c) => c.key === 'garbage'));
  assert.ok(stats.byWard.length && stats.byDepartment.some((d) => d.department === 'Waste Management'));
  assert.ok(stats.hotspots.length >= 1, 'the clustered demo garbage reports form a hotspot');
  assert.equal(JSON.stringify(stats).includes('@demo.com'), false, 'no personal data on the public page');
});

test('protected routes reject anonymous and mis-roled callers', async () => {
  assert.equal((await api('/reports')).status, 401);
  assert.equal((await api('/admin/dashboard', { token: await login('citizen@demo.com') })).status, 403);
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: 'citizen@demo.com', password: 'wrong' } })).status, 401);
});
