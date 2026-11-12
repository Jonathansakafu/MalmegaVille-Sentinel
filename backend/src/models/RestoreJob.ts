import mongoose from 'mongoose';

const restoreJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  sourceKind: { type: String, enum: ['capture', 'protected_file'], required: true },
  captureId: { type: String },
  backupId: { type: String },
  sourcePath: { type: String },
  restorePath: { type: String },
  fileName: { type: String, required: true },
  sizeBytes: { type: Number },
  status: {
    type: String,
    enum: ['queued', 'downloading', 'completed', 'failed', 'cancelled'],
    default: 'queued'
  },
  verificationHash: { type: String },
  restoredPath: { type: String },
  error: { type: String },
  requestedAtUtc: { type: Date, default: () => new Date() },
  startedAtUtc: { type: Date },
  completedAtUtc: { type: Date }
});

restoreJobSchema.index({ userId: 1, requestedAtUtc: -1 });
restoreJobSchema.index({ deviceId: 1, status: 1, requestedAtUtc: 1 });

const RestoreJob = mongoose.model('RestoreJob', restoreJobSchema);
export default RestoreJob;
