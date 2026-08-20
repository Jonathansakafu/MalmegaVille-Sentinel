import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import { jwtSecret, dblessTestMode } from '../config.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authLimiter, dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import { notifySecurityEvent } from '../services/alertService.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  updateUsername,
  updatePasswordHash
} from '../services/inMemoryStore.js';

const router = Router();

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dots, dashes, and underscores.');

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8)
});

const registerSchema = credentialsSchema.extend({
  username: usernameSchema
});

const updateUsernameSchema = z.object({
  username: usernameSchema
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

// Fallback shown for accounts created before usernames existed, until they set a real one.
function deriveDisplayName(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createToken(userId: string) {
  if (!jwtSecret) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.sign({ userId }, jwtSecret, { expiresIn: '30d' });
}

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { email, password, username } = req.body;

  if (dblessTestMode) {
    if (findUserByEmail(email)) {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    if (findUserByUsername(username)) {
      return res.status(409).json({ message: 'Username already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = createUser(email, passwordHash, username);
    const token = createToken(user.id);

    return res.status(201).json({ token, user: { email: user.email, id: user.id, username: user.username } });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'Email already registered.' });
  }
  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    return res.status(409).json({ message: 'Username already taken.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = new User({ email, username, passwordHash });
  await user.save();

  const token = createToken(String(user._id));

  res.status(201).json({ token, user: { email: user.email, id: user._id, username: user.username } });
});

router.post('/login', authLimiter, validateBody(credentialsSchema), async (req, res) => {
  const { email, password } = req.body;

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
    return res.json({ token, user: { email: user.email, id: user.id, username: user.username ?? deriveDisplayName(user.email) } });
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
    deviceName: user.username || user.email,
    eventType: 'User Login',
    timestampUtc: new Date(),
    severity: 'Informational',
    description: `User ${user.username || user.email} signed in successfully.`,
    recommendedAction: 'If this login was unexpected, investigate immediately.'
  }).catch((error) => {
    console.error('Login notification failed', error);
  });

  res.json({ token, user: { email: user.email, id: user._id, username: user.username ?? deriveDisplayName(user.email) } });
});

router.patch('/username', authenticate, dashboardLimiter, validateBody(updateUsernameSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { username } = req.body;

  if (dblessTestMode) {
    const taken = findUserByUsername(username);
    if (taken && taken.id !== userId) {
      return res.status(409).json({ message: 'Username already taken.' });
    }
    const user = updateUsername(userId, username);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json({ username: user.username });
  }

  const taken = await User.findOne({ username });
  if (taken && String(taken._id) !== userId) {
    return res.status(409).json({ message: 'Username already taken.' });
  }

  const user = await User.findByIdAndUpdate(userId, { username }, { new: true });
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  res.json({ username: user.username });
});

router.patch('/password', authenticate, dashboardLimiter, validateBody(updatePasswordSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { currentPassword, newPassword } = req.body;

  if (dblessTestMode) {
    const user = findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    updatePasswordHash(userId, passwordHash);
    return res.json({ message: 'Password updated.' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ message: 'Current password is incorrect.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  notifySecurityEvent({
    deviceName: user.username || user.email,
    eventType: 'Password Changed',
    timestampUtc: new Date(),
    severity: 'High',
    description: `The password for ${user.username || user.email} was changed.`,
    recommendedAction: 'If you did not make this change, your account may be compromised - contact yourself immediately and rotate credentials.'
  }).catch((error) => {
    console.error('Password change notification failed', error);
  });

  res.json({ message: 'Password updated.' });
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
  const identity = user?.username || user?.email || 'Unknown user';

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
