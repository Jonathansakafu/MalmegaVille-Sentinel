import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/authRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import incidentRoutes from './routes/incidentRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import captureRoutes from './routes/captureRoutes.js';
import trustedUsbRoutes from './routes/trustedUsbRoutes.js';
import geocodeRoutes from './routes/geocodeRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import auditLogRoutes from './routes/auditLogRoutes.js';
import mobileDeviceRoutes from './routes/mobileDeviceRoutes.js';
import { validateStartupConfig } from './startup.js';
import { mongodbUri, dblessTestMode } from './config.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

// Railway puts one reverse proxy in front of this service, which sets
// X-Forwarded-For - without telling Express to trust it, every request's
// req.ip resolves to the proxy's own address instead of the real client's.
// Found live: express-rate-limit logged a ValidationError on every request
// because of this, and more importantly its per-IP rate limits were
// silently keying on that single shared proxy IP for all traffic, making
// auth/dashboard/agent limits a shared budget across every user instead of
// a per-client one. `1` trusts exactly the one hop Railway adds.
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Default has no frame-src, which falls back to default-src 'self'.
        // No longer used for the map itself (that's a real embedded Leaflet
        // map now, not an iframe), kept in case anything else ever needs it.
        'frame-src': ["'self'", 'https://www.openstreetmap.org'],
        // Default img-src is 'self' data: - missing blob: (what
        // URL.createObjectURL() produces for fetched capture photos) and the
        // OpenStreetMap tile subdomains the Leaflet map's tiles load from.
        // Same silent-failure pattern each time: no console error, the
        // resource just doesn't render.
        'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
        // No explicit connect-src previously meant it fell back to
        // default-src 'self', which would have silently blocked the
        // client-side fetch() to OSRM's routing API for the route line.
        'connect-src': ["'self'", 'https://router.project-osrm.org']
      }
    }
  })
);
app.use(cors());
app.use(express.json());
app.use(mongoSanitize());

app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/captures', captureRoutes);
app.use('/api/trusted-usb-devices', trustedUsbRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/mobile-devices', mobileDeviceRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', application: 'malmegaville-sentinel-backend' });
});

// In production, this service also serves the built frontend (single Railway
// service, no CORS/second-domain complexity for a personal-scale deployment).
// Guarded by existence so local dev (no frontend build present) is unaffected.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.join(__dirname, '../../frontend/dist');

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Express 4 does not forward a rejected promise thrown inside an async route
// handler to this - it only catches next(err) calls and synchronous throws.
// Kept as defense-in-depth for those cases.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled route error', err);
  if (res.headersSent) return;
  res.status(500).json({ message: 'Internal server error.' });
});

// The actual crash path: an async route handler throwing (e.g. a Mongoose
// ValidationError from an unawaited-for-errors .create() call) becomes an
// unhandledRejection with no listener, which is a fatal, process-exiting
// event in Node by default. Verified live - one malformed request from a
// single device (a triggerEvent value not yet in the Capture schema's enum)
// took the whole backend down for every user until Railway restarted it.
// Logging and continuing here trades "that one request quietly fails" for
// "the service survives it" - the right tradeoff for something a stranger's
// device can trigger on a shared server.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error);
});

async function start() {
  validateStartupConfig();

  if (!dblessTestMode) {
    if (!mongodbUri) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');
  } else {
    console.warn('Running in DB-less test mode: skipping MongoDB connection');
  }

  const server = app.listen(port, () => {
    console.log(`MalmegaVille Sentinel backend listening on http://localhost:${port}`);
  });

  // Railway stops the old container with SIGTERM the instant a new deploy's
  // container is ready - with no handler, Node's default SIGTERM behavior
  // is to die immediately, which looks identical to an actual crash to
  // Railway's monitoring and triggers a "deployment crashed" alert email
  // for what was really just a normal redeploy. Exiting 0 on purpose here
  // tells it this was a clean, intentional stop.
  //
  // server.close()'s callback only fires once every open connection closes
  // on its own (a lingering keep-alive connection can hold it open
  // indefinitely) - if that takes longer than Railway's own grace period
  // before it sends SIGKILL, the process still dies looking like a crash,
  // which is exactly what kept happening even with the shutdown handler in
  // place. The timeout below forces a clean exit regardless, so the process
  // never depends on every connection cooperating.
  const shutdown = () => {
    const forceExit = setTimeout(() => process.exit(0), 3000);
    server.close(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
