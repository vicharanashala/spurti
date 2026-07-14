import Guild from '../models/Guild.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

export function currentWeekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

export async function computeGuildStandings() {
  const guilds = await Guild.find({}).lean();
  const weekStart = currentWeekStart();

  const standings = await Promise.all(guilds.map(async (guild) => {
    const members = await Student.find({ guildId: guild._id, status: { $ne: 'excused' } }).lean();
    const memberEmails = members.map((m) => m.email);
    const totalPoints = members.reduce((sum, m) => sum + (Number(m.totalSp) || 0), 0);

    const weeklyAgg = memberEmails.length
      ? await SPTransaction.aggregate([
        { $match: { email: { $in: memberEmails }, dateTime: { $gte: weekStart } } },
        { $group: { _id: null, weeklyPoints: { $sum: '$appliedDelta' } } }
      ])
      : [];
    const weeklyPoints = weeklyAgg[0]?.weeklyPoints || 0;

    return {
      _id: String(guild._id),
      name: guild.name,
      slug: guild.slug || String(guild._id),
      motto: guild.motto,
      emblemIcon: guild.icon,
      colorPrimary: guild.color,
      memberCount: members.length,
      maxMembers: guild.maxMembers || 12,
      totalPoints,
      weeklyPoints
    };
  }));

  standings.sort((a, b) => b.totalPoints - a.totalPoints);
  return standings.map((s, i) => ({ ...s, rank: i + 1 }));
}

export async function computeGuildDetail(guildId) {
  const guild = await Guild.findById(guildId).lean();
  if (!guild) return null;

  const weekStart = currentWeekStart();
  const members = await Student.find({ guildId: guild._id, status: { $ne: 'excused' } })
    .sort({ totalSp: -1, name: 1 })
    .lean();
  const memberEmails = members.map((m) => m.email);

  const weeklyByEmail = {};
  if (memberEmails.length) {
    const rows = await SPTransaction.aggregate([
      { $match: { email: { $in: memberEmails }, dateTime: { $gte: weekStart } } },
      { $group: { _id: '$email', weeklyPoints: { $sum: '$appliedDelta' } } }
    ]);
    rows.forEach((r) => { weeklyByEmail[r._id] = r.weeklyPoints; });
  }

  const memberBreakdown = members.map((m) => ({
    name: m.name,
    email: m.email,
    role: String(guild.ownerEmail) === String(m.email) ? 'leader' : 'member',
    totalSp: m.totalSp,
    weeklyPoints: weeklyByEmail[m.email] || 0
  }));

  const topContributor = memberBreakdown.length
    ? [...memberBreakdown].sort((a, b) => b.weeklyPoints - a.weeklyPoints)[0]
    : null;

  return {
    _id: String(guild._id),
    name: guild.name,
    slug: guild.slug || String(guild._id),
    motto: guild.motto,
    emblemIcon: guild.icon,
    colorPrimary: guild.color,
    leaderEmail: guild.ownerEmail,
    inviteCode: guild.inviteCode || '',
    maxMembers: guild.maxMembers || 12,
    memberCount: members.length,
    totalPoints: memberBreakdown.reduce((sum, m) => sum + (Number(m.totalSp) || 0), 0),
    weeklyPoints: memberBreakdown.reduce((sum, m) => sum + (Number(m.weeklyPoints) || 0), 0),
    members: memberBreakdown,
    topContributorThisWeek: topContributor
  };
}