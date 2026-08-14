import mongoose from 'mongoose';

const incidentSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  incidentType: { type: String, required: true },
  threatScore: { type: Number, required: true },
  severity: { type: String, required: true },
  summary: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
});

const Incident = mongoose.model('Incident', incidentSchema);
export default Incident;
