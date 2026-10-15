// Single source of truth for categories -> department routing, priority weight and SLA.
// Government can tune these without touching application code.

export const CATEGORIES = {
  garbage:        { label: 'Garbage / Waste',               dept: 'Waste Management', weight: 12, slaHours: 24 },
  pothole:        { label: 'Pothole / Road Damage',         dept: 'Roads',            weight: 14, slaHours: 72 },
  water_leak:     { label: 'Water Leakage',                 dept: 'Water',            weight: 16, slaHours: 24 },
  drainage:       { label: 'Drainage',                      dept: 'Drainage',         weight: 14, slaHours: 48 },
  waterlogging:   { label: 'Waterlogging',                  dept: 'Drainage',         weight: 20, slaHours: 12 },
  streetlight:    { label: 'Streetlight',                   dept: 'Electrical',       weight: 10, slaHours: 72 },
  dumping:        { label: 'Illegal Dumping',               dept: 'Waste Management', weight: 14, slaHours: 48 },
  pollution:      { label: 'Pollution',                     dept: 'Environment',      weight: 16, slaHours: 48 },
  infrastructure: { label: 'Damaged Public Infrastructure', dept: 'Public Works',     weight: 14, slaHours: 72 },
  tree:           { label: 'Tree / Green Area Issue',       dept: 'Environment',      weight: 8,  slaHours: 72 },
  other:          { label: 'Other',                         dept: 'Public Works',     weight: 6,  slaHours: 72 },
};

export const WARDS = Array.from({ length: 12 }, (_, i) => `Ward ${i + 1}`);

export const DUPLICATE_RADIUS_M = Number(process.env.DUPLICATE_RADIUS_M || 50);

// Wards where issues carry extra urgency (hospitals, schools, markets).
export const SENSITIVE_WARDS = (process.env.SENSITIVE_WARDS || 'Ward 1,Ward 4').split(',');

export const STATUSES = [
  'SUBMITTED', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED_PENDING', 'CLOSED', 'REOPENED',
];

// Who may move a report from X to Y.
export const TRANSITIONS = {
  SUBMITTED:        { VERIFIED: ['official'] },
  VERIFIED:         { ASSIGNED: ['official'] },
  ASSIGNED:         { IN_PROGRESS: ['official', 'worker'] },
  IN_PROGRESS:      { RESOLVED_PENDING: ['official', 'worker'] },
  RESOLVED_PENDING: { CLOSED: ['citizen', 'official'], REOPENED: ['citizen'] },
  REOPENED:         { ASSIGNED: ['official'], IN_PROGRESS: ['official', 'worker'] },
  CLOSED:           {},
};

/**
 * Explainable 0-100 priority. Every input is visible to the official, so a
 * "why is this High?" question always has a straight answer.
 */
export function scoreReport({ severity = 3, supporters = 0, createdAt = new Date(), category, ward }) {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  // Severity is weighted so a genuinely urgent report is High the moment it
  // lands; community support and age can lift a routine one over the line too.
  const parts = {
    severity: Math.min(severity, 5) * 10,                      // 10-50
    community: Math.min(supporters * 5, 20),                   // 0-20
    age: Math.min(Math.floor(ageDays) * 3, 10),                // 0-10
    category: CATEGORIES[category]?.weight ?? 6,               // 6-20
  };
  if (SENSITIVE_WARDS.includes(ward)) parts.location = 5;
  const score = Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0));
  return { score, level: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low', parts };
}
