import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connect, Report, User, notify } from './db.js';
import authRouter from './auth.js';
import reportRouter, { applyPriority } from './reports.js';
import { adminRouter, publicRouter, notificationRouter } from './admin.js';

export const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(import.meta.dirname, 'uploads'), { maxAge: '1d' }));

app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/reports', reportRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/public', publicRouter);
app.use('/api/v1/notifications', notificationRouter);

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : err instanceof SyntaxError ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message });
});

/**
 * One tick does both time-driven jobs: flag SLA breaches and refresh the age
 * component of priority scores.
 * ponytail: full scan of open reports each minute. Fine to five figures of
 * open complaints; add a slaDeadline-indexed cursor if it ever isn't.
 */
export async function tick(now = new Date()) {
  const open = await Report.find({ status: { $nin: ['CLOSED'] } });
  let breached = 0;
  for (const report of open) {
    const before = report.priorityScore;
    applyPriority(report);
    const justBreached = Boolean(report.slaDeadline && report.slaDeadline < now && !report.overdue);
    if (justBreached) {
      report.overdue = true;
      breached++;
    }
    if (justBreached || report.priorityScore !== before) await report.save();
    if (justBreached) {
      const officials = await User.find({ role: 'official', department: report.department }).select('_id');
      await Promise.all(officials.map((o) => notify(o._id, report, 'SLA breached',
        `${report.complaintId} passed its ${report.slaDeadline.toLocaleString()} deadline.`, 'sla')));
    }
  }
  return { checked: open.length, breached };
}

// Only boot when run directly, so tests can import `app` and `tick` untouched.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4000);
  await connect();
  if ((await User.countDocuments()) === 0) {
    const { seed } = await import('./seed.js');
    console.log('Empty database, loading demo data:', await seed());
  }
  cron.schedule('* * * * *', () => tick().catch(console.error));
  app.listen(port, () => console.log(`API on http://localhost:${port}/api/v1`));
}
