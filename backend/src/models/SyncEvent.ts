import mongoose from 'mongoose';

const syncEventSchema = new mongoose.Schema({
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
