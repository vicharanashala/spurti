import React from 'react';

// ============================================================
// BadgeArt — original SVG emblems for each rank tier.
// Six unique designs (bronze, silver, gold, diamond, heroic, master)
// rendered as inline SVG so they scale cleanly and animate via CSS
// transforms. The `tier` prop picks the design; the `size` prop
// controls the rendered width. No external assets, no Free Fire
// references — purely original geometric artwork.
// ============================================================

function BronzeShield({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="bz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4933F" />
          <stop offset="50%" stopColor="#8B4513" />
          <stop offset="100%" stopColor="#5C2C0C" />
        </linearGradient>
      </defs>
      <path d="M50 8 L82 22 L82 56 C82 76 50 92 50 92 C50 92 18 76 18 56 L18 22 Z"
        fill="url(#bz)" stroke={glow} strokeWidth="1.5" />
      <path d="M50 18 L72 28 L72 54 C72 70 50 82 50 82 C50 82 28 70 28 54 L28 28 Z"
        fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      <path d="M38 42 L46 50 L62 34" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="58" r="3" fill={accent} />
    </svg>
  );
}

function SilverWings({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="sv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5F5F5" />
          <stop offset="50%" stopColor="#A0A0A0" />
          <stop offset="100%" stopColor="#606060" />
        </linearGradient>
      </defs>
      <path d="M20 60 L34 32 L50 50 L66 32 L80 60 L70 56 L62 70 L50 56 L38 70 L30 56 Z"
        fill="url(#sv)" stroke={glow} strokeWidth="1.2" />
      <path d="M50 50 L50 88" stroke={accent} strokeWidth="3" />
      <path d="M44 60 L50 64 L56 60" stroke={accent} strokeWidth="1.5" fill="none" />
      <circle cx="50" cy="92" r="2.5" fill={accent} />
    </svg>
  );
}

function GoldCrystal({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE760" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path d="M50 6 L70 22 L78 50 L50 94 L22 50 L30 22 Z"
        fill="url(#gd)" stroke={glow} strokeWidth="1.5" />
      <path d="M50 22 L60 30 L60 50 L50 72 L40 50 L40 30 Z"
        fill="none" stroke={accent} strokeWidth="1.2" opacity="0.7" />
      <path d="M50 6 L50 94" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      <path d="M30 22 L70 22" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      <circle cx="50" cy="50" r="4" fill={accent} />
    </svg>
  );
}

function DiamondCrystal({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="dm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7CDBFF" />
          <stop offset="50%" stopColor="#00C2FE" />
          <stop offset="100%" stopColor="#003B82" />
        </linearGradient>
      </defs>
      <path d="M50 4 L80 38 L50 96 L20 38 Z" fill="url(#dm)" stroke={glow} strokeWidth="1.5" />
      <path d="M50 4 L66 30 L50 56 L34 30 Z" fill={accent} opacity="0.4" />
      <path d="M50 56 L80 38" stroke={accent} strokeWidth="0.6" opacity="0.6" />
      <path d="M50 56 L20 38" stroke={accent} strokeWidth="0.6" opacity="0.6" />
      <path d="M34 30 L66 30" stroke={accent} strokeWidth="0.6" opacity="0.6" />
      <path d="M50 56 L50 96" stroke={accent} strokeWidth="0.6" opacity="0.5" />
    </svg>
  );
}

function HeroicCrest({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="hr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF3B5C" />
          <stop offset="50%" stopColor="#8B0000" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id="hr-accent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD0D8" />
          <stop offset="100%" stopColor="#B0D4FF" />
        </linearGradient>
      </defs>
      <path d="M14 30 L50 6 L86 30 L86 60 C86 80 50 96 50 96 C50 96 14 80 14 60 Z"
        fill="url(#hr)" stroke={glow} strokeWidth="1.5" />
      <path d="M50 22 L60 32 L60 50 L50 78 L40 50 L40 32 Z" fill="url(#hr-accent)" opacity="0.3" />
      {/* Energy wings */}
      <path d="M14 50 L4 40 L14 38 Z" fill={accent} opacity="0.7" />
      <path d="M86 50 L96 40 L86 38 Z" fill={accent} opacity="0.7" />
      <path d="M22 38 L18 28 L26 32 Z" fill={accent} opacity="0.5" />
      <path d="M78 38 L82 28 L74 32 Z" fill={accent} opacity="0.5" />
      <circle cx="50" cy="46" r="5" fill={accent} />
      <path d="M50 52 L50 80" stroke={accent} strokeWidth="1.4" />
    </svg>
  );
}

function MasterEmblem({ size, glow, accent }) {
  // Massive futuristic glow — purple → gold → white gradient with
  // animated concentric rings. The "master" tier gets the most
  // elaborate treatment to feel earned.
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="ms-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6B21A8" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
        <radialGradient id="ms-aura" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#6B21A8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ms-spike" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Outer aura */}
      <circle cx="50" cy="50" r="48" fill="url(#ms-aura)" />
      {/* Outer rotating ring */}
      <g style={{ transformOrigin: '50px 50px' }}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#FFD700" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.6">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="14s" repeatCount="indefinite" />
        </circle>
        <circle cx="50" cy="50" r="36" fill="none" stroke="#FFFFFF" strokeWidth="0.4" strokeDasharray="1 6" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="360 50 50" to="0 50 50" dur="20s" repeatCount="indefinite" />
        </circle>
      </g>
      {/* Eight-point star */}
      <path d="M50 4 L56 36 L88 30 L66 50 L88 70 L56 64 L50 96 L44 64 L12 70 L34 50 L12 30 L44 36 Z"
        fill="url(#ms-core)" stroke={glow} strokeWidth="0.8" />
      {/* Crown spikes */}
      <g>
        <rect x="38" y="6" width="2.5" height="14" fill="url(#ms-spike)" />
        <rect x="48" y="2" width="2.5" height="14" fill="url(#ms-spike)" />
        <rect x="58" y="6" width="2.5" height="14" fill="url(#ms-spike)" />
      </g>
      {/* Central diamond */}
      <path d="M50 30 L66 50 L50 70 L34 50 Z" fill="#FFFFFF" opacity="0.85" />
      <path d="M50 38 L58 50 L50 62 L42 50 Z" fill={accent} />
    </svg>
  );
}

export function BadgeArt({ tier, size = 56, glow, accent }) {
  const props = { size, glow: glow || '#FFFFFF', accent: accent || '#FFFFFF' };
  switch (tier) {
    case 'bronze':  return <BronzeShield  {...props} />;
    case 'silver':  return <SilverWings   {...props} />;
    case 'gold':    return <GoldCrystal   {...props} />;
    case 'diamond': return <DiamondCrystal{...props} />;
    case 'heroic':  return <HeroicCrest   {...props} />;
    case 'master':  return <MasterEmblem  {...props} />;
    default:       return <BronzeShield  {...props} />;
  }
}

// Compact mini badge used inside the journey track markers.
export function MiniBadge({ tier, size = 24, fill, stroke }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill={fill || 'currentColor'} stroke={stroke || 'rgba(255,255,255,0.3)'} strokeWidth="1" />
      <circle cx="12" cy="12" r="6" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}