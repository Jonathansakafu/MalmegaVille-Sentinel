import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { jwtSecret, dblessTestMode } from '../config.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { createUser, findUserByEmail, findUserById } from '../services/inMemoryStore.js';

const router = Router();

function validateEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validatePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8;
}

function createToken(userId: string) {
  if (!jwtSecret) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.sign({ userId }, jwtSecret, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ message: 'Invalid email or password. Password must be at least 8 characters.' });
  }

  if (dblessTestMode) {
    if (findUserByEmail(email)) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = createUser(email, passwordHash);
    const token = createToken(user.id);

    return res.status(201).json({ token, user: { email: user.email, id: user.id } });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Email already registered.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = new User({ email, passwordHash });
  await user.save();

  const token = createToken(String(user._id));

  res.status(201).json({ token, user: { email: user.email, id: user._id } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ message: 'Invalid email or password.' });
  }

  if (dblessTestMode) {
    let user = findUserByEmail(email);
    if (!user) {
      // In test mode there's no separate signup step in the desktop app, so the
      // first successful "login" for an unseen email creates the account.
      const passwordHash = await bcrypt.hash(password, 12);
      user = createUser(email, passwordHash);
    } else {
      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) {
        return res.status(401).json({ message: 'Invalid credentials.' });
      }
    }

    const token = createToken(user.id);
    return res.json({ token, user: { email: user.email, id: user.id } });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = createToken(String(user._id));

  notifySecurityEvent({
    deviceName: user.email,
    eventType: 'User Login',
    timestampUtc: new Date(),
    severity: 'Informational',
    description: `User ${user.email} signed in successfully.`,
    recommendedAction: 'If this login was unexpected, investigate immediately.'
  }).catch((error) => {
    console.error('Login notification failed', error);
  });

  res.json({ token, user: { email: user.email, id: user._id } });
});

router.post('/logout', authenticate, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const identity = findUserById(userId)?.email ?? 'Unknown user';
    return res.json({ message: `Logged out successfully. (${identity})` });
  }

  const user = await User.findById(userId);
  const identity = user?.email ?? 'Unknown user';

  notifySecurityEvent({
    deviceName: identity,
    eventType: 'User Logout',
    timestampUtc: new Date(),
    severity: 'Informational',
    description: `User ${identity} signed out of the portal.`,
    recommendedAction: 'Verify this logout if it was not initiated by a user.'
  }).catch((error) => {
    console.error('Logout notification failed', error);
  });

  res.json({ message: 'Logged out successfully.' });
});

export default router;
