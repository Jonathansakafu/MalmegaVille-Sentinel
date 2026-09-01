import mongoose from 'mongoose';

// Immutable by convention: no route anywhere in the API updates or deletes an
// audit log entry once written.
const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  actorType: { type: String, enum: ['user', 'agent', 'system'], required: true },
  description: { type: String, required: true },
  targetType: { type: String },
  targetId: { type: String },
  ipAddress: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: () => new Date() }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
