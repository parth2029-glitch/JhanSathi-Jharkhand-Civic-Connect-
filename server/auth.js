import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from './db.js';
import { WARDS } from './config.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TTL = '7d';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.auth = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.auth?.role) ? next() : res.status(403).json({ error: 'Forbidden' });

const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name, department: u.department }, SECRET, { expiresIn: TTL });

const router = Router();

router.post('/register', async (req, res) => {
  const { name, email, password, phone, ward } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (ward && !WARDS.includes(ward)) return res.status(400).json({ error: 'Unknown ward' });
  if (await User.exists({ email: String(email).toLowerCase() })) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  // Self-service signup is citizen-only; official/worker accounts come from the seed script.
  const user = await User.create({
    name, email, phone, ward, role: 'citizen',
    passwordHash: await bcrypt.hash(password, 10),
  });
  res.status(201).json({ token: sign(user), user });
});

// Credential stuffing guard. Successful sign-ins do not count against it.
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed sign-in attempts, please try again later' },
});

router.post('/login', loginLimit, async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: sign(user), user });
});

// Stateless JWT: logout is a client-side token drop. Endpoint exists so the client has one call.
router.post('/logout', (_req, res) => res.json({ ok: true }));

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.auth.id);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

export default router;
