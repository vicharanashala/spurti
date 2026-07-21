import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import html2canvas from 'html2canvas';

function buildWeeklyShareHTML(data, studentName) {
  return '<div style="width:600px;padding:32px;background:linear-gradient(135deg,#0F172A 0%,#312E81 100%);color:white;font-family:system-ui,-apple-system,sans-serif;">'
    + '<div style="font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:12px;">📅 My Week in Spurti</div>'
    + '<div style="font-size:28px;font-weight:800;margin-bottom:24px;">' + (studentName || 'My') + ' Week in Spurti</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">'
    + statBlock(data.sessionsAttended || 0, 'Sessions')
    + statBlock(data.pollsAnswered || 0, 'Polls')
    + statBlock('+' + (data.spEarned || 0), 'SP')
    + '</div>'
    + '<div style="font-size:12px;opacity:0.85;text-align:center;">Most improved: <b>' + (data.most_improved || '—') + '</b></div>'
    + '<div style="margin-top:16px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.5;text-align:center;">Spurti · VLED Summer</div>'
    + '</div>';
}

function statBlock(value, label) {
  return '<div style="padding:14px;background:rgba(255,255,255,0.08);border-radius:10px;text-align:center;">'
    + '<div style="font-size:28px;font-weight:900;">' + value + '</div>'
    + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.8;">' + label + '</div>'
    + '</div>';
}

function buildFinalShareHTML(j, studentName) {
  return '<div style="width:600px;padding:32px;background:linear-gradient(135deg,#020617 0%,#BE185D 100%);color:white;font-family:system-ui,-apple-system,sans-serif;">'
    + '<div style="font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:12px;">🌌 My Spurti Journey</div>'
    + '<div style="font-size:28px;font-weight:800;margin-bottom:18px;">' + (studentName || 'I') + ' completed the journey</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
    + statBlock('#' + j.startRank, 'Start')
    + statBlock('#' + j.endRank, 'End')
    + statBlock('+' + j.totalSp, 'SP Earned')
    + statBlock(j.sessionsAttended, 'Sessions')
    + '</div>'
    + '<div style="padding:12px 16px;background:linear-gradient(135deg,rgba(253,224,71,0.18),rgba(251,146,60,0.18));border-radius:10px;text-align:center;font-weight:800;">🏆 ' + j.bestAchievement + '</div>'
    + '<div style="margin-top:16px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.5;text-align:center;">Spurti · VLED Summer</div>'
    + '</div>';
}

export const ShareCard = ({ open, onClose, kind = 'weekly', data, studentName }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!ref.current) return;
    ref.current.innerHTML = kind === 'final' ? buildFinalShareHTML(data, studentName) : buildWeeklyShareHTML(data, studentName);
  }, [open, kind, data, studentName]);

  async function download() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(ref.current.firstElementChild, { backgroundColor: null, scale: 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = (kind === 'final' ? 'spurti-journey' : 'spurti-week') + '-' + (studentName || 'card') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally { setBusy(false); }
  }

  function shareLinkedIn() {
    const text = encodeURIComponent('Just completed my Spurti journey! 🎉 ' + (kind === 'final' ? data.bestAchievement : 'What a week!') + ' #Spurti');
    const url = encodeURIComponent(typeof window !== 'undefined' ? window.location.href : 'https://spurti.app');
    window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url + '&summary=' + text, '_blank');
  }

  function printCertificate() {
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    const ach = (kind === 'final' && data) ? data.bestAchievement : 'Steady Contributor';
    const html = '<!doctype html><html><head><title>Certificate</title><style>body{font-family:Georgia,serif;text-align:center;padding:60px;background:linear-gradient(135deg,#fff8e1,#fff3d0);}h1{font-size:48px;margin:24px 0;color:#92400e;}.c{border:8px double #b45309;padding:60px;border-radius:12px;background:#fffaf0;}h2{font-size:28px;color:#7c2d12;}.name{font-size:36px;font-weight:700;color:#1e293b;margin:24px 0;}h3{font-size:18px;color:#92400e;}</style></head><body><div class="c"><h1>🏆 Certificate of Completion</h1><h2>VLED Summer Internship · Spurti</h2><p style="font-size:18px;margin-top:24px;">This certifies that</p><p class="name">' + (studentName || 'Student') + '</p><p style="font-size:18px;">has successfully completed the Spurti journey with the title</p><h3>' + ach + '</h3><p style="margin-top:32px;font-size:12px;color:#94a3b8;">Issued by Spurti · VLED Summer</p></div><script>window.onload=function(){window.print();}</script></body></html>';
    w.document.write(html);
    w.document.close();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="share-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="share-modal__inner" initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="share-modal__close" onClick={onClose} aria-label="Close">×</button>
            <h3 className="share-modal__title">📤 Share Your {kind === 'final' ? 'Journey' : 'Week'}</h3>
            <p className="share-modal__lede">Save as an image, share to LinkedIn, or print a certificate.</p>
            <div className="share-modal__preview" ref={ref} />
            <div className="share-modal__actions">
              <button type="button" className="share-modal__btn" onClick={download} disabled={busy}>{busy ? 'Saving…' : '⬇️ Download Image'}</button>
              <button type="button" className="share-modal__btn" onClick={shareLinkedIn}>🔗 Share on LinkedIn</button>
              {kind === 'final' && <button type="button" className="share-modal__btn" onClick={printCertificate}>📜 Print Certificate</button>}
              <button type="button" className="share-modal__btn is-ghost" onClick={onClose}>Close</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};