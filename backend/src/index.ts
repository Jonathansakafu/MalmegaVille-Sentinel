import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import incidentRoutes from './routes/incidentRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', application: 'malmegaville-sentinel-backend' });
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

  app.listen(port, () => {
    console.log(`MalmegaVille Sentinel backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
