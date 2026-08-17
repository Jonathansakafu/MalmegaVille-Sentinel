import mongoose from 'mongoose';

const notificationSettingsSchema = new mongoose.Schema({
  alertEmailRecipient: { type: String, default: '' },
  telegramBotToken: { type: String, default: '' },
  telegramChatId: { type: String, default: '' },
  updatedAt: { type: Date, default: () => new Date() }
});

const NotificationSettings = mongoose.model('NotificationSettings', notificationSettingsSchema);
export default NotificationSettings;
