import rateLimit from 'express-rate-limit';

// Credential endpoints: tight limit to blunt brute-force/credential stuffing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' }
});

// JWT-authenticated dashboard reads/writes (devices, incidents, settings).
export const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});

// Sync-token-authenticated desktop agent telemetry (heartbeats, captures).
// Generous ceiling: a single agent's 15s heartbeat alone is ~240 events/hour.
export const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 900,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});
