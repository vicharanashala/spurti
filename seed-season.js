import mongoose from 'mongoose';
import { MONGO_URI } from './server/config.js';
import Season from './server/models/Season.js';
import SeasonReward from './server/models/SeasonReward.js';
import { recomputeAllStandings } from './server/services/seasonService.js';

await mongoose.connect(MONGO_URI);

// Wipe existing seasons
await Season.deleteMany({});
await SeasonReward.deleteMany({});

// Create Summer 2026 season
const season = new Season({
  name: 'Summer 2026',
  number: 1,
  description: 'Three-month intensive — earn SP, climb the leaderboard, claim rewards!',
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-09-30'),
  themeColor: '#e85d04'
});
await season.save(); // pre-save hook derives `status` from dates

// Rewards with spBonus — pure acknowledgment rewards get 0, achievement ones get a small bonus.
// spBonus is awarded once per claim via an SPTransaction (category: 'manual').
const rewards = [
  { key: 'sp-50',           label: 'Season Starter',     description: 'Earn 50 season SP',                   goalType: 'sp',                 goalValue: 50,        icon: '🌱', order: 1, spBonus: 5  },
  { key: 'sp-100',          label: 'Getting Serious',    description: 'Earn 100 season SP',                  goalType: 'sp',                 goalValue: 100,       icon: '📈', order: 2, spBonus: 10 },
  { key: 'sp-200',          label: 'High Flyer',         description: 'Earn 200 season SP',                  goalType: 'sp',                 goalValue: 200,       icon: '🚀', order: 3, spBonus: 20 },
  { key: 'top-50',          label: 'Top 50 Finisher',    description: 'Finish in the top 50 of the season',  goalType: 'rank',               goalValue: 50,        icon: '🥉', order: 4, spBonus: 10 },
  { key: 'top-25',          label: 'Top 25 Finisher',    description: 'Finish in the top 25 of the season',  goalType: 'rank',               goalValue: 25,        icon: '🥈', order: 5, spBonus: 15 },
  { key: 'top-10',          label: 'Top 10 Finisher',    description: 'Finish in the top 10 of the season',  goalType: 'rank',               goalValue: 10,        icon: '🥇', order: 6, spBonus: 25 },
  { key: 'sessions-5',      label: '5 Sessions',         description: 'Qualify for 5 sessions this season', goalType: 'qualified_sessions', goalValue: 5,         icon: '📅', order: 7, spBonus: 10 },
  { key: 'league-gold',     label: 'Gold League',        description: 'Reach Gold trophy league',           goalType: 'league',             goalValue: 'Gold',     icon: '🥇', order: 8, spBonus: 15 },
  { key: 'league-platinum', label: 'Platinum League',    description: 'Reach Platinum trophy league',       goalType: 'league',             goalValue: 'Platinum', icon: '💎', order: 9, spBonus: 25 },
];
await SeasonReward.insertMany(rewards.map(r => ({ ...r, seasonId: season._id })));

console.log('Season created:', season.name, season._id);
console.log(`Seeded ${rewards.length} rewards (spBonus total: ${rewards.reduce((s, r) => s + (r.spBonus || 0), 0)})`);

// Recompute standings for all students
const result = await recomputeAllStandings(season._id);
console.log(`Recomputed: ${result.updated} students updated, ${result.new} new standings`);

await mongoose.disconnect();
console.log('Done.');