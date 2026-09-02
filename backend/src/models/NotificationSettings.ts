import mongoose from 'mongoose';

const notificationSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  alertEmailRecipient: { type: String, default: '' },
  // E.164 format (e.g. +15551234567) - the device's own Core Service reads
  // this via /api/sync/lost-status to text High/Critical alerts directly
  // through its cellular modem when there's no internet at all.
  alertPhoneNumber: { type: String, default: '' },
  updatedAt: { type: Date, default: () => new Date() }
});

const NotificationSettings = mongoose.model('NotificationSettings', notificationSettingsSchema);
export default NotificationSettings;
