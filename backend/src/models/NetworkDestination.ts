import mongoose from 'mongoose';

const networkDestinationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  remoteAddress: { type: String, required: true },
  remotePort: { type: Number },
  processName: { type: String },
  isPublic: { type: Boolean, default: true },
  verdict: { type: String, enum: ['unknown', 'trusted'], default: 'unknown' },
  label: { type: String },
  seenCount: { type: Number, default: 1 },
  firstSeenUtc: { type: Date, default: () => new Date() },
  lastSeenUtc: { type: Date, default: () => new Date() }
});

networkDestinationSchema.index({ userId: 1, deviceId: 1, remoteAddress: 1 }, { unique: true });
networkDestinationSchema.index({ userId: 1, verdict: 1, lastSeenUtc: -1 });

const NetworkDestination = mongoose.model('NetworkDestination', networkDestinationSchema);
export default NetworkDestination;
