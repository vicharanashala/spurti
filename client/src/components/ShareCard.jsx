import React, { useState } from 'react';

export default function ShareCard({ student, badges = [], onClose }) {
  const [copied, setCopied] = useState(false);
  const [liCopied, setLiCopied] = useState(false);

  if (!student) return null;

  const { name, level, trophyLeague, rank, totalSp } = student;
  
  // Dynamically resolve the rank and context label
  const isGroupContext = window.__lastSharedContext === 'group';
  const displayRank = isGroupContext && window.__lastSharedRank !== undefined
    ? window.__lastSharedRank
    : rank;

  // Full achievement text for sharing
  const shareText = `🎯 I just reached Level ${level} in the Spurti Motivation Engine!\n\n📊 My Stats:\n• Spurti Points: ${totalSp} SP\n• ${isGroupContext ? 'Onboarding Group Rank' : 'Cohort Rank'}: #${displayRank}\n• Level: ${level}\n• Trophy League: ${trophyLeague}\n\nProud of my learning consistency! ⚡\n#Spurti #CohortLearning #SpurtiMotivation`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // LinkedIn: open a new post with the text pre-filled via the share-offsite
  // route. LinkedIn cannot crawl localhost, so we use the text-based share
  // URL which opens a compose window with the text already typed in.
  const handleLinkedIn = () => {
    // Copy the achievement text to clipboard first so the user can paste it
    navigator.clipboard.writeText(shareText).catch(() => {});
    setLiCopied(true);
    setTimeout(() => setLiCopied(false), 4000);
    // Open LinkedIn compose window
    window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank', 'noopener,noreferrer');
  };

  const handleClose = () => {
    delete window.__lastSharedRank;
    delete window.__lastSharedContext;
    onClose();
  };

  const twitterUrl  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && handleClose()} data-testid="share-modal-overlay">
      <div className="modal" style={{ maxWidth: '480px' }}>
        <div className="modal-head">
          <h2>Share Achievements</h2>
          <button className="icon" onClick={handleClose}>x</button>
        </div>

        <div className="share-modal-content">
          {/* Achievement Card */}
          <div className="achievement-card">
            <div className="achievement-header">Spurti Achievement Card</div>
            <div className="achievement-name">{name}</div>

            <div className="achievement-stat-grid">
              <div className="achievement-stat">
                <span>Spurti Points</span>
                <strong>{totalSp} SP</strong>
              </div>
              <div className="achievement-stat">
                <span>{isGroupContext ? 'Group Rank' : 'Cohort Rank'}</span>
                <strong>#{displayRank}</strong>
              </div>
              <div className="achievement-stat">
                <span>Current Level</span>
                <strong>Level {level}</strong>
              </div>
              <div className="achievement-stat">
                <span>Trophy League</span>
                <strong>{trophyLeague}</strong>
              </div>
            </div>

            {badges.length > 0 && (
              <div>
                <span className="eyebrow" style={{ fontSize: '10px', marginBottom: '6px' }}>Unlocked Badges</span>
                <div className="achievement-badges">
                  {badges.map(b => (
                    <span key={b} className="achievement-badge">{b}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="achievement-footer">
              consistency energy makes learning visible
            </div>
          </div>

          {/* LinkedIn note */}
          {liCopied && (
            <div style={{
              margin: '12px 0 0',
              padding: '10px 14px',
              background: 'var(--card-bg)',
              border: '1px solid var(--primary)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: 'var(--text)'
            }}>
              ✅ <strong>Achievement text copied!</strong> LinkedIn is now opening — just paste it into your post (Ctrl+V / Cmd+V).
            </div>
          )}

          {/* Social Share Buttons */}
          <div className="share-buttons-row">
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="share-btn twitter" data-testid="twitter-share">
              🐦 Twitter
            </a>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="share-btn whatsapp" data-testid="whatsapp-share">
              💬 WhatsApp
            </a>
            <button onClick={handleLinkedIn} className="share-btn linkedin" data-testid="linkedin-share">
              🔗 {liCopied ? 'Opening LinkedIn…' : 'LinkedIn'}
            </button>
            <button onClick={handleCopy} className="share-btn copy" data-testid="copy-share">
              📋 {copied ? 'Copied!' : 'Copy Text'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
