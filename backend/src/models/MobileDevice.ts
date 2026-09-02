import mongoose from 'mongoose';

// A phone paired to an account via the companion Android app, used to relay
// SMS alerts through that phone's own SIM (see mobilePushService.ts).
const mobileDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['android'], required: true },
  fcmToken: { type: String, required: true, unique: true },
  deviceLabel: { type: String, default: '' },
  lastSeenAt: { type: Date, default: () => new Date() },
  createdAt: { type: Date, default: () => new Date() }
});

const MobileDevice = mongoose.model('MobileDevice', mobileDeviceSchema);
export default MobileDevice;
