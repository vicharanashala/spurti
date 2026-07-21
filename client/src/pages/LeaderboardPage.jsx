import React, { useState, useEffect } from 'react';
import StudentRankSummary from '../components/StudentRankSummary.jsx';
import GlobalLeaderboard from '../components/GlobalLeaderboard.jsx';
import WeeklyLeaderboard from '../components/WeeklyLeaderboard.jsx';
import SkillLeaderboard from '../components/SkillLeaderboard.jsx';
import CohortLeaderboard from '../components/CohortLeaderboard.jsx';

const VALID_TABS = ['global', 'weekly', 'skill', 'cohort'];
const SKILL_CATEGORIES = ['react', 'mern', 'github', 'ai', 'orientation'];

export default function LeaderboardPage({ currentStudentId }) {
  const getSearchParams = () => new URLSearchParams(window.location.search);

  const [activeTab, setActiveTab] = useState(() => {
    const params = getSearchParams();
    const tabParam = (params.get('tab') || '').toLowerCase();
    return VALID_TABS.includes(tabParam) ? tabParam : 'global';
  });

  const [activeSkill, setActiveSkill] = useState(() => {
    const params = getSearchParams();
    const catParam = (params.get('category') || '').toLowerCase();
    return SKILL_CATEGORIES.includes(catParam) ? catParam : 'react';
  });

  // Sync state to URL query parameters
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (activeTab === 'skill') {
      params.set('category', activeSkill);
    }
    const newRelativePathQuery = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newRelativePathQuery);
  }, [activeTab, activeSkill]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleSkillChange = (category) => {
    setActiveSkill(category);
  };

  return (
    <section className="panel">
      {/* Page Header */}
      <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>Spurti Leaderboards</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Track student engagement, weekly progress, skill masteries, and cohort-normalized performance.
        </p>
      </div>

      {/* Current Student Rank Summary */}
      {currentStudentId && <StudentRankSummary studentId={currentStudentId} />}

      {/* Primary Navigation Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          { id: 'global', label: 'Global' },
          { id: 'weekly', label: 'Weekly' },
          { id: 'skill', label: 'Skill-Based' },
          { id: 'cohort', label: 'Cohort Normalized' }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={isActive ? 'active' : ''}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Secondary Skill Filters (only visible when Skill tab is active) */}
      {activeTab === 'skill' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {SKILL_CATEGORIES.map((cat) => {
            const isActive = activeSkill === cat;
            const labels = {
              react: 'React',
              mern: 'MERN',
              github: 'GitHub',
              ai: 'AI',
              orientation: 'Orientation'
            };
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleSkillChange(cat)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 800,
                  border: '1px solid var(--line)',
                  background: isActive ? 'var(--primary)' : '#fff',
                  color: isActive ? '#fff' : 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                {labels[cat]}
              </button>
            );
          })}
        </div>
      )}

      {/* Leaderboard View Rendering */}
      <div>
        {activeTab === 'global' && <GlobalLeaderboard currentStudentId={currentStudentId} />}
        {activeTab === 'weekly' && <WeeklyLeaderboard currentStudentId={currentStudentId} />}
        {activeTab === 'skill' && <SkillLeaderboard skillCategory={activeSkill} currentStudentId={currentStudentId} />}
        {activeTab === 'cohort' && <CohortLeaderboard currentStudentId={currentStudentId} />}
      </div>
    </section>
  );
}
