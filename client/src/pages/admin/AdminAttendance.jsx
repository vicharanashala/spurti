import React from 'react';

export default function AdminAttendance({ data, onStudent }) {
  if (!data) return <section className="panel empty">Loading attendance...</section>;
  return (
    <section className="panel">
      <h2>Attendance Matrix</h2>
      <div className="matrix-wrap">
        <table className="table matrix">
          <thead>
            <tr>
              <th>Student</th>
              <th>SP</th>
              {data.sessions.map(s => <th key={s.label}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.students.map(student => (
              <tr key={student._id} onClick={() => onStudent(student._id)} style={{ cursor: 'pointer' }}>
                <td>{student.name}</td>
                <td>{student.totalSp}</td>
                {data.sessions.map(session => {
                  const cell = student.cells[session.label];
                  return (
                    <td key={session.label} className={cell?.qualified ? 'ok-cell' : 'bad-cell'}>
                      {cell ? `${cell.minutes}/${cell.totalMinutes}` : '0'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
