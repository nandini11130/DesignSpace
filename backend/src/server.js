import cors from 'cors';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { Server } from 'socket.io';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'designspace-secret');
const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177').split(',').map((origin) => origin.trim()).filter(Boolean);
const SMTP_PROVIDER = String(process.env.SMTP_PROVIDER || 'custom').toLowerCase();
const SMTP_PROVIDER_DEFAULTS = {
  custom: {
    host: 'mail.guerrillamailblock.com',
    port: 587,
    user: 'csgfluql@guerrillamailblock.com',
    pass: 'oe4nn0ju7es7sm22ub9dtvieok',
  },
  sendgrid: {
    host: 'smtp.sendgrid.net',
    port: 587,
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY || '',
  },
  resend: {
    host: 'smtp.resend.com',
    port: 587,
    user: 'resend',
    pass: process.env.RESEND_API_KEY || '',
  },
  mailgun: {
    host: 'smtp.mailgun.org',
    port: 587,
    user: process.env.MAILGUN_SMTP_LOGIN || '',
    pass: process.env.MAILGUN_SMTP_PASSWORD || '',
  },
  gmail: {
    host: 'smtp.gmail.com',
    port: 587,
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || '',
  },
};

const providerDefaults = SMTP_PROVIDER_DEFAULTS[SMTP_PROVIDER] || SMTP_PROVIDER_DEFAULTS.custom;
const SMTP_HOST = process.env.SMTP_HOST || providerDefaults.host;
const SMTP_PORT = Number(process.env.SMTP_PORT || providerDefaults.port);
const SMTP_USER = process.env.SMTP_USER || providerDefaults.user || 'csgfluql@guerrillamailblock.com';
const SMTP_PASS = process.env.SMTP_PASS || providerDefaults.pass || 'oe4nn0ju7es7sm22ub9dtvieok';
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'designspace.db');

if (isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production. Set it in your environment variables.');
}

if (isProduction && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) {
  throw new Error('SMTP credentials are required in production. Configure SMTP_HOST, SMTP_USER, and SMTP_PASS.');
}

const otpStore = new Map();
const teams = new Map();

class JsonDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.state = { users: [] };

    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf8');
        const parsed = raw ? JSON.parse(raw) : { users: [] };
        this.state = { users: Array.isArray(parsed.users) ? parsed.users : [] };
      } catch {
        this.state = { users: [] };
      }
    }

    this.save();
  }

  save() {
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  prepare(sql) {
    return {
      get: (...args) => {
        const query = String(sql ?? '').trim();

        if (query === 'SELECT * FROM users') {
          return this.state.users.map((user) => ({ ...user }));
        }

        if (query.startsWith('SELECT * FROM users WHERE email = ?')) {
          return this.state.users.find((user) => user.email === args[0]) || undefined;
        }

        if (query.startsWith('SELECT id FROM users WHERE email = ?')) {
          const user = this.state.users.find((item) => item.email === args[0]);
          return user ? { id: user.id } : undefined;
        }

        return undefined;
      },
      all: (...args) => {
        const query = String(sql ?? '').trim();

        if (query === 'SELECT * FROM users') {
          return this.state.users.map((user) => ({ ...user }));
        }

        if (query.startsWith('SELECT * FROM users WHERE email = ?')) {
          const user = this.state.users.find((item) => item.email === args[0]);
          return user ? [user] : [];
        }

        return [];
      },
      run: (...args) => {
        const query = String(sql ?? '').trim();

        if (query === 'DELETE FROM users') {
          const count = this.state.users.length;
          this.state.users = [];
          this.save();
          return { changes: count };
        }

        if (query.startsWith('DELETE FROM users WHERE email = ?')) {
          const targetEmail = args[0];
          const beforeCount = this.state.users.length;
          this.state.users = this.state.users.filter((user) => user.email !== targetEmail);
          this.save();
          return { changes: beforeCount - this.state.users.length };
        }

        const updateMatch = query.match(/UPDATE users SET password = \? WHERE email = \?/i);
        if (updateMatch) {
          const [newPassword, email] = args;
          const userIndex = this.state.users.findIndex((user) => user.email === email);
          if (userIndex === -1) {
            return { changes: 0 };
          }
          this.state.users[userIndex].password = newPassword;
          this.save();
          return { changes: 1 };
        }

        const insertMatch = query.match(/INSERT INTO users\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (insertMatch) {
          const columns = insertMatch[1].split(',').map((value) => value.trim().replace(/`/g, ''));
          const row = {};
          columns.forEach((column, index) => {
            row[column] = args[index];
          });
          this.state.users.push(row);
          this.save();
          return { changes: 1 };
        }

        return { changes: 0 };
      },
    };
  }
}

const db = new JsonDatabase(DB_PATH);

const smtpTransport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

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

async function sendOtpEmail(email, otp) {
  if (!email || !SMTP_USER || !SMTP_PASS) {
    return false;
  }

  try {
    await smtpTransport.sendMail({
      from: MAIL_FROM,
      to: email,
      subject: 'Your DesignSpace OTP code',
      text: `Your DesignSpace verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your DesignSpace verification code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p>`,
    });
    return true;
  } catch (error) {
    console.error('Failed to send OTP email:', error instanceof Error ? error.message : error);
    return false;
  }
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

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: 'DesignSpace backend is live' });
  });

  app.post('/api/auth/signup', (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
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

    db.prepare(
      'INSERT INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(user.id, user.name, user.email, user.password, user.role, user.createdAt);

    const token = createToken(user);
    return res.status(201).json({ message: 'User registered successfully.', token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!userRow) {
      return res.status(401).json({ message: 'User does not exist. Please sign up first.' });
    }

    if (!verifyPassword(String(password), userRow.password)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      password: userRow.password,
      role: userRow.role || 'member',
      createdAt: userRow.created_at,
    };

    const token = createToken(user);
    return res.json({ message: 'Login successful.', token, user: sanitizeUser(user) });
  });

  app.delete('/api/auth/me', (req, res) => {
    const authorization = String(req.headers.authorization || '').trim();
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
      return res.status(401).json({ message: 'Authentication is required to delete the account.' });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const email = String(payload.email || '').trim().toLowerCase();

      if (!email) {
        return res.status(400).json({ message: 'Email is required for account deletion.' });
      }

      const result = db.prepare('DELETE FROM users WHERE email = ?').run(email);
      if (result.changes === 0) {
        return res.status(404).json({ message: 'User not found.' });
      }

      otpStore.delete(email);
      return res.json({ message: 'User removed successfully.', email });
    } catch (error) {
      return res.status(401).json({
        message: 'Your session is invalid or expired. Please log in again.',
        error: error instanceof Error ? error.message : 'Invalid token',
      });
    }
  });

  app.delete('/api/auth/users/:email', (req, res) => {
    const email = decodeURIComponent(String(req.params.email ?? '')).trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const result = db.prepare('DELETE FROM users WHERE email = ?').run(email);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    otpStore.delete(email);
    return res.json({ message: 'User removed successfully.', email });
  });

  app.delete('/api/auth/delete-my-email', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const result = db.prepare('DELETE FROM users WHERE email = ?').run(email);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    otpStore.delete(email);
    return res.json({ message: 'User removed successfully.', email });
  });

  app.post('/api/auth/send-otp', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const otp = generateOtp();
    otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    const emailSent = await sendOtpEmail(email, otp);
    if (!emailSent) {
      console.warn(`OTP generated for ${email}, but email delivery failed. Dev fallback OTP: ${otp}`);
    }

    return res.json({
      message: emailSent ? 'OTP sent successfully.' : 'OTP generated successfully. Email delivery failed, but the OTP is available for development testing.',
      otp,
      emailSent,
    });
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

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const user = existingUser
      ? {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          password: existingUser.password,
          role: existingUser.role || 'member',
          createdAt: existingUser.created_at,
        }
      : {
          id: crypto.randomUUID(),
          name: email.split('@')[0],
          email,
          password: hashPassword('otp-login'),
          role: 'member',
          createdAt: new Date().toISOString(),
        };

    if (!existingUser) {
      db.prepare(
        'INSERT INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(user.id, user.name, user.email, user.password, user.role, user.createdAt);
    }

    const token = createToken(user);
    return res.json({ message: 'OTP verified successfully.', token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!userRow) {
      return res.status(404).json({ message: 'User does not exist. Please sign up first.' });
    }

    const otp = generateOtp();
    otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000, purpose: 'reset-password' });
    const emailSent = await sendOtpEmail(email, otp);

    return res.json({
      message: emailSent ? 'Password reset OTP sent successfully.' : 'Password reset OTP generated successfully. Email delivery failed, but the OTP is available for development testing.',
      otp,
      emailSent,
    });
  });

  app.post('/api/auth/verify-reset-otp', (req, res) => {
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

    if (currentOtp.purpose !== 'reset-password' || currentOtp.otp !== otp) {
      return res.status(401).json({ message: 'Invalid OTP.' });
    }

    return res.json({ message: 'OTP verified successfully.' });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const otp = String(req.body?.otp ?? '');
    const password = String(req.body?.password ?? '');

    if (!email || !otp || !password) {
      return res.status(400).json({ message: 'Email, OTP, and a new password are required.' });
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

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!userRow) {
      return res.status(404).json({ message: 'User does not exist. Please sign up first.' });
    }

    const hashedPassword = hashPassword(password);
    const updateResult = db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, email);
    if (updateResult.changes === 0) {
      return res.status(404).json({ message: 'Password could not be updated.' });
    }

    otpStore.delete(email);
    return res.json({ message: 'Password updated successfully.' });
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

  return { app, server: httpServer, io, db };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const { server } = createApp();
  server.listen(PORT, () => {
    console.log(`DesignSpace backend listening on http://localhost:${PORT}`);
  });
}

export { createApp };
