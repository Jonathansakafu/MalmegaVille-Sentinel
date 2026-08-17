import express from 'express';
import cors from 'cors';
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
import { validateStartupConfig } from './startup.js';
import { mongodbUri, dblessTestMode } from './config.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/captures', captureRoutes);

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

async function start() {
  validateStartupConfig();

  if (!dblessTestMode) {
    if (!mongodbUri) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');
  } else {
    console.warn('Running in DB-less test mode: skipping MongoDB connection');
  }

  app.listen(port, () => {
    console.log(`MalmegaVille Sentinel backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
