import GhostProfile from '../models/GhostProfile.js';

export async function buildGhostState(email, type) {
  const profile = await GhostProfile.findOne({ type });
  
  if (!profile) {
    // Exact structured fallback tracking format for local demo testing
    return {
      type: type || 'club3600',
      label: type === 'top10' ? 'Top 10% Innovator Ghost' : '3,600-Minute Club Ghost',
      timeline: Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        cumulativeSp: type === 'top10' ? Math.floor(i * 55) : Math.floor(i * 30)
      }))
    };
  }

  return {
    type: profile.type,
    label: profile.label,
    timeline: profile.pointsTimeline
  };
}
