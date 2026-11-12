import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema(
  {
    remoteAddress: { type: String, required: true },
    remotePort: { type: Number },
    processName: { type: String },
    state: { type: String }
  },
  { _id: false }
);

const networkSnapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  deviceName: { type: String },
  connections: { type: [connectionSchema], default: [] },
  connectionCount: { type: Number, default: 0 },
  publicCount: { type: Number, default: 0 },
  unknownCount: { type: Number, default: 0 },
  capturedAtUtc: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() }
});

networkSnapshotSchema.index({ userId: 1, deviceId: 1, capturedAtUtc: -1 });
// Connection telemetry is only useful while it is recent; keeping every
// 60-second snapshot forever would grow without bound for no benefit.
networkSnapshotSchema.index({ capturedAtUtc: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const NetworkSnapshot = mongoose.model('NetworkSnapshot', networkSnapshotSchema);
export default NetworkSnapshot;
