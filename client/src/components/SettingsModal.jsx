import React, { useState } from 'react';
import DarkModeToggle from './DarkModeToggle';

export default function SettingsModal({ student, onUpdateStudent, API, onClose }) {
  const [sharing, setSharing] = useState(student?.shareEnabled !== false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const toggleSharing = async (e) => {
    const nextVal = e.target.checked;
    setSharing(nextVal);
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareEnabled: nextVal })
      });
      if (res.ok) {
        const data = await res.json();
        onUpdateStudent({ ...student, shareEnabled: data.shareEnabled });
        setMessage('Settings saved successfully!');
      } else {
        throw new Error('Failed to update settings');
      }
    } catch (err) {
      setSharing(!nextVal); // revert
      setMessage('Error updating settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '480px' }}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        
        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="settings-row">
            <div className="settings-label">
              <span>Theme Mode</span>
              <p>Switch between light and dark themes</p>
            </div>
            <DarkModeToggle />
          </div>
        </div>

        <div className="settings-section">
          <h3>Privacy</h3>
          <div className="settings-row">
            <div className="settings-label">
              <span>Social Sharing</span>
              <p>Allow sharing of rank, level, and badges</p>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={sharing} 
                onChange={toggleSharing} 
                disabled={loading} 
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {message && (
          <p style={{ 
            fontSize: '13px', 
            color: message.includes('saved') ? 'var(--green)' : 'var(--red)',
            fontWeight: '700',
            marginTop: '10px',
            textAlign: 'left'
          }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
