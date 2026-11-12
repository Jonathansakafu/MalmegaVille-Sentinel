import mongoose from 'mongoose';

const manifestEntrySchema = new mongoose.Schema(
  {
    relativePath: { type: String, required: true },
    sha256: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    lastModifiedUtc: { type: Date }
  },
  { _id: false }
);

const manifestChangeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['added', 'modified', 'removed'], required: true },
    relativePath: { type: String, required: true },
    previousSha256: { type: String },
    sha256: { type: String },
    sizeBytes: { type: Number }
  },
  { _id: false }
);

const fileManifestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  folderId: { type: String, required: true },
  path: { type: String, required: true },
  label: { type: String },
  entries: { type: [manifestEntrySchema], default: [] },
  fileCount: { type: Number, default: 0 },
  totalBytes: { type: Number, default: 0 },
  changes: { type: [manifestChangeSchema], default: [] },
  changeCount: { type: Number, default: 0 },
  integrityStatus: { type: String, enum: ['baseline', 'unchanged', 'changed'], default: 'baseline' },
  scannedAtUtc: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() }
});

fileManifestSchema.index({ userId: 1, folderId: 1, scannedAtUtc: -1 });
fileManifestSchema.index({ userId: 1, deviceId: 1, scannedAtUtc: -1 });

const FileManifest = mongoose.model('FileManifest', fileManifestSchema);
export default FileManifest;
