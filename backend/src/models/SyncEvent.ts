import mongoose from 'mongoose';

const syncEventSchema = new mongoose.Schema({
  // Resolved from the device's registered owner at ingest time. Absent when the
  // event references a deviceId that hasn't been registered by any account yet.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deviceId: { type: String, required: true },
  deviceName: { type: String, default: 'Unknown Device' },
  eventType: { type: String, required: true },
  timestampUtc: { type: Date, required: true },
  severity: { type: String, default: 'Informational' },
  description: { type: String, required: true },
  threatScore: { type: Number, default: 0 },
  recommendedAction: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: () => new Date() }
});

const SyncEvent = mongoose.model('SyncEvent', syncEventSchema);
export default SyncEvent;
