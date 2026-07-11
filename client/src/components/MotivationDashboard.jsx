import React, { useState, useEffect } from 'react';

const MILESTONE_DEFINITIONS = [
  { name: 'Beginner', days: 3, icon: '🔥', desc: 'Beginner' },
  { name: 'Consistent', days: 7, icon: '🔥🔥', desc: 'Consistent' },
  { name: 'Dedicated', days: 15, icon: '🔥🔥🔥', desc: 'Dedicated' },
  { name: 'Scholar', days: 30, icon: '🔥🔥🔥🔥', desc: 'Scholar' },
  { name: 'Master', days: 60, icon: '👑', desc: 'Master' },
  { name: 'Legend', days: 100, icon: '💎', desc: 'Legend' }
];

export default function MotivationDashboard({ student, onRefreshProfile }) {
  const [treeData, setTreeData] = useState(null);
  const [milestones, setMilestones] = useState({ currentStreak: 0, badges: [] });
  const [friendsActivity, setFriendsActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showSpinModal, setShowSpinModal] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [rewardResult, setRewardResult] = useState(null);

  useEffect(() => {
    if (!student?._id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [treeRes, milestonesRes, friendsRes] = await Promise.all([
          fetch(`/api/growth-tree/${student._id}`),
          fetch(`/api/badges/milestones/${student._id}`),
          fetch(`/api/friends/activity/${student._id}`)
        ]);

        if (!treeRes.ok || !milestonesRes.ok || !friendsRes.ok) {
          throw new Error('Failed to load motivation data');
        }

        const tData = await treeRes.json();
        const mData = await milestonesRes.json();
        const fData = await friendsRes.json();

        setTreeData(tData);
        setMilestones(mData);
        setFriendsActivity(fData);
        setError(null);
      } catch (err) {
        console.error('Error fetching motivation data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [student?._id]);

  if (loading) {
    return (
      <div className="panel motivation-panel loading-state">
        <div className="spinner" />
        <p>Loading Motivation Dashboard...</p>
      </div>
    );
  }

  if (error || !treeData) {
    return (
      <div className="panel motivation-panel error-state">
        <p className="error">⚠️ {error || 'Could not load motivation dashboard'}</p>
      </div>
    );
  }

  const handleSpin = async () => {
    if (spinning) return;
    setSpinning(true);
    setRotationAngle(0);
    setRewardResult(null);

    try {
      const res = await fetch('/api/spin-wheel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student._id })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to spin the wheel.');
      }
      const data = await res.json();

      // Mapping backend reward indices to wheel sector center angles:
      // index 0 (+5 SP) -> Sector 1 (36 deg)
      // index 1 (+10 SP) -> Sector 2 (108 deg)
      // index 3 (+15 SP) -> Sector 3 (180 deg)
      // index 4 (+20 SP) -> Sector 4 (252 deg)
      // index 2 (Double SP) -> Sector 5 (324 deg)
      const centerAngles = {
        0: 36,
        1: 108,
        3: 180,
        4: 252,
        2: 324
      };
      const chosenAngle = centerAngles[data.reward.index];
      const targetAngle = 1800 + (360 - chosenAngle);

      // Trigger spin transition
      setRotationAngle(targetAngle);

      setTimeout(() => {
        setSpinning(false);
        setRewardResult(data.reward);
        if (onRefreshProfile) onRefreshProfile();
        setTreeData(prev => ({
          ...prev,
          spinsUsed: data.spinsUsed
        }));
      }, 4600); // Wait 4.5s transition + 100ms padding

    } catch (err) {
      alert(err.message);
      setSpinning(false);
    }
  };

  const closeRewardModal = () => {
    setShowSpinModal(false);
    setRewardResult(null);
    setRotationAngle(0);
  };

  const availableSpins = (treeData.bonusesAwarded || 0) - (treeData.spinsUsed || 0);
  const unlockedBadges = milestones.badges || [];

  return (
    <section className="motivation-dashboard" style={{ width: '100%' }}>
      {/* Spin the Wheel Banner */}
      {availableSpins > 0 && (
        <div className="spin-wheel-banner" style={{ marginBottom: '24px' }}>
          <div className="spin-banner-left">
            <span className="spin-banner-icon">🎲</span>
            <div>
              <strong className="spin-banner-title">Spin the Lucky Wheel!</strong>
              <span className="spin-banner-desc">You completed a Perfect Week and earned 1 spin. Try your luck!</span>
            </div>
          </div>
          <button onClick={() => setShowSpinModal(true)} className="spin-wheel-trigger-btn">
            🎲 Spin Wheel ({availableSpins} left)
          </button>
        </div>
      )}

      {/* Two main layout columns: Perfect Week vs Daily Streak */}
      <div className="motivation-layout">
        
        {/* Left Section: Perfect Week */}
        <div className="motivation-section perfect-week-section">
          <h2 className="section-title">🏆 Perfect Week (20 SP/Day)</h2>

          {/* Perfect Week Bonus Banner/Notification */}
          {treeData.bonusesAwarded > 0 && (
            <div className="perfect-week-banner" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '12px 16px', borderRadius: '8px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <span style={{ fontSize: '24px' }}>🏆</span>
              <div>
                <strong style={{ display: 'block', fontSize: '13px' }}>Perfect Week Streak Active!</strong>
                <span style={{ fontSize: '11px', opacity: 0.95 }}>You have earned {treeData.bonusesAwarded} Perfect Week {treeData.bonusesAwarded === 1 ? 'Bonus' : 'Bonuses'} (+5 SP each) by staying active for {treeData.streak} consecutive days!</span>
              </div>
            </div>
          )}

          {/* Growth Tree Panel */}
          <div className="panel growth-tree-panel" style={{ margin: 0 }}>
            <div className="panel-head">
              <h2>🌱 Growth Tree</h2>
            </div>
            
            <div className="tree-container">
              <GrowthTreeSvg stage={treeData.successfulDays} />
              
              <div className="tree-details">
                <p className="tree-status-text">
                  Stage: <strong>{treeData.successfulDays} Successful Days</strong>
                </p>

                {/* Streak and Payout Badges */}
                <div className="streak-badges-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '4px 0 8px 0' }}>
                  <span className="streak-badge" style={{ background: '#fff1f2', color: '#e11d48', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    🔥 Streak: {treeData.streak || 0} {treeData.streak === 1 ? 'Day' : 'Days'}
                  </span>
                  {treeData.bonusesAwarded > 0 && (
                    <span className="bonus-badge" style={{ background: '#ecfdf5', color: '#059669', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      🎉 {treeData.bonusesAwarded}x Perfect Week
                    </span>
                  )}
                </div>
                
                {/* Growth Progress Bar */}
                <div className="tree-progress-container">
                  <div 
                    className="tree-progress-bar" 
                    style={{ width: `${Math.min(100, (treeData.successfulDays / 30) * 100)}%` }} 
                  />
                  <span className="tree-progress-label">
                    {treeData.successfulDays >= 30 
                      ? 'Fully Grown! 🌳' 
                      : `${treeData.successfulDays}/30 Days to Mature Tree`
                    }
                  </span>
                </div>

                {/* Milestones */}
                <div className="milestones-list">
                  <div className={`milestone-item ${treeData.hasFlowers ? 'unlocked' : 'locked'}`}>
                    <span className="milestone-icon">🌸</span>
                    <div className="milestone-desc">
                      <strong>Week 1 (7 Days)</strong>
                      <p>{treeData.hasFlowers ? 'Flowers Bloomed!' : 'Keep earning to unlock flowers'}</p>
                    </div>
                  </div>
                  <div className={`milestone-item ${treeData.hasFruits ? 'unlocked' : 'locked'}`}>
                    <span className="milestone-icon">🍎</span>
                    <div className="milestone-desc">
                      <strong>Month 1 (30 Days)</strong>
                      <p>{treeData.hasFruits ? 'Fruits Grown!' : 'Reach 30 days to grow fruits'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="helper-note">
              Your virtual tree grows every day you earn <strong>= 20 SP</strong>. If you miss a day, the growth pauses. Let's make it blossom!
            </p>
          </div>
        </div>

        {/* Right Section: Daily Streak */}
        <div className="motivation-section daily-streak-section">
          <h2 className="section-title">🔥 Daily Streak (10 SP/Day)</h2>

          {/* Milestone Badges Panel */}
          <div className="panel milestones-panel" style={{ margin: 0 }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>🏅 Milestone Badges</h2>
              <span className="streak-badge" style={{ background: '#fff7ed', color: '#ea580c', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '800' }}>
                🔥 Active Streak: {milestones.currentStreak} {milestones.currentStreak === 1 ? 'Day' : 'Days'}
              </span>
            </div>
            
            <p className="helper-note" style={{ margin: '8px 0 16px 0' }}>
              Maintain consecutive days of earning <strong>&ge; 10 SP</strong> to unlock these exclusive status badges!
            </p>

            <div className="badges-grid">
              {MILESTONE_DEFINITIONS.map(badge => {
                const isUnlocked = unlockedBadges.includes(badge.name);
                return (
                  <div key={badge.name} className={`badge-card ${isUnlocked ? 'unlocked' : 'locked'}`}>
                    <div className="badge-icon">
                      {badge.icon}
                    </div>
                    <div className="badge-details">
                      <strong className="badge-title">{badge.name}</strong>
                      <span className="badge-days">{badge.days} Days</span>
                      <span className="badge-status">{isUnlocked ? 'Unlocked 🔓' : 'Locked 🔒'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Friends Activity Panel */}
          <div className="panel friends-panel" style={{ margin: 0 }}>
            <div className="panel-head">
              <h2>👥 Friends Activity</h2>
            </div>
            <p className="helper-note" style={{ margin: '8px 0 16px 0' }}>
              See how your peers are doing! Only streak counts are visible to respect everyone's privacy.
            </p>

            <div className="friends-list">
              {friendsActivity.map((friend, idx) => (
                <div key={idx} className={`friend-item ${friend.isSelf ? 'is-self' : ''}`}>
                  <span className="friend-name">
                    {friend.isSelf ? 'You' : friend.name}
                  </span>
                  <span className="friend-streak">
                    🔥 {friend.streak} {friend.streak === 1 ? 'Day' : 'Days'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {showSpinModal && (
        <div className="spin-wheel-overlay" onClick={e => e.target === e.currentTarget && !spinning && closeRewardModal()}>
          <div className="spin-wheel-modal">
            {!spinning && !rewardResult && (
              <button onClick={closeRewardModal} className="spin-wheel-close-btn">&times;</button>
            )}
            
            <h2 className="spin-wheel-title">🎲 Spin the Lucky Wheel!</h2>
            <p className="spin-wheel-subtitle">Win bonus SP or double your points earned today!</p>

            <div className="wheel-container">
              <div className="wheel-pointer"></div>
              <svg 
                id="lucky-wheel"
                width="250" 
                height="250" 
                viewBox="0 0 200 200" 
                style={{ 
                  transform: `rotate(${rotationAngle}deg)`
                }}
              >
                <circle cx="100" cy="100" r="98" fill="#1e293b" stroke="#f1f5f9" strokeWidth="4" />
                
                {/* 5 sectors with correct R=98 coordinates and shades of red */}
                <path d="M 100 100 L 100 2 A 98 98 0 0 1 193.2 69.7 Z" fill="#fca5a5" stroke="#0f172a" strokeWidth="1" />
                <path d="M 100 100 L 193.2 69.7 A 98 98 0 0 1 157.6 179.3 Z" fill="#f87171" stroke="#0f172a" strokeWidth="1" />
                <path d="M 100 100 L 157.6 179.3 A 98 98 0 0 1 42.4 179.3 Z" fill="#ef4444" stroke="#0f172a" strokeWidth="1" />
                <path d="M 100 100 L 42.4 179.3 A 98 98 0 0 1 6.8 69.7 Z" fill="#dc2626" stroke="#0f172a" strokeWidth="1" />
                <path d="M 100 100 L 6.8 69.7 A 98 98 0 0 1 100 2 Z" fill="#991b1b" stroke="#0f172a" strokeWidth="1" />

                {/* Sector text labels with high-contrast color depending on background shade */}
                <text x="145" y="55" fill="#1e293b" fontSize="10" fontWeight="bold" transform="rotate(36, 145, 55)" textAnchor="middle">+5 SP</text>
                <text x="165" y="125" fill="#fff" fontSize="10" fontWeight="bold" transform="rotate(108, 165, 125)" textAnchor="middle">+10 SP</text>
                <text x="100" y="170" fill="#fff" fontSize="10" fontWeight="bold" transform="rotate(180, 100, 170)" textAnchor="middle">+15 SP</text>
                <text x="35" y="125" fill="#fff" fontSize="10" fontWeight="bold" transform="rotate(252, 35, 125)" textAnchor="middle">+20 SP</text>
                <text x="55" y="55" fill="#fff" fontSize="9" fontWeight="bold" transform="rotate(324, 55, 55)" textAnchor="middle">⭐ 2x SP</text>

                <circle cx="100" cy="100" r="18" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
                <circle cx="100" cy="100" r="8" fill="#e2e8f0" />
              </svg>
            </div>

            {!spinning && !rewardResult && (
              <button onClick={handleSpin} className="spin-wheel-btn">
                🎰 SPIN THE WHEEL!
              </button>
            )}

            {spinning && (
              <div className="spin-wheel-loading">
                🔮 Spin in progress, wishing you luck...
              </div>
            )}

            {rewardResult && (
              <div className="reward-result-panel">
                <div className="reward-result-emoji">🎉</div>
                <h3 className="reward-result-title">Congratulations!</h3>
                <p className="reward-result-desc">
                  You won: <strong className="reward-result-value">{rewardResult.label}</strong>
                  {rewardResult.type === 'double_sp' ? ` (+${rewardResult.value} SP added to your profile)` : ` (+${rewardResult.value} SP applied to your account)`}
                </p>
                <button onClick={closeRewardModal} className="reward-result-btn">
                  Awesome!
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function GrowthTreeSvg({ stage }) {
  const cappedStage = Math.min(30, stage);
  
  // Trunk height scales with successful days
  const maxTrunkHeight = 110;
  const minTrunkHeight = 15;
  const trunkHeight = minTrunkHeight + (cappedStage / 30) * (maxTrunkHeight - minTrunkHeight);
  
  const hasSprout = cappedStage > 0;
  const leafCount = Math.min(6, cappedStage);
  
  const showFlowers = stage >= 7;
  const showFruits = stage >= 30;

  return (
    <svg width="180" height="180" viewBox="0 0 200 200" className="growth-tree-svg">
      {/* Ground Mound */}
      <path d="M 20 180 Q 100 160 180 180" stroke="var(--line)" strokeWidth="3" fill="none" />
      <path d="M 20 180 L 180 180 L 180 195 L 20 195 Z" fill="#8B5A2B" opacity="0.85" />
      <ellipse cx="100" cy="180" rx="20" ry="6" fill="#5C4033" />
      
      {/* Seed (Stage 0) */}
      {!hasSprout && (
        <g className="seed-group">
          <ellipse cx="100" cy="176" rx="6" ry="4" fill="#D2B48C" />
          <circle cx="98" cy="174" r="1" fill="#FFF" opacity="0.7" />
          {/* Sprout hint */}
          <path d="M 100 174 Q 102 170 99 166" stroke="#4CAF50" strokeWidth="1.5" fill="none" />
        </g>
      )}

      {/* Main Trunk */}
      {hasSprout && (
        <path
          d={`M 100 180 Q 98 ${180 - trunkHeight / 2} 100 ${180 - trunkHeight}`}
          stroke={cappedStage >= 30 ? "#5C4033" : "#4CAF50"}
          strokeWidth={cappedStage >= 30 ? "8" : cappedStage >= 7 ? "5" : "3"}
          strokeLinecap="round"
          fill="none"
          className="trunk-path"
        />
      )}

      {/* Sprout Leaves (Stage 1-6) */}
      {hasSprout && cappedStage < 7 && (
        <g className="sprout-leaves">
          {leafCount >= 1 && (
            <path d={`M 100 ${180 - trunkHeight * 0.3} Q 85 ${180 - trunkHeight * 0.4} 88 ${180 - trunkHeight * 0.55} Q 97 ${180 - trunkHeight * 0.45} 100 ${180 - trunkHeight * 0.3}`} fill="#81C784" />
          )}
          {leafCount >= 2 && (
            <path d={`M 100 ${180 - trunkHeight * 0.5} Q 115 ${180 - trunkHeight * 0.6} 112 ${180 - trunkHeight * 0.75} Q 103 ${180 - trunkHeight * 0.65} 100 ${180 - trunkHeight * 0.5}`} fill="#81C784" />
          )}
          {leafCount >= 3 && (
            <path d={`M 100 ${180 - trunkHeight * 0.7} Q 87 ${180 - trunkHeight * 0.78} 90 ${180 - trunkHeight * 0.9} Q 98 ${180 - trunkHeight * 0.82} 100 ${180 - trunkHeight * 0.7}`} fill="#81C784" />
          )}
          {leafCount >= 4 && (
            <path d={`M 100 ${180 - trunkHeight} Q 92 ${180 - trunkHeight - 12} 100 ${180 - trunkHeight - 18} Q 108 ${180 - trunkHeight - 12} 100 ${180 - trunkHeight}`} fill="#66BB6A" />
          )}
        </g>
      )}

      {/* Mature Tree branches and foliage (Stage >= 7) */}
      {cappedStage >= 7 && (
        <g className="mature-foliage">
          {/* Branches */}
          <path d={`M 100 ${180 - trunkHeight * 0.5} Q 85 ${180 - trunkHeight * 0.7} 80 ${180 - trunkHeight * 0.85}`} stroke="#5C4033" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d={`M 100 ${180 - trunkHeight * 0.6} Q 115 ${180 - trunkHeight * 0.75} 120 ${180 - trunkHeight * 0.9}`} stroke="#5C4033" strokeWidth="3" strokeLinecap="round" fill="none" />
          
          {/* Foliage blocks */}
          <circle cx="100" cy={180 - trunkHeight - 8} r="24" fill="#2E7D32" />
          <circle cx="80" cy={180 - trunkHeight * 0.85} r="18" fill="#388E3C" />
          <circle cx="120" cy={180 - trunkHeight * 0.9} r="18" fill="#388E3C" />
          <circle cx="100" cy={180 - trunkHeight - 20} r="16" fill="#4CAF50" />
        </g>
      )}

      {/* Flowers (Stage >= 7) */}
      {showFlowers && (
        <g className="tree-flowers">
          {/* Left flower */}
          <g transform={`translate(80, ${180 - trunkHeight * 0.85})`} className="blossom">
            <circle cx="0" cy="0" r="3" fill="#E91E63" />
            <circle cx="-4" cy="0" r="2.5" fill="#F48FB1" opacity="0.9" />
            <circle cx="4" cy="0" r="2.5" fill="#F48FB1" opacity="0.9" />
            <circle cx="0" cy="-4" r="2.5" fill="#F48FB1" opacity="0.9" />
            <circle cx="0" cy="4" r="2.5" fill="#F48FB1" opacity="0.9" />
          </g>
          {/* Right flower */}
          <g transform={`translate(120, ${180 - trunkHeight * 0.9})`} className="blossom">
            <circle cx="0" cy="0" r="3" fill="#E91E63" />
            <circle cx="-4" cy="0" r="2.5" fill="#F48FB1" opacity="0.9" />
            <circle cx="4" cy="0" r="2.5" fill="#F48FB1" opacity="0.9" />
            <circle cx="0" cy="-4" r="2.5" fill="#F48FB1" opacity="0.9" />
            <circle cx="0" cy="4" r="2.5" fill="#F48FB1" opacity="0.9" />
          </g>
          {/* Top flower */}
          <g transform={`translate(100, ${180 - trunkHeight - 12})`} className="blossom">
            <circle cx="0" cy="0" r="3" fill="#FFEB3B" />
            <circle cx="-4" cy="0" r="2.5" fill="#FFF59D" opacity="0.9" />
            <circle cx="4" cy="0" r="2.5" fill="#FFF59D" opacity="0.9" />
            <circle cx="0" cy="-4" r="2.5" fill="#FFF59D" opacity="0.9" />
            <circle cx="0" cy="4" r="2.5" fill="#FFF59D" opacity="0.9" />
          </g>
        </g>
      )}

      {/* Fruits (Stage >= 30) */}
      {showFruits && (
        <g className="tree-fruits">
          {/* Apple 1 */}
          <g transform={`translate(75, ${180 - trunkHeight * 0.7})`} className="apple">
            <circle cx="0" cy="0" r="5.5" fill="#F44336" />
            <path d="M 0 -5.5 C 1 -7.5 2 -8 3 -7.5" stroke="#5C4033" strokeWidth="1" fill="none" />
          </g>
          {/* Apple 2 */}
          <g transform={`translate(125, ${180 - trunkHeight * 0.75})`} className="apple">
            <circle cx="0" cy="0" r="5.5" fill="#F44336" />
            <path d="M 0 -5.5 C 1 -7.5 2 -8 3 -7.5" stroke="#5C4033" strokeWidth="1" fill="none" />
          </g>
          {/* Apple 3 */}
          <g transform={`translate(98, ${180 - trunkHeight - 25})`} className="apple">
            <circle cx="0" cy="0" r="5.5" fill="#F44336" />
            <path d="M 0 -5.5 C 1 -7.5 2 -8 3 -7.5" stroke="#5C4033" strokeWidth="1" fill="none" />
          </g>
        </g>
      )}
    </svg>
  );
}

