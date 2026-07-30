import React from 'react';

const BAND_MAP = {
  'Excellent': 'Excellent',
  'Active': 'Active',
  'Slowing Down': 'Slowing',
  'Recovery': 'Recovery'
};

function getFleckPositions(size) {
  if (size === 'sm') return [[6,6], [20,18], [14,10]];
  if (size === 'md') return [[10,8], [30,26], [20,14], [36,10]];
  if (size === 'lg') return [[12,12], [40,36], [26,18], [48,10], [20,44]];
  return [[4,4], [14,12], [10,7]];
}

export default function BlockIcon({ band, size = 'md', dimmed = false, showTooltip = false, reason = '' }) {
  const cls = BAND_MAP[band] || 'Insufficient';
  const sizeCls = `mc-block-${size}`;
  const flecks = getFleckPositions(size);

  const block = (
    <div className={`mc-block ${sizeCls} mc-band-${cls}${dimmed ? ' mc-dimmed' : ' mc-active-block mc-glow-' + cls}`}>
      {flecks.map(([x, y], i) => (
        <i key={i} className="mc-fleck" style={{ left: x, top: y }} />
      ))}
    </div>
  );

  if (!showTooltip || !reason) return block;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {block}
      <div className="mc-tooltip">{reason}</div>
    </div>
  );
}
