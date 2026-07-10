import React from 'react';

export default function Tabs({ tab, setTab, tabs }) {
  return (
    <nav className="tabs">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          className={tab === key ? 'active' : ''}
          onClick={() => setTab(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
