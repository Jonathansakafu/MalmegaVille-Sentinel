import mongoose from 'mongoose';

const trustedUsbDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  identifier: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: () => new Date() }
});

trustedUsbDeviceSchema.index({ userId: 1, identifier: 1 }, { unique: true });

const TrustedUsbDevice = mongoose.model('TrustedUsbDevice', trustedUsbDeviceSchema);
export default TrustedUsbDevice;
