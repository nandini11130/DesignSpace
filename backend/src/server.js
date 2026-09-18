import cors from 'cors';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

const JWT_SECRET = process.env.JWT_SECRET || 'designspace-secret';
const PORT = Number(process.env.PORT) || 4000;
const users = new Map();
const otpStore = new Map();
const teams = new Map();

const teamSeed = {
  'team-1': {
    id: 'team-1',
    name: 'Product Launch',
    members: ['alex@designspace.io', 'nina@designspace.io', 'you@designspace.io'],
    activity: [
      { user: 'alex@designspace.io', action: 'updated sprint scope' },
      { user: 'nina@designspace.io', action: 'uploaded campaign mockups' },
    ],
  },
};

for (const [id, team] of Object.entries(teamSeed)) {
  teams.set(id, team);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'member',
    createdAt: user.createdAt,
  };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  if (!storedValue) return false;
  const [salt, hash] = storedValue.split(':');
  if (!salt || !hash) return false;
  const candidateHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(hash, 'hex'));
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: 'DesignSpace backend is live' });
  });

  app.post('/api/auth/signup', (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (users.has(normalizedEmail)) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const user = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashPassword(String(password)),
      role: 'member',
      createdAt: new Date().toISOString(),
    };

    users.set(normalizedEmail, user);
    const token = createToken(user);
    return res.status(201).json({ message: 'User registered successfully.', token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = users.get(normalizedEmail);
    if (!user || !verifyPassword(String(password), user.password)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = createToken(user);
    return res.json({ message: 'Login successful.', token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/send-otp', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const otp = generateOtp();
    otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    return res.json({ message: 'OTP sent successfully.', otp });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const otp = String(req.body?.otp ?? '');

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    const currentOtp = otpStore.get(email);
    if (!currentOtp) {
      return res.status(401).json({ message: 'OTP not found or expired.' });
    }

    if (Date.now() > currentOtp.expiresAt) {
      otpStore.delete(email);
      return res.status(401).json({ message: 'OTP expired.' });
    }

    if (currentOtp.otp !== otp) {
      return res.status(401).json({ message: 'Invalid OTP.' });
    }

    otpStore.delete(email);

    const user = users.get(email) ?? {
      id: crypto.randomUUID(),
      name: email.split('@')[0],
      email,
      password: hashPassword('otp-login'),
      role: 'member',
      createdAt: new Date().toISOString(),
    };

    users.set(email, user);
    const token = createToken(user);
    return res.json({ message: 'OTP verified successfully.', token, user: sanitizeUser(user) });
  });

  app.get('/api/teams/:teamId', (req, res) => {
    const team = teams.get(req.params.teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    return res.json({ team });
  });

  app.post('/api/teams', (req, res) => {
    const { name, memberEmail } = req.body ?? {};
    const id = `team-${Date.now()}`;
    const team = {
      id,
      name: name || 'New Team',
      members: memberEmail ? [memberEmail] : [],
      activity: [{ user: memberEmail || 'system', action: 'created the workspace' }],
    };

    teams.set(id, team);
    return res.status(201).json({ team });
  });

  io.on('connection', (socket) => {
    socket.on('team:join', ({ teamId } = {}) => {
      if (!teamId) return;
      socket.join(teamId);
      socket.emit('team:joined', { teamId, ok: true });
    });

    socket.on('team:message', ({ teamId, user, text } = {}) => {
      if (!teamId || !text) return;
      io.to(teamId).emit('team:message', {
        teamId,
        user: user || 'anonymous',
        text,
        sentAt: new Date().toISOString(),
      });
    });
  });

  return { app, server: httpServer, io };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const { server } = createApp();
  server.listen(PORT, () => {
    console.log(`DesignSpace backend listening on http://localhost:${PORT}`);
  });
}

export { createApp };
