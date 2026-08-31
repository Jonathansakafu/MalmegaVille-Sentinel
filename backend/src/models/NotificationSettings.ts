import mongoose from 'mongoose';

const notificationSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  alertEmailRecipient: { type: String, default: '' },
  updatedAt: { type: Date, default: () => new Date() }
});

const NotificationSettings = mongoose.model('NotificationSettings', notificationSettingsSchema);
export default NotificationSettings;
