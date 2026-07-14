import React, { useState, useMemo } from 'react';
import Tabs from '../../components/Tabs.jsx';
import SpBank from '../../components/SpBank.jsx';
import StudentLayout from '../../layouts/StudentLayout.jsx';

const POLL_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const POLL_TOD = { morning: 1, afternoon: 2, evening: 3 };

function pollSortKey(label = '') {
  let day, mon;
  const paren = label.match(/\((\d{1,2})\s+([A-Za-z]+)\)/);
  if (paren) {
    day = +paren[1];
    mon = paren[2];
  } else {
    const lead = label.match(/^(\d{1,2})\s+([A-Za-z]+)/);
    if (lead) {
      day = +lead[1];
      mon = lead[2];
    }
  }
  const m = mon ? POLL_MONTHS[mon.slice(0, 3).toLowerCase()] : undefined;
  if (m === undefined || !day) return -1;
  const todMatch = label.toLowerCase().match(/morning|afternoon|evening/);
  const tod = todMatch ? POLL_TOD[todMatch[0]] : 0;
  return ((m * 100 + day) * 10) + tod;
}

export default function StudentDashboard({ profile, onBack }) {
  const [tab, setTab] = useState('bank');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);

  return (
    <StudentLayout student={student} onBack={onBack}>
      <LevelStatus student={student} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank', 'SP Bank'], ['polls', 'Polls'], ['leaderboard', 'Leaderboard']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && (
        <LeaderboardTabs
          overall={profile.leaderboard}
          group={profile.groupLeaderboard}
          groupLabel={student.leaderboardGroupLabel}
        />
      )}
    </StudentLayout>
  );
}

function LevelStatus({ student }) {
  const tier = String(student.trophyLeague || 'Bronze').split(' ')[0].toLowerCase();
  return (
    <section className="level-status">
      <div className="level-tiles">
        <div className="level-tile">
          <span>Level</span>
          <strong>{student.level}</strong>
          <em>lifetime achievement</em>
        </div>
        <div className={`level-tile league tier-${tier}`}>
          <span>Trophy League</span>
          <strong>{student.trophyLeague}</strong>
          <em>current performance</em>
        </div>
        <div className="level-tile">
          <span>Legend Badge</span>
          <strong>{student.legendBadgeUnlocked ? '🏅 Unlocked' : '🔒 Locked'}</strong>
          <em>reach 1500 SP once</em>
        </div>
        <div className="level-tile">
          <span>Onboarding Group</span>
          <strong className="group">{student.leaderboardGroupLabel || '—'}</strong>
          <em>biweekly cohort</em>
        </div>
      </div>
      <p className="level-note">
        Level shows your highest achievement and never decreases. Trophy League shows your current performance and can move up or down with your current Spurti Points.
        {student.legendBadgeUnlocked ? ' You have unlocked the Legend Badge by reaching 1500 Spurti Points at least once.' : ''}
      </p>
    </section>
  );
}

function StudentPulse({ profile, badges, nextActions }) {
  const { student, cohort, attendance, polls, transactions } = profile;
  const qualified = attendance.filter(a => a.qualified).length;
  const pollAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const trend = transactions.map(tx => ({ label: tx.sessionLabel || 'Start', value: tx.balanceAfter }));

  return (
    <section className="pulse-grid">
      <div className="pulse-card progress-card">
        <span>Standing</span>
        <strong>Rank {student.rank}</strong>
        <p>{cohort.pointsToTop50 === 0 ? 'You are in the Top 50.' : `${cohort.pointsToTop50} SP needed to enter Top 50.`}</p>
        <p>{cohort.pointsToNextRank === 0 ? 'You are leading your comparison group.' : `${cohort.pointsToNextRank} SP needed for next rank.`}</p>
      </div>
      <div className="pulse-card">
        <span>Cohort comparison</span>
        <div className="compare-list">
          <b>Your SP: {student.totalSp}</b>
          <b>Cohort avg: {cohort.averageSp}</b>
          <b>Top 50 cutoff: {cohort.top50Cutoff ?? '-'}</b>
          <b>Top 10 cutoff: {cohort.top10Cutoff ?? '-'}</b>
        </div>
      </div>
      <div className="pulse-card">
        <span>Session health</span>
        <div className="compare-list">
          <b>{qualified}/{attendance.length} attendance qualified</b>
          <b>{pollAttempted}/{pollTotal} polls attempted</b>
        </div>
      </div>
      <div className="pulse-card">
        <span>History trend</span>
        <Sparkline points={trend} />
      </div>
      <div className="pulse-card badges-card">
        <span>Earned Badges</span>
        <div className="badges">
          {badges.map(b => <span key={b} className="badge">{b}</span>)}
        </div>
      </div>
      <div className="pulse-card actions-card">
        <span>Next Steps</span>
        <ul className="actions-list">
          {nextActions.map((act, i) => <li key={i}>{act}</li>)}
          {nextActions.length === 0 && <li>Great job! Keep participating.</li>}
        </ul>
      </div>
    </section>
  );
}

function Sparkline({ points }) {
  const values = points.map(p => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  return (
    <div className="sparkline">
      {points.map((point, index) => {
        const pct = max === min ? 50 : ((point.value - min) / (max - min)) * 100;
        return <i key={`${point.label}-${index}`} title={`${point.label}: ${point.value} SP`} style={{ height: `${Math.max(6, pct)}%` }} />;
      })}
    </div>
  );
}

function buildBadges(profile) {
  const badges = [];
  const qualifiedPct = profile.attendance.length ? profile.attendance.filter(a => a.qualified).length / profile.attendance.length : 0;
  const pollAttempted = profile.polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = profile.polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  if (profile.student.rank <= 50) badges.push('Top 50');
  if (qualifiedPct >= 0.75) badges.push('Consistent Attendee');
  if (pollTotal && pollAttempted / pollTotal >= 0.75) badges.push('Poll Champion');
  if (profile.student.totalSp >= profile.cohort.averageSp) badges.push('Above Average');
  return badges.length ? badges : ['Getting Started'];
}

function buildNextActions(profile) {
  const actions = [];
  if (profile.cohort.pointsToTop50 > 0) actions.push(`Earn ${profile.cohort.pointsToTop50} more SP to enter Top 50.`);
  if (profile.attendance.some(a => !a.qualified)) actions.push('Attend at least 75% of upcoming sessions to avoid attendance debit.');
  if (profile.polls.some(p => p.missedQuestions > 0)) actions.push('Attempt every poll question to avoid poll debit.');
  return actions;
}

function Polls({ polls }) {
  if (!polls.length) return <section className="panel empty">No poll records found.</section>;
  const sorted = [...polls].sort((a, b) => pollSortKey(b.sessionLabel) - pollSortKey(a.sessionLabel));
  return (
    <section className="panel">
      <h2>Polls</h2>
      <div className="cards">
        {sorted.map(poll => (
          <article className="card" key={poll._id}>
            <div className="card-head static">
              <strong>{poll.sessionLabel}</strong>
              <span>{poll.attemptedQuestions}/{poll.totalQuestions} attempted</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LeaderboardTabs({ overall = [], group = [], groupLabel }) {
  const [type, setType] = useState('overall');
  const rows = type === 'overall' ? overall : group;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="overall">Overall Leaderboard</option>
          <option value="my_onboarding_group">My Onboarding Group</option>
        </select>
      </div>
      {type === 'my_onboarding_group' && groupLabel &&
        <p className="muted">Showing students onboarded in your group: {groupLabel}</p>}
      <table className="table">
        <thead><tr><th>Rank</th><th>Name</th><th>Email</th><th>Level</th><th>SP</th></tr></thead>
        <tbody>{rows.map(row => (
          <tr key={`${row.rank}-${row.maskedEmail}`} className={row.isCurrentStudent ? 'current-student' : ''}>
            <td>{row.rank}</td><td>{row.name}</td><td>{row.maskedEmail}</td><td>{row.level}</td><td>{row.totalSp}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
