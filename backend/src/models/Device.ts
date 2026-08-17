import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  name: { type: String, required: true },
  operatingSystem: { type: String, required: true },
  lastSeen: { type: Date, default: () => new Date() },
  securityStatus: { type: String, default: 'safe' },
  isLost: { type: Boolean, default: false },
  lostAt: { type: Date, default: null }
});

const Device = mongoose.model('Device', deviceSchema);
export default Device;
