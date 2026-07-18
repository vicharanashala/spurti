import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

function useCountUp(target, duration) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const delta = (target || 0) - from;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + delta * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export const StorySlide = ({ slide, index, total, onNext, onPrev, autoMs }) => {
  if (!autoMs) autoMs = 3500;
  const count = useCountUp(slide.count || 0, 1200);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const t = (now - start) / autoMs;
      if (t >= 1) { if (onNext) onNext(); return; }
      setElapsed(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [index, autoMs, onNext]);

  return (
    <motion.div key={index} className="story-slide" style={{ background: slide.gradient }}
      initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      <div className="story-progress">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="story-progress__bar">
            <div className="story-progress__fill" style={{ width: i < index ? '100%' : i === index ? (elapsed * 100) + '%' : '0%' }} />
          </div>
        ))}
      </div>
      <button type="button" className="story-close" onClick={() => onPrev && onPrev('close')} aria-label="Close">×</button>
      <button type="button" className="story-tap story-tap--left" onClick={() => onPrev && onPrev('prev')} aria-label="Previous" />
      <button type="button" className="story-tap story-tap--right" onClick={() => onNext && onNext('next')} aria-label="Next" />
      <motion.div className="story-content" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.45 }}>
        <div className="story-eyebrow">{slide.eyebrow}</div>
        {slide.title && <h2 className="story-title">{slide.title}</h2>}
        <div className="story-count" aria-live="polite">{count.toLocaleString()}{slide.suffix || ''}</div>
        {slide.subtitle && <p className="story-subtitle">{slide.subtitle}</p>}
        {slide.trio && (
          <div className="story-trio">
            {slide.trio.map((t, i) => (
              <div key={i} className="story-trio__cell">
                <span className="story-trio__label">{t.label}</span>
                <strong className="story-trio__value">{t.value}</strong>
              </div>
            ))}
          </div>
        )}
        {slide.cta && (
          <div className="story-cta-row">
            {slide.cta.map((c, i) => (
              <button key={i} type="button" className={'story-cta-btn' + (c.primary ? ' is-primary' : '')} onClick={c.onClick}>{c.label}</button>
            ))}
          </div>
        )}
      </motion.div>
      {slide.decor === 'sparkles' && <SparkleField />}
      {slide.decor === 'confetti' && <ConfettiBurst />}
      {slide.decor === 'rankline' && <RankLine from={slide.from} to={slide.to} />}
    </motion.div>
  );
}

function SparkleField() {
  return (
    <div className="story-decor story-decor--sparkle" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.span key={i} className="story-sparkle"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0.6, 0], scale: [0, 1, 0.7, 0], y: [0, -40, -80, -120] }}
          transition={{ duration: 3.4 + (i % 4) * 0.4, delay: (i * 0.18) % 2.4, repeat: Infinity }}
          style={{ left: (4 + (i * 7.3) % 92) + '%', bottom: '8%', width: 4 + (i % 3), height: 4 + (i % 3) }}
        />
      ))}
    </div>
  );
}

function ConfettiBurst() {
  const colors = ['#FBBF24','#F59E0B','#EC4899','#8B5CF6','#10B981','#3B82F6'];
  return (
    <div className="story-decor story-decor--confetti" aria-hidden="true">
      {Array.from({ length: 22 }).map((_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        const r = 80 + (i % 5) * 18;
        const tx = Math.cos(angle) * r;
        const ty = Math.sin(angle) * r;
        return (
          <motion.span key={i} className="story-confetti"
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: tx, y: ty + 60, opacity: [1, 1, 0], rotate: 360 + i * 18 }}
            transition={{ duration: 2.6, delay: (i % 6) * 0.05, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.8 }}
            style={{ background: colors[i % colors.length] }}
          />
        );
      })}
    </div>
  );
}

function RankLine({ from, to }) {
  const yTo = Math.max(2, 100 - Math.min(99, (to / 700) * 100));
  const yFrom = Math.max(2, 100 - Math.min(99, (from / 700) * 100));
  return (
    <svg viewBox="0 0 200 100" className="story-rankline" preserveAspectRatio="none">
      <line x1="0" y1="100" x2="200" y2="100" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
      <motion.path d={'M 0 ' + yFrom + ' Q 100 ' + (Math.min(yFrom, yTo) - 10) + ', 200 ' + yTo}
        fill="none" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeOut' }} />
      <motion.circle cx="200" cy={yTo} r="2.4" fill="#FBBF24" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 2.0, duration: 0.4 }} />
    </svg>
  );
}