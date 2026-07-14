import React, { useState } from 'react';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

export default function StudentSearch() {
  const [query, setQuery] = useState('');
  const [student, setStudent] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStudent(null);

    const trimmed = query.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a name or email.');
      return;
    }

    try {
      const base = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
      const endpoint = `${base}/api/demo-students/search?query=${encodeURIComponent(trimmed)}`;
      
      const res = await fetch(endpoint);
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg('No record found.');
        } else {
          setErrorMsg('An error occurred. Please try again.');
        }
        return;
      }
      const data = await res.json();
      setStudent(data);
    } catch (err) {
      console.error(err);
      setErrorMsg('No record found.');
    }
  };

  return (
    <div className="student-search-container" style={{ padding: '20px', maxWidth: '450px', margin: '0 auto' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter name or email"
          style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line, #ccc)', background: 'var(--input-bg, #fff)', color: 'var(--text, #000)' }}
        />
        <button 
          type="submit" 
          className="primary" 
          style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: 'var(--primary, #007bff)', color: '#fff' }}
        >
          Search
        </button>
      </form>

      {errorMsg && (
        <p className="error" style={{ color: 'var(--red, red)', marginTop: '10px', fontSize: '0.95rem' }}>
          {errorMsg}
        </p>
      )}

      {student && (
        <div 
          className="student-details" 
          style={{ 
            marginTop: '20px', 
            padding: '15px', 
            border: '1px solid var(--line, #ddd)', 
            borderRadius: '8px',
            background: 'var(--card-bg, #fbfdff)',
            boxShadow: 'var(--shadow, 0 2px 4px rgba(0,0,0,0.1))',
            color: 'var(--text, #000)'
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1.25rem', color: 'var(--text, #000)' }}>{student.name}</h3>
          <p style={{ margin: '5px 0', fontSize: '0.95rem' }}><strong>Email:</strong> {student.email}</p>
          <p style={{ margin: '5px 0', fontSize: '0.95rem' }}><strong>Joining Date:</strong> {formatDate(student.joiningDate)}</p>
          <p style={{ margin: '5px 0', fontSize: '0.95rem' }}><strong>SP Points:</strong> {student.spPoints}</p>
        </div>
      )}
    </div>
  );
}
