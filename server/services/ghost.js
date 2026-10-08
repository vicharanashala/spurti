export async function buildGhostState(email, type) {
  // Generates a mock week-by-week tracking array matching the custom SVG canvas map
  const timelineData = Array.from({ length: 8 }, (_, i) => ({
    week: i + 1,
    // Smoothly step up the points line up to week 8 to match the student data length
    sp: type === 'top10' ? Math.floor((i + 1) * 25) : Math.floor((i + 1) * 15)
  }));

  return {
    success: true,
    type: type || 'club3600',
    label: type === 'top10' ? 'Top 10% Performance Target' : '3,600-Minute Club Track',
    timeline: timelineData
  };
}
