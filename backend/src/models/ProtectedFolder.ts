import mongoose from 'mongoose';

const protectedFolderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  path: { type: String, required: true },
  label: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
});

protectedFolderSchema.index({ userId: 1, deviceId: 1, path: 1 }, { unique: true });

const ProtectedFolder = mongoose.model('ProtectedFolder', protectedFolderSchema);
export default ProtectedFolder;
