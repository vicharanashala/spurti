import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getDevAsEmail } from './devAsEmail.js';
import './skill-tree-v2.css';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const apiUrl = (path, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return `${API}${path}${qs ? `?${qs}` : ''}`;
};

const BRANCH_META = {
  consistency: { icon: '🌱', label: 'Consistency', color: '#22c55e', lightColor: '#dcfce7' },
  curiosity:   { icon: '🔍', label: 'Curiosity',   color: '#6366f1', lightColor: '#e0e7ff' },
  momentum:    { icon: '🔥', label: 'Momentum',    color: '#f59e0b', lightColor: '#fef3c7' },
  excellence:  { icon: '🏆', label: 'Excellence',  color: '#0ea5e9', lightColor: '#e0f2fe' },
};

function nodeState(node, pointsEarned) {
  if (node.unlocked && node.index === 4) return 'mastered';
  if (node.unlocked)                     return 'unlocked';
  if (node.isNextUnlockable)             return 'unlockable';
  return 'locked';
}

/* ── Single skill card ─────────────────────────────── */
function SkillCard({ branch, node, onUnlock, isPending, error, isHere, pointsEarned }) {
  const state = nodeState(node, pointsEarned);
  const meta  = BRANCH_META[branch] || BRANCH_META.consistency;
  const interactive = state === 'unlockable';

  const icons = { mastered: '★', unlocked: '✓', unlockable: '⬡', locked: '·' };

  return (
    <div
      className={`skill-card skill-card-${state}${isHere ? ' skill-card-here' : ''}${isPending ? ' skill-card-pending' : ''}${error ? ' skill-card-error' : ''}`}
      style={{ '--card-color': meta.color, '--card-light': meta.lightColor }}
      onClick={interactive ? onUnlock : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onUnlock(); } : undefined}
      aria-label={`${meta.label}: ${node.title} — ${state}`}
      aria-pressed={node.unlocked}
      title={node.description || node.title}
    >
      <div className="skill-card-icon">{icons[state]}</div>

      <div className="skill-card-body">
        <div className="skill-card-title">{node.title}</div>
        {node.description && (
          <div className="skill-card-desc">{node.description}</div>
        )}
      </div>

      {isHere && <div className="skill-card-here-tag">📍 Here</div>}

      {state === 'mastered' && (
        <div className="skill-card-badge">Mastered</div>
      )}

      {isPending && (
        <div className="skill-card-status">Unlocking…</div>
      )}

      {error && !isPending && (
        <div className="skill-card-error-msg">Try again</div>
      )}
    </div>
  );
}

/* ── Branch column ─────────────────────────────────── */
function BranchColumn({ branch, branchView, onUnlock, pendingBranch, pendingIndex, errorBranch, errorIndex, errorMsg, pointsEarned }) {
  const meta     = BRANCH_META[branch] || BRANCH_META.consistency;
  const unlocked = branchView.nodes.filter((n) => n.unlocked).length;
  const total    = branchView.nodes.length;

  const hereIdx = useMemo(() => {
    const next = branchView.nodes.findIndex((n) => n.isNextUnlockable);
    if (next !== -1) return next;
    const last = branchView.nodes.map((n) => n.unlocked).lastIndexOf(true);
    return last !== -1 ? last : 0;
  }, [branchView]);

  return (
    <div className="skill-branch">
      <div className="skill-branch-header">
        <div className="skill-branch-title-row">
          <span className="skill-branch-icon">{meta.icon}</span>
          <span className="skill-branch-name">{meta.label}</span>
        </div>
        <div className="skill-branch-progress">
          <div className="skill-branch-progress-fill" style={{ width: `${Math.round((unlocked / total) * 100)}%`, background: meta.color }} />
        </div>
        <div className="skill-branch-counter">{unlocked}/{total} unlocked</div>
      </div>

      <div className="skill-cards">
        {branchView.nodes.map((node, i) => (
          <SkillCard
            key={node.index}
            branch={branch}
            node={node}
            onUnlock={() => onUnlock(branch, node.index)}
            isPending={pendingBranch === branch && pendingIndex === node.index}
            error={errorBranch === branch && errorIndex === node.index ? errorMsg : null}
            isHere={i === hereIdx && (node.isNextUnlockable || node.unlocked)}
            pointsEarned={pointsEarned}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Legend ─────────────────────────────────────────── */
function Legend() {
  return (
    <div className="skill-legend">
      {[
        { cls: 'skill-card-mastered',  icon: '★', label: 'Mastered',  color: '#22c55e' },
        { cls: 'skill-card-unlocked',  icon: '✓', label: 'Unlocked',  color: '#86efac' },
        { cls: 'skill-card-unlockable',icon: '⬡', label: 'Ready',     color: '#6366f1' },
        { cls: 'skill-card-locked',    icon: '·', label: 'Locked',    color: '#d1d5db' },
      ].map(({ cls, icon, label, color }) => (
        <span key={cls} className="skill-legend-item">
          <span className={`skill-card-swatch ${cls}`} style={{ background: color }}>{icon}</span>
          {label}
        </span>
      ))}
    </div>
  );
}

/* ── Main export ────────────────────────────────────── */
export default function SkillTree({ compact = false }) {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(null);
  const [pending,      setPending]      = useState({ branch: null, index: null });
  const [unlockError,  setUnlockError]  = useState({ branch: null, index: null, msg: null });
  const [justUnlocked, setJustUnlocked] = useState(null);
  const burstTimer = useRef(null);

  const fetchTree = useCallback(async () => {
    try {
      setLoading(true);
      const params = getDevAsEmail() ? { asEmail: getDevAsEmail() } : {};
      const r = await fetch(apiUrl('/skill-tree', params));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json);
      setLoadError(null);
    } catch (e) {
      setLoadError(e?.message || 'Could not load skill tree');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const onUnlock = useCallback(async (branch, index) => {
    if (pending.branch) return;
    setPending({ branch, index });
    setUnlockError({ branch: null, index: null, msg: null });
    try {
      const params = getDevAsEmail() ? { asEmail: getDevAsEmail() } : {};
      const r = await fetch(apiUrl('/skill-tree/unlock', params), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, nodeIndex: index }),
      });
      if (!r.ok) throw new Error(await r.text().catch(() => `HTTP ${r.status}`));
      const updated = await r.json();
      setData(updated);
      setJustUnlocked(`${branch}:${index}`);
      if (burstTimer.current) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setJustUnlocked(null), 1500);
    } catch (e) {
      setUnlockError({ branch, index, msg: "Couldn't unlock" });
    } finally {
      setPending({ branch: null, index: null });
    }
  }, [pending]);

  if (loading && !data) return <div className="skill-loading">Loading skill tree…</div>;
  if (loadError) return <div className="skill-error">Couldn't load: {loadError} <button onClick={fetchTree}>Retry</button></div>;
  if (!data) return null;

  const totalUnlocked = Object.values(data.branches).reduce((s, b) => s + b.nodes.filter((n) => n.unlocked).length, 0);
  const totalNodes    = Object.values(data.branches).reduce((s, b) => s + b.nodes.length, 0);
  const masteredCount = Object.values(data.branches).filter((b) => b.nodes[4]?.unlocked).length;
  const isFirstRun    = data.pointsEarned === 0;

  return (
    <div className="skill-root">
      {!compact && (
        <div className="skill-header">
          <div className="skill-header-row">
            <h2 className="skill-title">🌳 Skill Tree</h2>
            <div className="skill-points">
              <strong>{data.pointsAvailable}</strong> available / <strong>{data.pointsEarned}</strong> earned
            </div>
          </div>
          <div className="skill-summary">
            <span>✅ {totalUnlocked}/{totalNodes} unlocked</span>
            {masteredCount > 0 && <span>🏆 {masteredCount}/4 mastered</span>}
            {data.pointsAvailable > 0 && <span className="skill-ready">✨ Ready to spend</span>}
          </div>
        </div>
      )}

      {isFirstRun && (
        <div className="skill-first-run">
          🌱 Earn your first 100 lifetime SP to unlock <strong>Consistency</strong> — your journey starts here.
        </div>
      )}

      <div className="skill-branches">
        {Object.keys(data.branches).map((branch) => (
          <BranchColumn
            key={branch}
            branch={branch}
            branchView={data.branches[branch]}
            onUnlock={compact ? () => {} : onUnlock}
            pendingBranch={pending.branch}
            pendingIndex={pending.index}
            errorBranch={unlockError.branch}
            errorIndex={unlockError.index}
            errorMsg={unlockError.msg}
            pointsEarned={data.pointsEarned}
          />
        ))}
      </div>

      {!compact && <Legend />}
    </div>
  );
}