import mongoose from 'mongoose';

const trustedUsbDeviceSchema = new mongoose.Schema({
  identifier: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: () => new Date() }
});

const TrustedUsbDevice = mongoose.model('TrustedUsbDevice', trustedUsbDeviceSchema);
export default TrustedUsbDevice;
