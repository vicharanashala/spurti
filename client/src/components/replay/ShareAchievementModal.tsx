import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ============================================================
// Premium Share & Export modal for "Your Week in Spurti"
// Generates a React-rendered achievement card, captures it
// with html2canvas at 2x scale, and offers:
//   - PNG download
//   - PDF download (Letter, landscape, centered)
//   - Quick share to LinkedIn / X / WhatsApp / Telegram / Email
//   - Copy-link to clipboard
// ============================================================

const TITLE_MAP = [
  { min: 800, label: '🏆 Spurti Legend' },
  { min: 500, label: '🔥 Spurti Champion' },
  { min: 300, label: '⚡ Spurti Achiever' },
  { min: 150, label: '🌱 Spurti Builder' },
  { min: 0, label: '✨ Spurti Starter' }
];

function deriveTitle(weeklySp) {
  return (TITLE_MAP.find(t => weeklySp >= t.min) || TITLE_MAP[TITLE_MAP.length - 1]).label;
}

function fmtRange(startIso, endIso) {
  if (!startIso || !endIso) return 'This Week';
  const fmt = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

// ============================================================
// The capture target — must remain a clean DOM tree (no
// refs into framer-motion children) so html2canvas can
// snapshot it deterministically.
// ============================================================
const AchievementCard = React.forwardRef(function AchievementCard({ payload }, ref) {
  const {
    studentName, weekLabel, weeklySp, weeklyRank, totalSp, cohortSize,
    badges = [], achievementTitle, sessionsAttended, pollsAnswered
  } = payload;

  return (
    <div className="achv-card" data-share-card ref={ref}>
      <div className="achv-card__decor achv-card__decor--1" />
      <div className="achv-card__decor achv-card__decor--2" />
      <div className="achv-card__decor achv-card__decor--3" />

      <header className="achv-card__top">
        <div className="achv-card__brand">
          <span className="achv-card__brand-mark">S</span>
          <div>
            <div className="achv-card__brand-name">SPURTI</div>
            <div className="achv-card__brand-tag">VLED Summer · Spurti Points</div>
          </div>
        </div>
        <div className="achv-card__week">{weekLabel}</div>
      </header>

      <div className="achv-card__hero">
        <div className="achv-card__eyebrow">WEEKLY ACHIEVEMENT</div>
        <div className="achv-card__title">{achievementTitle}</div>
        <div className="achv-card__student">{studentName}</div>
      </div>

      <div className="achv-card__stats">
        <div className="achv-card__stat achv-card__stat--sp">
          <div className="achv-card__stat-label">Weekly SP</div>
          <div className="achv-card__stat-value">+{weeklySp}</div>
          <div className="achv-card__stat-foot">{totalSp} total</div>
        </div>
        <div className="achv-card__stat achv-card__stat--rank">
          <div className="achv-card__stat-label">Weekly Rank</div>
          <div className="achv-card__stat-value">#{weeklyRank}</div>
          <div className="achv-card__stat-foot">of {cohortSize}</div>
        </div>
        <div className="achv-card__stat">
          <div className="achv-card__stat-label">Sessions</div>
          <div className="achv-card__stat-value">{sessionsAttended}</div>
          <div className="achv-card__stat-foot">attended</div>
        </div>
        <div className="achv-card__stat">
          <div className="achv-card__stat-label">Polls</div>
          <div className="achv-card__stat-value">{pollsAnswered}</div>
          <div className="achv-card__stat-foot">answered</div>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="achv-card__badges">
          <div className="achv-card__badges-label">BADGES EARNED</div>
          <div className="achv-card__badges-row">
            {badges.slice(0, 5).map((b, i) => (
              <span key={i} className="achv-card__badge">{b}</span>
            ))}
          </div>
        </div>
      )}

      <footer className="achv-card__footer">
        <span className="achv-card__footer-mark">SPURTI</span>
        <span className="achv-card__footer-text">Built through showing up.</span>
        <span className="achv-card__footer-url">spurti.app</span>
      </footer>
    </div>
  );
});

// ============================================================
// Public modal
// ============================================================
export function ShareAchievementModal({ open, onClose, payload }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'png' | 'pdf' | null
  const [copied, setCopied] = useState(false);

  const safePayload = useMemo(() => ({
    studentName: 'Student',
    weekLabel: 'This Week',
    weeklySp: 0,
    weeklyRank: '—',
    totalSp: 0,
    cohortSize: '—',
    badges: [],
    achievementTitle: 'Spurti Builder',
    sessionsAttended: 0,
    pollsAnswered: 0,
    ...(payload || {})
  }), [payload]);

  const shareText = useMemo(() => {
    const p = safePayload;
    const title = p.achievementTitle || deriveTitle(p.weeklySp);
    return `${p.studentName} earned the ${title} on Spurti — +${p.weeklySp} SP this week (Rank #${p.weeklyRank}). Built through showing up.`;
  }, [safePayload]);

  const shareUrl = typeof window !== 'undefined' ? window.location.origin + '/spurti/' : 'https://spurti.app/';
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedSubject = encodeURIComponent(`My Spurti Weekly Achievement — +${safePayload.weeklySp} SP`);

  const captureCanvas = useCallback(async (scale = 2) => {
    if (!cardRef.current) return null;
    return html2canvas(cardRef.current, {
      scale,
      backgroundColor: null,
      useCORS: true,
      logging: false
    });
  }, []);

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportPNG = useCallback(async () => {
    setBusy('png');
    try {
      const canvas = await captureCanvas(2);
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        downloadFile(blob, `spurti-week-${safePayload.studentName?.replace(/\s+/g, '_') || 'achievement'}.png`);
      }, 'image/png');
    } finally {
      setBusy(null);
    }
  }, [captureCanvas, safePayload.studentName]);

  const exportPDF = useCallback(async () => {
    setBusy('pdf');
    try {
      const canvas = await captureCanvas(2);
      if (!canvas) return;
      const imgData = canvas.toDataURL('image/png');
      // Letter landscape: 11 x 8.5 in. Card is 1080x680 (≈ 1.59:1) — fits with margin.
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 0.5;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = canvas.width / canvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(imgData, 'PNG', x, y, w, h, undefined, 'FAST');
      pdf.save(`spurti-week-${safePayload.studentName?.replace(/\s+/g, '_') || 'achievement'}.pdf`);
    } finally {
      setBusy(null);
    }
  }, [captureCanvas, safePayload.studentName]);

  const shareTo = {
    linkedin: () => window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}&summary=${encodedText}`,
      '_blank', 'noopener,noreferrer,width=600,height=600'
    ),
    x: () => window.open(
      `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}&via=spurti_app`,
      '_blank', 'noopener,noreferrer,width=600,height=600'
    ),
    whatsapp: () => window.open(
      `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}`,
      '_blank', 'noopener,noreferrer'
    ),
    telegram: () => window.open(
      `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      '_blank', 'noopener,noreferrer'
    ),
    email: () => {
      const body = `${shareText}\n\n${shareUrl}`;
      window.location.href = `mailto:?subject=${encodedSubject}&body=${encodeURIComponent(body)}`;
    },
    copyLink: async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          // Fallback for older browsers / non-secure contexts.
          const ta = document.createElement('textarea');
          ta.value = shareUrl;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="share-achv"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog" aria-modal="true" aria-labelledby="share-achv-title"
        >
          <motion.div className="share-achv__inner"
            initial={{ y: 16, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="share-achv__close" onClick={onClose} aria-label="Close">×</button>
            <div className="share-achv__head">
              <h2 id="share-achv-title">📤 Share Your Achievement</h2>
              <p>Export as PNG or PDF, or post directly to your favorite platform.</p>
            </div>

            <div className="share-achv__preview">
              <AchievementCard payload={safePayload} ref={cardRef} />
            </div>

            <div className="share-achv__export">
              <button type="button" className="share-achv__btn share-achv__btn--primary"
                onClick={exportPNG} disabled={busy !== null}>
                {busy === 'png' ? 'Rendering…' : '🖼 Export PNG'}
              </button>
              <button type="button" className="share-achv__btn share-achv__btn--primary"
                onClick={exportPDF} disabled={busy !== null}>
                {busy === 'pdf' ? 'Rendering…' : '📄 Export PDF'}
              </button>
            </div>

            <div className="share-achv__share">
              <span className="share-achv__share-label">Quick share</span>
              <div className="share-achv__share-grid">
                <button type="button" className="share-achv__share-btn" onClick={shareTo.linkedin} title="Share on LinkedIn">
                  <span className="share-achv__share-ico" aria-hidden="true">in</span>
                  <span>LinkedIn</span>
                </button>
                <button type="button" className="share-achv__share-btn" onClick={shareTo.x} title="Share on X (Twitter)">
                  <span className="share-achv__share-ico" aria-hidden="true">𝕏</span>
                  <span>X</span>
                </button>
                <button type="button" className="share-achv__share-btn" onClick={shareTo.whatsapp} title="Share on WhatsApp">
                  <span className="share-achv__share-ico" aria-hidden="true">📱</span>
                  <span>WhatsApp</span>
                </button>
                <button type="button" className="share-achv__share-btn" onClick={shareTo.telegram} title="Share on Telegram">
                  <span className="share-achv__share-ico" aria-hidden="true">✈</span>
                  <span>Telegram</span>
                </button>
                <button type="button" className="share-achv__share-btn" onClick={shareTo.email} title="Share via Email">
                  <span className="share-achv__share-ico" aria-hidden="true">✉</span>
                  <span>Email</span>
                </button>
                <button type="button" className={`share-achv__share-btn ${copied ? 'is-copied' : ''}`} onClick={shareTo.copyLink} title="Copy link">
                  <span className="share-achv__share-ico" aria-hidden="true">{copied ? '✓' : '🔗'}</span>
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
