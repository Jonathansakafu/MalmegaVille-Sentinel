import mongoose from 'mongoose';

const captureSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  captureType: { type: String, enum: ['webcam_photo', 'usb_file', 'usb_manifest', 'location'], required: true },
  triggerEvent: { type: String, enum: ['usb_insert', 'login_unlock'] },
  sessionId: { type: String },
  originalFileName: { type: String },
  originalPath: { type: String },
  sizeBytes: { type: Number },
  mimeType: { type: String },
  storagePath: { type: String },
  skipped: { type: Boolean, default: false },
  skipReason: { type: String },
  capturedAtUtc: { type: Date, required: true },
  uploadedAtUtc: { type: Date, default: () => new Date() },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
});

captureSchema.index({ userId: 1, deviceId: 1, capturedAtUtc: -1 });

const Capture = mongoose.model('Capture', captureSchema);
export default Capture;
