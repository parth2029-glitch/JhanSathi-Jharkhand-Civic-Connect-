import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { connect, disconnect, User, Report, Department, Notification } from './db.js';
import { CATEGORIES, WARDS } from './config.js';
import { applyPriority } from './reports.js';

const PASSWORD = 'password123';
// Ranchi, Jharkhand. Sits mid-cell for the hotspot grid so the clustered demo
// reports below land in one bucket instead of straddling a rounding boundary.
const [LNG, LAT] = [85.31, 23.344];
const jitter = (m) => (m / 111320) * (Math.random() * 2 - 1);

const STAFF = [
  { name: 'Priya Sharma',  email: 'official@demo.gov', role: 'official', department: 'Waste Management' },
  { name: 'Anil Kumar',    email: 'roads@demo.gov',    role: 'official', department: 'Roads' },
  { name: 'Sunita Devi',   email: 'drainage@demo.gov', role: 'official', department: 'Drainage' },
  { name: 'Ramesh Oraon',  email: 'worker@demo.gov',   role: 'worker',   department: 'Waste Management' },
  { name: 'Vikash Mahto',  email: 'worker2@demo.gov',  role: 'worker',   department: 'Roads' },
];

const DEMO_REPORTS = [
  { category: 'garbage',      severity: 4, offset: [0, 0],           description: 'Overflowing community bin near the market gate, waste spilling onto the footpath.' },
  { category: 'garbage',      severity: 3, offset: [30, 20],         description: 'Same bin area — garbage not collected for four days now.' },
  { category: 'garbage',      severity: 4, offset: [-20, 40],        description: 'Stray dogs tearing open garbage bags outside the school wall.' },
  { category: 'pothole',      severity: 5, offset: [400, -250],      description: 'Deep pothole at the crossing, two-wheelers skidding every evening.' },
  { category: 'waterlogging', severity: 5, offset: [-600, 300],      description: 'Knee-deep water in front of the clinic entrance after last night rain.' },
  { category: 'streetlight',  severity: 2, offset: [250, 700],       description: 'Three streetlights out on the lane behind the bus stand.' },
  { category: 'water_leak',   severity: 4, offset: [-350, -500],     description: 'Main pipeline leaking continuously, road is always wet.' },
  { category: 'tree',         severity: 3, offset: [800, 150],       description: 'Large branch hanging over the electric line, likely to fall.' },
];

export async function seed() {
  await Promise.all([User.deleteMany({}), Report.deleteMany({}), Department.deleteMany({}), Notification.deleteMany({})]);

  const byDept = {};
  for (const [key, c] of Object.entries(CATEGORIES)) (byDept[c.dept] ??= []).push(key);
  await Department.insertMany(
    Object.entries(byDept).map(([name, categories]) => ({
      name,
      categories,
      defaultSlaHours: Math.min(...categories.map((k) => CATEGORIES[k].slaHours)),
    })),
  );

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const staff = await User.insertMany(STAFF.map((s, i) => ({ ...s, passwordHash, ward: WARDS[i % WARDS.length] })));
  const citizens = await User.insertMany(
    ['Aarti Kujur', 'Deepak Singh', 'Neha Toppo', 'Manoj Verma'].map((name, i) => ({
      name,
      email: i === 0 ? 'citizen@demo.com' : `citizen${i + 1}@demo.com`,
      passwordHash,
      role: 'citizen',
      ward: WARDS[i],
    })),
  );

  for (const [i, r] of DEMO_REPORTS.entries()) {
    const reporter = citizens[i % citizens.length];
    const report = new Report({
      complaintId: `CIV-DEMO-${String(i + 1).padStart(3, '0')}`,
      reporter: reporter._id,
      category: r.category,
      description: r.description,
      severity: r.severity,
      ward: reporter.ward,
      location: { type: 'Point', coordinates: [LNG + r.offset[0] / 102000 + jitter(8), LAT + r.offset[1] / 111320 + jitter(8)] },
      department: CATEGORIES[r.category].dept,
      supporters: citizens.filter((c) => !c._id.equals(reporter._id)).slice(0, i % 4).map((c) => c._id),
      createdAt: new Date(Date.now() - i * 6 * 3600e3),
      timeline: [{ status: 'SUBMITTED', by: reporter._id, byName: reporter.name, at: new Date(Date.now() - i * 6 * 3600e3) }],
    });
    applyPriority(report);
    await report.save();
  }

  return { staff: staff.length, citizens: citizens.length, reports: DEMO_REPORTS.length, password: PASSWORD };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await connect();
  const out = await seed();
  console.log('Seeded:', out);
  console.log(`Login with official@demo.gov / worker@demo.gov / citizen@demo.com — password: ${PASSWORD}`);
  await disconnect();
}
