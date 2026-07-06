import NotificationPreference from '../models/NotificationPreference.js';
import Notification from '../models/Notification.js';

export async function getOrCreatePreferences(email) {
  let prefs = await NotificationPreference.findOne({ email });
  if (!prefs) {
    prefs = await NotificationPreference.create({ email });
  }
  return prefs;
}

export async function notify(email, category, { title, message }) {
  const prefs = await getOrCreatePreferences(email);
  
  if (prefs.categories[category]?.inApp) {
    await Notification.create({
      email,
      category,
      title,
      message
    });
  }
  
  if (prefs.categories[category]?.email) {
    // TODO: wire to email service once available
  }
}
