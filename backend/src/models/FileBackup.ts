import mongoose from 'mongoose';

const fileBackupSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  folderId: { type: String, required: true },
  relativePath: { type: String, required: true },
  sha256: { type: String, required: true },
  sizeBytes: { type: Number, default: 0 },
  storagePath: { type: String, required: true },
  backedUpAtUtc: { type: Date, default: () => new Date() }
});

fileBackupSchema.index({ userId: 1, folderId: 1, relativePath: 1, sha256: 1 }, { unique: true });
fileBackupSchema.index({ userId: 1, folderId: 1, backedUpAtUtc: -1 });

const FileBackup = mongoose.model('FileBackup', fileBackupSchema);
export default FileBackup;
