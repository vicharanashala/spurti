import React, { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import vicharanshalaLogo from '../assets/vicharanshala_logo.png';
import iitRoparLogo from '../assets/iit_ropar_logo.png';

export default function ShareCard({ student, badges = [], onClose }) {
  const [copied, setCopied] = useState(false);
  const [liCopied, setLiCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  const cardRef = useRef(null);

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

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    setStatusMessage('Generating card image…');
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        useCors: true,
        backgroundColor: 'var(--panel)'
      });
      const link = document.createElement('a');
      link.download = `${name.replace(/\s+/g, '_')}_spurti_achievement.png`;
      link.href = dataUrl;
      link.click();
      setStatusMessage('✅ Card image downloaded successfully!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error('Error generating card image:', err);
      setStatusMessage('❌ Failed to generate card image.');
      setTimeout(() => setStatusMessage(''), 3000);
    } finally {
      setSharing(false);
    }
  };

  const handleShareImage = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    setStatusMessage('Generating card image…');
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        useCors: true,
        backgroundColor: 'var(--panel)'
      });
      
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'spurti-achievement.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Spurti Achievement Card',
          text: `🎯 I just reached Level ${level} in the Spurti Motivation Engine!`
        });
        setStatusMessage('✅ Shared successfully!');
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        // Fallback: download and copy text
        const link = document.createElement('a');
        link.download = `${name.replace(/\s+/g, '_')}_spurti_achievement.png`;
        link.href = dataUrl;
        link.click();
        
        navigator.clipboard.writeText(shareText).catch(() => {});
        setStatusMessage('ℹ️ Web Share not supported. Card downloaded; description copied to clipboard!');
        setTimeout(() => setStatusMessage(''), 6000);
      }
    } catch (err) {
      console.error('Error sharing card image:', err);
      setStatusMessage('❌ Failed to share image.');
      setTimeout(() => setStatusMessage(''), 3000);
    } finally {
      setSharing(false);
    }
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
          <div className="achievement-card" ref={cardRef}>
            <div className="achievement-logos">
              <img
                src={vicharanshalaLogo}
                alt="VLED Logo"
                className="achievement-logo"
                crossOrigin="anonymous"
              />
              <img
                src={iitRoparLogo}
                alt="IIT Ropar Logo"
                className="achievement-logo"
                crossOrigin="anonymous"
              />
            </div>
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

          {/* LinkedIn / Sharing status note */}
          {liCopied && (
            <div style={{
              margin: '12px 0 0',
              padding: '10px 14px',
              background: 'var(--card-bg)',
              border: '1px solid var(--primary)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: 'var(--text)',
              width: '100%',
              textAlign: 'center'
            }}>
              ✅ <strong>Achievement text copied!</strong> LinkedIn is now opening — just paste it into your post (Ctrl+V / Cmd+V).
            </div>
          )}

          {statusMessage && (
            <div className="share-status-message">
              {statusMessage}
            </div>
          )}

          {/* Social Share Buttons */}
          <div className="share-buttons-row">
            <button onClick={handleShareImage} disabled={sharing} className="share-btn share-img" data-testid="image-share">
              📤 Share Card (Image)
            </button>
            <button onClick={handleDownload} disabled={sharing} className="share-btn download" data-testid="download-share">
              💾 Download Card
            </button>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="share-btn whatsapp" data-testid="whatsapp-share">
              💬 WhatsApp
            </a>
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="share-btn twitter" data-testid="twitter-share">
              🐦 Twitter
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
