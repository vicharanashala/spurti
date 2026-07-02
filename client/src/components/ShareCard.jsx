import React, { useState } from 'react';

export default function ShareCard({ student, badges = [], onClose }) {
  const [copied, setCopied] = useState(false);
  
  if (!student) return null;

  const { name, level, trophyLeague, rank, totalSp } = student;
  const shareUrl = window.location.origin + (window.location.pathname.startsWith('/spurti') ? '/spurti' : '');
  const shareText = `I just reached Level ${level} in Spurti Motivation Engine with ${totalSp} SP (Rank ${rank})! Trophy League: ${trophyLeague}. Proud of my learning consistency! ⚡ #Spurti #CohortLearning`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText + " " + shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="share-modal-overlay">
      <div className="modal" style={{ maxWidth: '480px' }}>
        <div className="modal-head">
          <h2>Share Achievements</h2>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        
        <div className="share-modal-content">
          {/* Achievement Card Mockup */}
          <div className="achievement-card">
            <div className="achievement-header">Spurti Achievement Card</div>
            <div className="achievement-name">{name}</div>
            
            <div className="achievement-stat-grid">
              <div className="achievement-stat">
                <span>Spurti Points</span>
                <strong>{totalSp} SP</strong>
              </div>
              <div className="achievement-stat">
                <span>Cohort Rank</span>
                <strong>#{rank}</strong>
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

          {/* Social Share Buttons */}
          <div className="share-buttons-row">
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="share-btn twitter" data-testid="twitter-share">
              🐦 Twitter
            </a>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="share-btn whatsapp" data-testid="whatsapp-share">
              💬 WhatsApp
            </a>
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="share-btn linkedin" data-testid="linkedin-share">
              🔗 LinkedIn
            </a>
            <button onClick={handleCopy} className="share-btn copy" data-testid="copy-share">
              📋 {copied ? 'Copied!' : 'Copy Info'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
