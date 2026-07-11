import React, { useState, useEffect } from 'react';

export default function MotivationDashboard({ student }) {
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!student?._id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const treeRes = await fetch(`/api/growth-tree/${student._id}`);

        if (!treeRes.ok) {
          throw new Error('Failed to load motivation data');
        }

        const tData = await treeRes.json();

        setTreeData(tData);
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

  return (
    <section className="motivation-dashboard">
      {/* 1. Growth Tree Section */}
      <div className="panel growth-tree-panel">
        <div className="panel-head">
          <h2>🌱 Growth Tree</h2>
        </div>
        
        <div className="tree-container">
          <GrowthTreeSvg stage={treeData.successfulDays} />
          
          <div className="tree-details">
            <p className="tree-status-text">
              Stage: <strong>{treeData.successfulDays} Successful Days</strong>
            </p>
            
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
