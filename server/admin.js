import { Router } from 'express';
import { Report, User, Notification } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { CATEGORIES } from './config.js';

const CLOSED = ['CLOSED'];
const OPEN = { $nin: CLOSED };
const HOTSPOT_MIN = Number(process.env.HOTSPOT_MIN || 3);

const resolutionHours = { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] };

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('official'));

adminRouter.get('/dashboard', async (_req, res) => {
  const [byStatus, high, breached, total] = await Promise.all([
    Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Report.countDocuments({ priorityLevel: 'High', status: OPEN }),
    Report.countDocuments({ overdue: true, status: OPEN }),
    Report.countDocuments({}),
  ]);
  const s = Object.fromEntries(byStatus.map((r) => [r._id, r.n]));
  res.json({
    total,
    pending: (s.SUBMITTED || 0) + (s.VERIFIED || 0),
    inProgress: (s.ASSIGNED || 0) + (s.IN_PROGRESS || 0) + (s.REOPENED || 0),
    awaitingCitizen: s.RESOLVED_PENDING || 0,
    closed: s.CLOSED || 0,
    reopened: await Report.countDocuments({ 'timeline.status': 'REOPENED' }),
    highPriority: high,
    slaBreached: breached,
    byStatus: s,
  });
});

adminRouter.get('/analytics', async (_req, res) => res.json(await analytics()));

adminRouter.get('/sla-breaches', async (_req, res) => {
  const reports = await Report.find({ overdue: true, status: OPEN })
    .populate('assignedWorker', 'name')
    .sort('slaDeadline')
    .limit(100);
  res.json({ total: reports.length, reports });
});

adminRouter.get('/hotspots', async (_req, res) => res.json(await hotspots()));

// Field workers available for assignment.
adminRouter.get('/workers', async (req, res) => {
  const filter = { role: 'worker' };
  if (req.query.department) filter.department = req.query.department;
  res.json({ workers: await User.find(filter).select('name department phone ward').sort('name') });
});

/* ---------------------------------------------------------- shared queries */

async function analytics() {
  const [byCategory, byStatus, byWard, byDepartment, avg] = await Promise.all([
    Report.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Report.aggregate([
      { $group: { _id: '$ward', total: { $sum: 1 }, resolved: { $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] } } } },
      { $sort: { total: -1 } },
    ]),
    Report.aggregate([
      { $group: {
        _id: '$department',
        total: { $sum: 1 },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] } },
        avgHours: { $avg: { $cond: [{ $ifNull: ['$resolvedAt', false] }, resolutionHours, null] } },
      } },
      { $sort: { total: -1 } },
    ]),
    Report.aggregate([
      { $match: { resolvedAt: { $ne: null } } },
      { $group: { _id: null, avgHours: { $avg: resolutionHours } } },
    ]),
  ]);
  return {
    byCategory: byCategory.map((c) => ({ key: c._id, label: CATEGORIES[c._id]?.label || c._id, n: c.n })),
    byStatus: byStatus.map((s) => ({ status: s._id, n: s.n })),
    byWard: byWard.filter((w) => w._id).map((w) => ({ ward: w._id, total: w.total, resolved: w.resolved })),
    byDepartment: byDepartment.filter((d) => d._id).map((d) => ({
      department: d._id, total: d.total, resolved: d.resolved,
      rate: d.total ? Math.round((d.resolved / d.total) * 100) : 0,
      avgHours: d.avgHours ? Math.round(d.avgHours * 10) / 10 : null,
    })),
    avgResolutionHours: avg[0]?.avgHours ? Math.round(avg[0].avgHours * 10) / 10 : null,
  };
}

/**
 * Hotspots by aggregation only: bucket open reports into ~110m grid cells and
 * flag any cell with repeat complaints.
 * ponytail: 3-decimal rounding is a fixed grid, not real clustering. Swap in
 * DBSCAN/$geoWithin polygons if wards ever need precise boundaries.
 */
async function hotspots() {
  const cells = await Report.aggregate([
    { $match: { status: OPEN } },
    { $group: {
      _id: {
        lng: { $round: [{ $arrayElemAt: ['$location.coordinates', 0] }, 3] },
        lat: { $round: [{ $arrayElemAt: ['$location.coordinates', 1] }, 3] },
      },
      count: { $sum: 1 },
      ward: { $first: '$ward' },
      categories: { $addToSet: '$category' },
    } },
    { $match: { count: { $gte: HOTSPOT_MIN } } },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ]);
  return {
    threshold: HOTSPOT_MIN,
    hotspots: cells.map((c) => ({ lng: c._id.lng, lat: c._id.lat, count: c.count, ward: c.ward, categories: c.categories })),
  };
}

/* ------------------------------------------- public accountability page (§20) */

export const publicRouter = Router();

publicRouter.get('/stats', async (_req, res) => {
  const [total, resolved, a, h] = await Promise.all([
    Report.countDocuments({}),
    Report.countDocuments({ status: 'CLOSED' }),
    analytics(),
    hotspots(),
  ]);
  res.json({
    total,
    resolved,
    resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
    avgResolutionHours: a.avgResolutionHours,
    byCategory: a.byCategory,
    byStatus: a.byStatus,
    byWard: a.byWard,
    byDepartment: a.byDepartment,
    hotspots: h.hotspots,
  });
});

/* ------------------------------------------------- in-app notifications (§18) */

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get('/', async (req, res) => {
  const [notifications, unread] = await Promise.all([
    Notification.find({ user: req.auth.id }).sort('-createdAt').limit(50),
    Notification.countDocuments({ user: req.auth.id, read: false }),
  ]);
  res.json({ unread, notifications });
});

notificationRouter.patch('/read', async (req, res) => {
  const filter = { user: req.auth.id, read: false };
  if (req.body?.id) filter._id = req.body.id;
  await Notification.updateMany(filter, { read: true });
  res.json({ ok: true });
});
