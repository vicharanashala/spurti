// Presentational primitives for the dashboard refresh. Everything here is
// hand-written (SVG, CSS classes in theme.css, the Web Animations API) — no
// packages. Anything that moves has a static fallback under reduced motion.
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { celebration, hueFor, initials, snapshotOf } from './progress.js';

/* ── Motion preference ─────────────────────────────────────────────────────── */
export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(reducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/* ── Icons (24px stroke set, hand-drawn) ───────────────────────────────────── */
const ICONS = {
  landmark: <><path d="M3 22h18" /><path d="M6 18v-7" /><path d="M10 18v-7" /><path d="M14 18v-7" /><path d="M18 18v-7" /><path d="M12 2 20 7H4z" /></>,
  route: <><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></>,
  dice: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  medal: <><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" /><path d="M11 12 5.12 2.2" /><path d="m13 12 5.88-9.8" /><path d="M8 7h8" /><circle cx="12" cy="17" r="5" /><path d="M12 18v-2h-.5" /></>,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  spark: <><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  trendUp: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  chat: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  sun: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2" /><path d="M12 21v2" /><path d="m4.22 4.22 1.42 1.42" /><path d="m18.36 18.36 1.42 1.42" /><path d="M1 12h2" /><path d="M21 12h2" /><path d="m4.22 19.78 1.42-1.42" /><path d="m18.36 5.64 1.42-1.42" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>
};

export function Icon({ name, size = 18, stroke = 2, className = '', style }) {
  return (
    <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={style}>
      {ICONS[name] || null}
    </svg>
  );
}

/* ── Count-up ──────────────────────────────────────────────────────────────── */
export function useCountUp(target, { from = 0, duration = 1000 } = {}) {
  const reduce = usePrefersReducedMotion();
  const [value, setValue] = useState(reduce ? target : from);
  useLayoutEffect(() => {
    if (reduce || from === target) { setValue(target); return undefined; }
    setValue(from);
    let raf; let t0;
    const tick = (t) => {
      if (t0 === undefined) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, from, duration, reduce]);
  return value;
}

/* ── Progress ring ─────────────────────────────────────────────────────────── */
export function Ring({ value = 0, size = 96, stroke = 10, from = '#2c4a8a', to = '#3b5b9d', children, label }) {
  const uid = useId().replace(/:/g, '');
  const reduce = usePrefersReducedMotion();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const [shown, setShown] = useState(reduce ? pct : 0);
  useEffect(() => {
    if (reduce) { setShown(pct); return undefined; }
    const raf = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct, reduce]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ui-ring" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={`rg${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <circle className="ui-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ui-ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#rg${uid})`}
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
          opacity={shown > 0 ? 1 : 0} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ui-ring-center">{children}</div>
    </div>
  );
}

/* ── Area chart with a hover read-out ──────────────────────────────────────── */
function smoothPath(pts, top, bottom) {
  if (pts.length < 2) return '';
  const clamp = (y) => Math.max(top, Math.min(bottom, y));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, clamp(p1[1] + (p2[1] - p0[1]) * t)];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, clamp(p2[1] - (p3[1] - p1[1]) * t)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// points: [{ v, label, sub, delta }]
export function AreaChart({ points, height = 150, from = '#2c4a8a', to = '#3b5b9d', unit = 'SP' }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const n = points.length;
  if (!n) return null;
  const W = 640; const H = height; const padX = 6; const padT = 14; const padB = 10;
  const vs = points.map(p => p.v);
  const lo = Math.min(...vs); const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => [
    n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - padX * 2),
    padT + (1 - (p.v - lo) / span) * (H - padT - padB)
  ]);
  const line = n === 1 ? '' : smoothPath(xy, padT, H - padB);
  const area = n === 1 ? '' : `${line} L${xy[n - 1][0]},${H} L${xy[0][0]},${H} Z`;
  const move = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHover(n === 1 ? 0 : Math.round(rel * (n - 1)));
  };
  const h = hover === null ? null : points[hover];
  const hp = hover === null ? null : xy[hover];
  const leftPct = hp ? (hp[0] / W) * 100 : 0;
  return (
    <div className="ui-area" style={{ height }} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${unit} over time, from ${lo} to ${hi}`}>
        <defs>
          <linearGradient id={`af${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={from} stopOpacity=".32" /><stop offset="1" stopColor={to} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`al${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        {area && <path className="ui-area-fill" d={area} fill={`url(#af${uid})`} />}
        {line && <path className="ui-area-line" d={line} fill="none" stroke={`url(#al${uid})`} strokeWidth="3"
          strokeLinecap="round" pathLength="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && (
        <>
          <span className="ui-area-cross" style={{ left: `${leftPct}%` }} />
          <span className="ui-area-dot" style={{ left: `${leftPct}%`, top: `${(hp[1] / H) * 100}%` }} />
          <div className={`ui-tip ${leftPct < 18 ? 'edge-l' : leftPct > 82 ? 'edge-r' : ''}`} style={{ left: `${leftPct}%` }}>
            <b>{h.v} {unit}</b>
            <span>{h.label}</span>
            {h.sub && <em>{h.sub}</em>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Small bits ────────────────────────────────────────────────────────────── */
export function Chip({ tone = '', icon, children, title }) {
  return (
    <span className={`ui-chip ${tone}`} title={title}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 40 }) {
  const h = hueFor(name);
  return (
    <span className="ui-avatar" aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38),
        background: `linear-gradient(135deg, hsl(${h} 38% 46%), hsl(${(h + 24) % 360} 42% 34%))` }}>
      {initials(name)}
    </span>
  );
}

export function Skeleton({ w = '100%', h = 14, r = 8, style }) {
  return <span className="ui-skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// A loading placeholder shaped like a card with a few rows of text.
export function SkeletonCard({ rows = 3, title = true }) {
  return (
    <div className="ui-card ui-skel-card" aria-busy="true" aria-live="polite">
      {title && <Skeleton w="38%" h={20} r={10} />}
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} w={`${92 - i * 14}%`} />)}
    </div>
  );
}

// Friendly empty state: a soft badge with an icon and a couple of floating dots.
export function EmptyState({ icon = 'spark', title, children }) {
  return (
    <div className="ui-empty">
      <div className="ui-empty-art" aria-hidden="true">
        <span className="d1" /><span className="d2" /><span className="d3" />
        <Icon name={icon} size={30} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

// True once `ref`'s element has scrolled up out of view (used to pin a compact bar).
export function useScrolledPast(ref) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/* ── Pointer effects ───────────────────────────────────────────────────────── */
// Spread onto a `.ui-spot` element: a soft highlight follows the cursor.
export const spotlight = {
  onPointerMove(e) {
    if (e.pointerType === 'touch' || reducedMotion()) return;
    const el = e.currentTarget; const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
};

export function useTilt(max = 7) {
  const ref = useRef(null);
  const onPointerMove = useCallback((e) => {
    if (e.pointerType === 'touch' || reducedMotion() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`);
    ref.current.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`);
    ref.current.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    ref.current.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  }, [max]);
  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  }, []);
  return { ref, onPointerMove, onPointerLeave };
}

/* ── Confetti (DOM particles + Web Animations, no canvas library) ──────────── */
let layer;
function confettiLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:900';
  document.body.appendChild(layer);
  return layer;
}

export const CONFETTI_COLORS = ['#2c4a8a', '#3b5b9d', '#c98a2b', '#e9b44c', '#8fa3c7', '#d6604d', '#5b8f7b'];

export function burst({ x, y, colors = CONFETTI_COLORS, count = 80, spread = 70, power = 1 } = {}) {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const host = confettiLayer();
  const ox = x ?? window.innerWidth / 2;
  const oy = y ?? window.innerHeight * 0.32;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    const w = 6 + Math.random() * 6; const h = w * (0.4 + Math.random() * 0.8);
    el.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:${colors[i % colors.length]};` +
      `border-radius:${Math.random() < 0.25 ? '50%' : '2px'};will-change:transform,opacity`;
    host.appendChild(el);
    const ang = ((-90 + (Math.random() - 0.5) * 2 * spread) * Math.PI) / 180;
    const speed = (300 + Math.random() * 420) * power;
    const vx = Math.cos(ang) * speed; const vy = Math.sin(ang) * speed;
    const dur = 1700 + Math.random() * 1100; const g = 1100;
    const spin = (Math.random() - 0.5) * 900;
    const frames = [];
    for (let k = 0; k <= 12; k++) {
      const p = k / 12; const t = (p * dur) / 1000;
      frames.push({
        transform: `translate(${ox + vx * t + Math.sin(t * 6 + i) * 12 * p}px, ${oy + vy * t + 0.5 * g * t * t}px) rotate(${spin * p}deg)`,
        opacity: p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1,
        offset: p
      });
    }
    const anim = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
    anim.onfinish = () => el.remove();
  }
}

/* ── Toasts ────────────────────────────────────────────────────────────────── */
const listeners = new Set();
let seq = 0;
export function toast(message, { tone = 'ok', icon = 'check' } = {}) {
  const t = { id: ++seq, message, tone, icon };
  listeners.forEach(fn => fn(t));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (t) => {
      setItems(xs => [...xs.slice(-2), t]);
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== t.id)), 3400);
    };
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);
  return (
    <div className="ui-toasts" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`ui-toast ${t.tone}`}><Icon name={t.icon} size={16} />{t.message}</div>
      ))}
    </div>
  );
}

/* ── "Your points went up" ─────────────────────────────────────────────────── */
// Compares this device's last-seen snapshot with the student's current one. The
// snapshot lives in localStorage (per student), so "since your last visit" means
// this browser; a private window simply never celebrates. Nothing here can throw.
export function useSpCelebration(student, { blocked = false } = {}) {
  const [cel, setCel] = useState(null);
  const anchorRef = useRef(null);
  const fired = useRef('');
  const id = student?._id;

  useLayoutEffect(() => {
    if (!id || blocked) return;
    const cur = snapshotOf(student);
    const key = `spurti:seen:v1:${id}`;
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(key) || 'null'); } catch { prev = null; }
    try { localStorage.setItem(key, JSON.stringify(cur)); } catch { /* no baseline, no confetti, no harm */ }
    const c = celebration(prev, cur);
    if (!c.kind) return;
    const stamp = `${id}:${c.from}>${c.to}`;
    if (fired.current === stamp) return;
    fired.current = stamp;
    setCel(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, student?.totalSp, student?.level, student?.trophyLeague, blocked]);

  useEffect(() => {
    if (!cel) return undefined;
    const go = setTimeout(() => {
      const r = anchorRef.current?.getBoundingClientRect();
      const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : {};
      if (cel.kind === 'sp') {
        burst({ ...at, count: 90 });
      } else {
        burst({ ...at, count: 150, power: 1.15 });
        setTimeout(() => burst({ x: window.innerWidth * 0.18, y: window.innerHeight * 0.55, count: 70, spread: 40 }), 260);
        setTimeout(() => burst({ x: window.innerWidth * 0.82, y: window.innerHeight * 0.55, count: 70, spread: 40 }), 420);
      }
    }, 450);
    const hide = setTimeout(() => setCel(null), 15000);
    return () => { clearTimeout(go); clearTimeout(hide); };
  }, [cel]);

  return { cel, dismiss: () => setCel(null), anchorRef };
}

/* ── Tabs with a sliding indicator ─────────────────────────────────────────── */
export function UiTabs({ tab, setTab, tabs, icons = {}, pinned = false, identity = null, extra = null }) {
  const listRef = useRef(null);
  const [ind, setInd] = useState({ x: 0, w: 0 });
  const measure = useCallback(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
  }, []);
  useLayoutEffect(measure, [tab, tabs.length, measure]);
  // Pinning changes the strip's padding and slides the identity in, so tab positions move for ~0.4s: keep re-measuring.
  useEffect(() => {
    let raf; const end = performance.now() + 600;
    const tick = () => { measure(); if (performance.now() < end) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pinned, measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  // Centre the active tab inside the strip. Scrolls the strip only — scrollIntoView
  // would also scroll the page down to the tabs on load.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector('[aria-selected="true"]');
    if (!list || !el) return;
    const left = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [tab]);
  return (
    <nav className={`ui-nav ${pinned ? 'is-pinned' : ''}`} aria-label="Dashboard sections">
      <div className="ui-nav-id" aria-hidden={!pinned}>{identity}</div>
      <div className="ui-tabs" role="tablist" ref={listRef}>
        <span className="ui-tab-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} aria-hidden="true" />
        {tabs.map(([key, label, badge]) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key}
            aria-controls="ui-panel" className={`ui-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon name={icons[key] || 'spark'} size={17} />
            <span>{label}</span>
            {badge > 0 && <b className="ui-tab-badge" aria-label={`${badge} new`}>{badge}</b>}
          </button>
        ))}
      </div>
      {extra}
    </nav>
  );
}


/* ── Pill group: a radio group with a sliding highlight (leaderboard boards / windows) ── */
export function PillGroup({ items, value, onChange, label, size = 'md' }) {
  const ref = useRef(null);
  const [ind, setInd] = useState({ x: 0, w: 0 });
  const measure = useCallback(() => {
    const el = ref.current?.querySelector('[aria-checked="true"]');
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
  }, []);
  useLayoutEffect(measure, [value, items.length, measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  // keep the chosen pill in view inside a scrolling strip (scrolls the strip only, never the page)
  useEffect(() => {
    const list = ref.current; const el = list?.querySelector('[aria-checked="true"]');
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: Math.max(0, el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [value]);
  const move = (e) => {
    const i = items.findIndex(it => it.key === value);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = items[(i + step + items.length) % items.length];
    onChange(next.key);
    requestAnimationFrame(() => ref.current?.querySelector('[aria-checked="true"]')?.focus());
  };
  return (
    <div className={`ui-sw ${size}`} role="radiogroup" aria-label={label} ref={ref} onKeyDown={move}>
      <span className="ui-sw-ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} aria-hidden="true" />
      {items.map(it => (
        <button key={it.key} type="button" role="radio" aria-checked={value === it.key} tabIndex={value === it.key ? 0 : -1}
          className={`ui-sw-opt ${value === it.key ? 'on' : ''}`} onClick={() => onChange(it.key)}>
          {it.icon && <Icon name={it.icon} size={size === 'sm' ? 14 : 16} />}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// A number that counts up to its value when it changes (leaderboard SP).
export function CountNum({ value }) {
  const v = useCountUp(Number(value) || 0, { duration: 900 });
  return <>{v}</>;
}


/* ── Theme: light / dark ("dusk"). Follows the device until the student picks one. ── */
const THEME_KEY = 'spurti:theme:v1';
const readTheme = () => { try { const v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : null; } catch { return null; } };
const systemDark = () => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };

export function useTheme() {
  const [pref, setPref] = useState(readTheme);      // null = follow the device
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    let mq; try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return undefined; }
    const on = (e) => setSys(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const theme = pref || (sys ? 'dark' : 'light');
  // The page background behind .ui-app (overscroll, safe areas) is the body's, so mirror the choice on <html>.
  useLayoutEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
    return () => { delete document.documentElement.dataset.uiTheme; };
  }, [theme]);
  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPref(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* the choice just won't be remembered */ }
  }, [theme]);
  return { theme, toggle };
}

export function ThemeToggle({ theme, toggle, className = '' }) {
  const dark = theme === 'dark';
  return (
    <button type="button" className={`ui-theme ${className}`} onClick={toggle} aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
