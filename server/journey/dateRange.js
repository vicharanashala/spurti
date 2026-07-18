export function resolveDateRange(window, student) {
  const now = new Date();

  switch (window) {
    case 'weekly': {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday, label: 'This Week' };
    }
    case 'monthly': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return { start, end, label: `${months[now.getMonth()]} ${now.getFullYear()}` };
    }
    case 'tenure': {
      const start = student.internshipStartDate ? new Date(student.internshipStartDate) : new Date('2026-05-15');
      const end = student.internshipEndDate ? new Date(student.internshipEndDate) : new Date('2026-08-15');
      return { start, end, label: 'Full Internship' };
    }
    default:
      return null;
  }
}
