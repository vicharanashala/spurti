import NotificationPreference from '../models/NotificationPreference.js';
import Notification from '../models/Notification.js';

export async function getOrCreatePreferences(email) {
  return NotificationPreference.findOneAndUpdate(
    { email },
    { $setOnInsert: { email } },
    { new: true, upsert: true }
  );
}

export async function notify(email, category, { title, message, sessionLabel }) {
  const prefs = await getOrCreatePreferences(email);
  
  if (prefs.categories[category]?.inApp) {
    await Notification.create({
      email,
      category,
      title,
      message,
      sessionLabel: sessionLabel || ''
    });
  }
  
  if (prefs.categories[category]?.email) {
    // TODO: wire to email service once available
  }
}
