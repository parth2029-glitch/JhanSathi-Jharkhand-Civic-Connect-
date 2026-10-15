import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Report, User, notify } from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { CATEGORIES, DUPLICATE_RADIUS_M, TRANSITIONS, WARDS, scoreReport } from './config.js';

const UPLOAD_DIR = path.join(import.meta.dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\/(jpe?g|png|webp|heic)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only JPEG, PNG, WebP or HEIC images are allowed')),
});

/** Cloudinary when configured, local disk otherwise, so the demo runs with no accounts. */
async function saveImage(file) {
  if (!file) return undefined;
  if (process.env.CLOUDINARY_URL) {
    const { v2: cloudinary } = await import('cloudinary');
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: 'civic', resource_type: 'image' }, (err, r) => (err ? reject(err) : resolve(r.secure_url)))
        .end(file.buffer);
    });
  }
  const name = `${randomUUID()}${path.extname(file.originalname) || '.jpg'}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

const newComplaintId = () =>
  `CIV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** Recompute the stored priority so officials can sort/filter on it in the database. */
export function applyPriority(report) {
  const { score, level, parts } = scoreReport({
    severity: report.severity,
    supporters: report.supporters?.length || 0,
    createdAt: report.createdAt,
    category: report.category,
    ward: report.ward,
  });
  report.priorityScore = score;
  report.priorityLevel = level;
  report.priorityBreakdown = parts;
  return report;
}

/** Guarded status change + timeline entry. Returns an error string, or null on success. */
function move(report, to, req, note) {
  const allowed = TRANSITIONS[report.status]?.[to];
  if (!allowed) return `Cannot move a report from ${report.status} to ${to}`;
  if (!allowed.includes(req.auth.role)) return `Your role cannot move a report to ${to}`;
  report.status = to;
  report.timeline.push({ status: to, by: req.auth.id, byName: req.auth.name, note });
  return null;
}

const slaFor = (category) => new Date(Date.now() + (CATEGORIES[category]?.slaHours ?? 48) * 3600e3);

async function notifyDepartment(report, title, message, type) {
  const officials = await User.find({ role: 'official', department: report.department }).select('_id');
  await Promise.all(officials.map((o) => notify(o._id, report, title, message, type)));
}

const populated = (q) => q.populate('reporter', 'name ward').populate('assignedWorker', 'name phone');

const router = Router();

/* ---------------------------------------------------------------- creation */

router.post(
  '/',
  requireAuth,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.REPORT_RATE_LIMIT || 20),
    keyGenerator: (req) => req.auth.id,        // per citizen, not per IP — a whole ward can share one
    message: { error: 'Too many reports from this account, please try again later' },
  }),
  upload.single('image'),
  async (req, res) => {
    const { category, description, severity, ward, address } = req.body || {};
    const lng = Number(req.body.lng);
    const lat = Number(req.body.lat);
    if (!CATEGORIES[category]) return res.status(400).json({ error: 'Unknown category' });
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      return res.status(400).json({ error: 'Valid location coordinates are required' });
    }
    if (ward && !WARDS.includes(ward)) return res.status(400).json({ error: 'Unknown ward' });

    const report = new Report({
      complaintId: newComplaintId(),
      reporter: req.auth.id,
      category,
      description: description.trim(),
      severity: Math.min(5, Math.max(1, Number(severity) || 3)),
      ward: ward || (await User.findById(req.auth.id))?.ward,
      address,
      location: { type: 'Point', coordinates: [lng, lat] },
      department: CATEGORIES[category].dept,          // suggested; an official can override
      imageUrl: await saveImage(req.file),
      timeline: [{ status: 'SUBMITTED', by: req.auth.id, byName: req.auth.name }],
    });
    applyPriority(report);
    await report.save();

    await notify(req.auth.id, report, 'Report submitted',
      `${report.complaintId} was sent to ${report.department}.`, 'submitted');
    if (report.priorityLevel === 'High') {
      await notifyDepartment(report, 'New high-priority report',
        `${report.complaintId} (${CATEGORIES[category].label}) scored ${report.priorityScore}.`, 'high_priority');
    }
    res.status(201).json({ report });
  },
);

/* ------------------------------------------------ duplicate detection (§10) */

router.get('/nearby', requireAuth, async (req, res) => {
  const lng = Number(req.query.lng);
  const lat = Number(req.query.lat);
  const radius = Math.min(Number(req.query.radius) || DUPLICATE_RADIUS_M, 2000);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return res.status(400).json({ error: 'lng and lat are required' });
  }
  const query = { status: { $ne: 'CLOSED' } };
  if (req.query.category) query.category = req.query.category;

  const matches = await Report.aggregate([
    { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distance', maxDistance: radius, query, spherical: true } },
    { $limit: 5 },
    { $project: { complaintId: 1, category: 1, description: 1, imageUrl: 1, status: 1, ward: 1, priorityLevel: 1, priorityScore: 1, createdAt: 1, location: 1, distance: { $round: ['$distance', 0] }, supporterCount: { $size: '$supporters' }, mine: { $eq: [{ $toString: '$reporter' }, req.auth.id] }, supported: { $in: [req.auth.id, { $map: { input: '$supporters', as: 's', in: { $toString: '$$s' } } }] } } },
  ]);
  res.json({ radius, matches });
});

/* ------------------------------------------------------------------ listing */

router.get('/', requireAuth, async (req, res) => {
  const { status, category, ward, department, priority, overdue, mine, assigned, q } = req.query;
  const filter = {};
  if (status) filter.status = { $in: String(status).split(',') };
  if (category) filter.category = category;
  if (ward) filter.ward = ward;
  if (department) filter.department = department;
  if (priority) filter.priorityLevel = priority;
  if (overdue === 'true') filter.overdue = true;
  if (mine === 'true') filter.reporter = req.auth.id;
  if (mine === 'supported') filter.supporters = req.auth.id;
  if (assigned === 'true' || req.auth.role === 'worker') filter.assignedWorker = req.auth.id;
  if (q) filter.$or = [{ complaintId: new RegExp(String(q).trim(), 'i') }, { description: new RegExp(String(q).trim(), 'i') }];

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const [reports, total] = await Promise.all([
    populated(Report.find(filter))
      .sort(req.query.sort === 'recent' ? '-createdAt' : '-priorityScore -createdAt')
      .skip(Number(req.query.skip) || 0)
      .limit(limit),
    Report.countDocuments(filter),
  ]);
  res.json({ total, reports });
});

router.get('/:id', requireAuth, async (req, res) => {
  const by = req.params.id.match(/^[0-9a-f]{24}$/i) ? { _id: req.params.id } : { complaintId: req.params.id.toUpperCase() };
  const report = await populated(Report.findOne(by)).populate('timeline.by', 'name role');
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ report });
});

/* ------------------------------------------------------- crowdsourcing (§B) */

router.post('/:id/support', requireAuth, async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status === 'CLOSED') return res.status(409).json({ error: 'This issue is already closed' });
  if (String(report.reporter) === req.auth.id) return res.status(409).json({ error: 'You already reported this issue' });
  if (report.supporters.some((s) => String(s) === req.auth.id)) {
    return res.status(409).json({ error: 'You already support this issue' });
  }
  report.supporters.push(req.auth.id);
  const before = report.priorityLevel;
  applyPriority(report);
  await report.save();

  await notify(report.reporter, report, 'Someone supported your report',
    `${report.complaintId} now has ${report.supporters.length} supporter(s).`, 'support');
  if (before !== 'High' && report.priorityLevel === 'High') {
    await notifyDepartment(report, 'Report escalated to high priority',
      `${report.complaintId} reached ${report.priorityScore} on community support.`, 'high_priority');
  }
  res.json({ report });
});

router.delete('/:id/support', requireAuth, async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  report.supporters = report.supporters.filter((s) => String(s) !== req.auth.id);
  applyPriority(report);
  await report.save();
  res.json({ report });
});

/* --------------------------------------------------- government workflow (§D) */

// Verify / start work / any other guarded status change.
router.patch('/:id', requireAuth, requireRole('official', 'worker'), async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const err = move(report, req.body.status, req, req.body.note);
  if (err) return res.status(409).json({ error: err });

  if (report.status === 'VERIFIED') {
    report.slaDeadline = slaFor(report.category);
    report.overdue = false;
  }
  await report.save();
  await notify(report.reporter, report, `Report ${report.status.replace(/_/g, ' ').toLowerCase()}`,
    `${report.complaintId} is now ${report.status.replace(/_/g, ' ')}.`, 'status');
  res.json({ report });
});

router.patch('/:id/assign', requireAuth, requireRole('official'), async (req, res) => {
  const { department, workerId, note } = req.body || {};
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (department) report.department = department;
  if (workerId) {
    const worker = await User.findOne({ _id: workerId, role: 'worker' });
    if (!worker) return res.status(400).json({ error: 'Unknown field worker' });
    report.assignedWorker = worker._id;
  }
  if (report.status !== 'ASSIGNED') {
    const err = move(report, 'ASSIGNED', req, note || `Assigned to ${report.department}`);
    if (err) return res.status(409).json({ error: err });
  }
  if (!report.slaDeadline) report.slaDeadline = slaFor(report.category);
  await report.save();

  if (report.assignedWorker) {
    await notify(report.assignedWorker, report, 'New work assigned',
      `${report.complaintId} (${CATEGORIES[report.category].label}) is assigned to you.`, 'assigned');
  }
  await notify(report.reporter, report, 'Report assigned',
    `${report.complaintId} was assigned to ${report.department}.`, 'status');
  res.json({ report: await populated(Report.findById(report._id)) });
});

/* ------------------------------------------------ resolution + verification (§E) */

router.patch('/:id/resolve', requireAuth, requireRole('worker', 'official'), upload.single('image'), async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (req.auth.role === 'worker' && String(report.assignedWorker) !== req.auth.id) {
    return res.status(403).json({ error: 'This report is not assigned to you' });
  }
  const imageUrl = await saveImage(req.file);
  if (!imageUrl && !report.resolutionImageUrl) {
    return res.status(400).json({ error: 'A resolution photo is required as evidence' });
  }
  const err = move(report, 'RESOLVED_PENDING', req, req.body.note);
  if (err) return res.status(409).json({ error: err });
  report.resolutionImageUrl = imageUrl || report.resolutionImageUrl;
  report.resolutionNote = req.body.note;
  report.resolvedAt = new Date();
  await report.save();

  await notify(report.reporter, report, 'Please confirm the resolution',
    `Work on ${report.complaintId} is reported complete. Confirm or reject it.`, 'verify_request');
  res.json({ report });
});

router.post('/:id/verify', requireAuth, async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (String(report.reporter) !== req.auth.id && req.auth.role !== 'official') {
    return res.status(403).json({ error: 'Only the citizen who reported this can confirm it' });
  }
  const err = move(report, 'CLOSED', req, req.body?.note || 'Citizen confirmed the resolution');
  if (err) return res.status(409).json({ error: err });
  report.overdue = false;
  await report.save();
  await notifyDepartment(report, 'Complaint closed', `${report.complaintId} was confirmed resolved by the citizen.`, 'closed');
  res.json({ report });
});

router.post('/:id/reopen', requireAuth, async (req, res) => {
  const reason = req.body?.reason?.trim();
  if (!reason) return res.status(400).json({ error: 'Please tell us what is still wrong' });
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (String(report.reporter) !== req.auth.id) {
    return res.status(403).json({ error: 'Only the citizen who reported this can reject the resolution' });
  }
  const err = move(report, 'REOPENED', req, reason);
  if (err) return res.status(409).json({ error: err });
  report.rejectionReason = reason;
  report.resolvedAt = undefined;
  report.slaDeadline = slaFor(report.category);   // fresh clock on reopen
  report.overdue = false;
  await report.save();

  await notifyDepartment(report, 'Citizen rejected the resolution', `${report.complaintId}: ${reason}`, 'reopened');
  if (report.assignedWorker) {
    await notify(report.assignedWorker, report, 'Work reopened', `${report.complaintId}: ${reason}`, 'reopened');
  }
  res.json({ report });
});

export default router;
