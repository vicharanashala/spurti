import React, { useState, useEffect } from 'react';

const API_BASE = '/api/leaderboard';

export default function StudentRankSummary({ studentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/student/${studentId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch student rank summary');
        return res.json();
      })
      .then((json) => {
        if (isMounted) {
          if (json.success) setData(json.data);
          else setError(json.error || 'Unable to load rank summary');
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  if (!studentId) return null;

  if (loading) {
    return (
      <div className="pulse-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="pulse-card">
            <span>Loading...</span>
            <strong>—</strong>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card negative" style={{ marginBottom: 16 }}>
        Error loading student summary: {error}
      </div>
    );
  }

  if (!data) return null;

  let bestSkill = null;
  if (data.skills && Object.keys(data.skills).length > 0) {
    let topRank = Infinity;
    Object.entries(data.skills).forEach(([key, val]) => {
      if (val.rank && val.rank < topRank) {
        topRank = val.rank;
        bestSkill = { category: key, ...val };
      }
    });
  }

  const renderDelta = (delta) => {
    if (delta === null || delta === undefined || delta === 0) {
      return <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 'normal' }}> - No change</span>;
    }
    if (delta > 0) {
      return <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 'bold' }}> ^ +{delta}</span>;
    }
    return <span style={{ color: 'var(--red)', fontSize: 12, fontWeight: 'bold' }}> v {delta}</span>;
  };

  const cards = [
    {
      label: 'Global Rank',
      rank: data.global?.rank,
      delta: data.global?.rankDelta,
      subtitle: data.global ? `${data.global.rawSP} SP` : null
    },
    {
      label: 'Weekly Rank',
      rank: data.weekly?.rank,
      delta: data.weekly?.rankDelta,
      subtitle: data.weekly ? `${data.weekly.weeklySP} SP` : null
    },
    {
      label: 'Cohort Rank',
      rank: data.cohort?.rank,
      delta: data.cohort?.rankDelta,
      subtitle: data.cohort ? `Score: ${data.cohort.normalizedScore}` : null
    },
    {
      label: bestSkill ? `Best Skill (${bestSkill.category})` : 'Best Skill Rank',
      rank: bestSkill?.rank,
      delta: bestSkill?.rankDelta,
      subtitle: bestSkill ? `${bestSkill.skillSP} SP` : null
    }
  ];

  return (
    <div className="pulse-grid">
      {cards.map((card, idx) => (
        <div key={idx} className="pulse-card">
          <span>{card.label}</span>
          <strong>
            {card.rank ? `#${card.rank}` : 'Unranked'}
            {card.rank ? renderDelta(card.delta) : null}
          </strong>
          {card.subtitle && <p>{card.subtitle}</p>}
        </div>
      ))}
    </div>
  );
}
