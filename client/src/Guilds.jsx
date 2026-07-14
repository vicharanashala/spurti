import { useEffect, useState } from 'react';

export default function Guilds({ className }) {
  const [standings, setStandings] = useState([]);
  const [myGuild, setMyGuild] = useState(null);
  const [invites, setInvites] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create-guild form state
  const [createName, setCreateName] = useState('');
  const [createMotto, setCreateMotto] = useState('');
  const [createColor, setCreateColor] = useState('#3B5BA5');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Invite response state
  const [inviteLoading, setInviteLoading] = useState({});

  // Send-invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSending, setInviteSending] = useState(false);

  // Join-by-code state
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [standingsRes, myGuildRes, invitesRes] = await Promise.all([
          fetch(`/api/guilds`, { credentials: 'include' }),
          fetch(`/api/guilds/mine`, { credentials: 'include' }),
          fetch(`/api/guilds/invites/mine`, { credentials: 'include' })
        ]);
        if (!active) return;

        // Check each response independently — partial success is fine
        if (standingsRes.ok) {
          const data = await standingsRes.json();
          if (active) setStandings(data.standings || []);
        }
        if (myGuildRes.ok) {
          const data = await myGuildRes.json();
          if (active) {
            setMyGuild(data.guild || null);
            setMyRole(data.myRole || null);
          }
        } else {
          // Not authenticated or other error — guild is simply unavailable
          if (active) {
            setMyGuild(null);
            setMyRole(null);
          }
        }
        if (invitesRes.ok) {
          const data = await invitesRes.json();
          if (active) setInvites(data.invites || []);
        } else {
          if (active) setInvites([]);
        }
      } catch {
        if (active) setError('Failed to load guild data.');
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const refetch = async () => {
    const [standingsRes, myGuildRes, invitesRes] = await Promise.all([
      fetch(`/api/guilds`, { credentials: 'include' }),
      fetch(`/api/guilds/mine`, { credentials: 'include' }),
      fetch(`/api/guilds/invites/mine`, { credentials: 'include' })
    ]);
    const [standingsData, myGuildData, invitesData] = await Promise.all([
      standingsRes.json().catch(() => ({})),
      myGuildRes.json().catch(() => ({})),
      invitesRes.json().catch(() => ({}))
    ]);
    setStandings(standingsData.standings || []);
    setMyGuild(myGuildData.guild || null);
    setMyRole(myGuildData.myRole || null);
    setInvites(invitesData.invites || []);
  };

  const createGuild = async () => {
    const trimmed = createName.trim();
    if (trimmed.length < 3) { setCreateError('Guild name must be at least 3 characters.'); return; }
    setCreateError('');
    setCreateLoading(true);
    try {
      const res = await fetch(`/api/guilds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed, motto: createMotto.trim(), colorPrimary: createColor })
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Could not create guild.'); return; }
      setCreateName('');
      setCreateMotto('');
      setCreateColor('#3B5BA5');
      await refetch();
    } catch {
      setCreateError('Network error.');
    } finally {
      setCreateLoading(false);
    }
  };

  const sendInvite = async () => {
    const trimmed = inviteEmail.trim();
    if (!trimmed) { setInviteError('Email is required.'); return; }
    setInviteError('');
    setInviteSending(true);
    try {
      const res = await fetch(`/api/guilds/${myGuild._id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmed })
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || 'Failed to send invite.'); return; }
      setInviteEmail('');
    } catch {
      setInviteError('Network error.');
    } finally {
      setInviteSending(false);
    }
  };

  const respondToInvite = async (inviteId, accept) => {
    setInviteLoading(prev => ({ ...prev, [inviteId]: true }));
    try {
      const res = await fetch(`/api/guilds/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accept })
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to respond to invite.');
        return;
      }
      await refetch();
    } catch {
      setError('Network error.');
    } finally {
      setInviteLoading(prev => { const n = { ...prev }; delete n[inviteId]; return n; });
    }
  };

  const leaveGuild = async () => {
    if (!window.confirm('Are you sure you want to leave this guild?')) return;
    setError('');
    try {
      const res = await fetch(`/api/guilds/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to leave guild.'); return; }
      await refetch();
    } catch {
      setError('Network error.');
    }
  };

  const joinByCode = async () => {
    const code = joinCode.trim().toLowerCase();
    if (!code) { setJoinError('Invite code is required.'); return; }
    setJoinError('');
    setJoinLoading(true);
    try {
      const res = await fetch(`/api/guilds/join/${encodeURIComponent(code)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) { setJoinError(data.error || 'Could not join guild.'); return; }
      setJoinCode('');
      await refetch();
    } catch {
      setJoinError('Network error.');
    } finally {
      setJoinLoading(false);
    }
  };

  const copyInviteCode = async () => {
    if (!myGuild?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(myGuild.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // fallback for browsers without clipboard API
      window.prompt('Copy this invite code:', myGuild.inviteCode);
    }
  };

  if (isLoading) {
    return (
      <div className={`guilds ${className || ''}`}>
        <section className="panel empty">Loading...</section>
      </div>
    );
  }

  return (
    <div className={`guilds ${className || ''}`}>
      {error && <p className="error" style={{ padding: '1rem' }}>{error}</p>}

      {/* My Guild highlight */}
      <section className="panel">
        {myGuild ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', borderLeft: `4px solid ${myGuild.colorPrimary || '#3B5BA5'}`, paddingLeft: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{myGuild.emblemIcon || '⚔️'}</span>
              <div>
                <h2 style={{ margin: 0 }}>{myGuild.name}</h2>
                {myGuild.motto && <p className="muted" style={{ margin: '0.25rem 0 0' }}>{myGuild.motto}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <div><strong>{myGuild.memberCount}{myGuild.maxMembers ? ` / ${myGuild.maxMembers}` : ''}</strong> <span className="muted">members{myGuild.memberCount >= myGuild.maxMembers ? ' · full' : ''}</span></div>
              <div><strong>{myGuild.totalPoints}</strong> <span className="muted">total SP</span></div>
              <div><strong>{myGuild.weeklyPoints}</strong> <span className="muted">this week</span></div>
            </div>
            {myGuild.topContributorThisWeek && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }} className="muted">
                Top contributor this week: <strong>{myGuild.topContributorThisWeek.name}</strong>
              </p>
            )}
            {myGuild.members?.length > 0 && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', margin: '0 0 0.25rem' }}>Members</p>
                {myGuild.members.map(member => (
                  <div key={member.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.875rem' }}>{member.name}</span>
                      {member.role === 'leader' && (
                        <span style={{ fontSize: '0.65rem', background: myGuild.colorPrimary || '#3B5BA5', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>Leader</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
                      <span>{member.totalSp} SP</span>
                      <span className="muted">{member.weeklyPoints} this wk</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {myRole === 'leader' && myGuild.memberCount < myGuild.maxMembers && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', margin: '0 0 0.25rem' }}>Invite a member</p>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="Student email"
                    onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    style={{ flex: 1 }}
                  />
                  <button className="primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={sendInvite} disabled={inviteSending}>
                    {inviteSending ? 'Sending...' : 'Invite'}
                  </button>
                </div>
                {inviteError && <p className="error" style={{ marginTop: '0.25rem' }}>{inviteError}</p>}
              </div>
            )}
            {myRole === 'leader' && myGuild.memberCount >= myGuild.maxMembers && (
              <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.75rem', fontStyle: 'italic' }}>Guild is full ({myGuild.memberCount}/{myGuild.maxMembers}). New members cannot join.</p>
            )}
            {myGuild.inviteCode && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', margin: '0 0 0.25rem' }}>Invite Code</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <code style={{ fontFamily: 'monospace', fontSize: '1rem', background: '#f5f5f5', padding: '0.25rem 0.5rem', borderRadius: '4px', letterSpacing: '0.1em' }}>{myGuild.inviteCode}</code>
                  <button className="secondary" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }} onClick={copyInviteCode}>
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p style={{ fontSize: '0.7rem', color: '#888', margin: '0.25rem 0 0' }}>Share this code so others can join the guild.</p>
              </div>
            )}
            <div style={{ marginTop: '0.5rem' }}>
              <button className="secondary" style={{ fontSize: '0.75rem' }} onClick={leaveGuild}>Leave Guild</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="muted">You're not in a guild yet.</p>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="Guild name"
                maxLength={40}
                onKeyDown={e => e.key === 'Enter' && createGuild()}
              />
              <input
                value={createMotto}
                onChange={e => setCreateMotto(e.target.value)}
                placeholder="Motto (optional)"
                maxLength={140}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem' }}>Guild colour</label>
                <input
                  type="color"
                  value={createColor}
                  onChange={e => setCreateColor(e.target.value)}
                  style={{ width: '2.5rem', height: '2rem', padding: '0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                />
              </div>
              <button className="primary" onClick={createGuild} disabled={createLoading}>
                {createLoading ? 'Creating...' : 'Create Guild'}
              </button>
              {createError && <p className="error">{createError}</p>}
            </div>

            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #eee', paddingTop: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', margin: '0 0 0.4rem' }}>Or join with an invite code</p>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="Invite code (e.g. a1b2c3)"
                  onKeyDown={e => e.key === 'Enter' && joinByCode()}
                  style={{ flex: 1, textTransform: 'lowercase' }}
                />
                <button className="secondary" onClick={joinByCode} disabled={joinLoading}>
                  {joinLoading ? 'Joining...' : 'Join'}
                </button>
              </div>
              {joinError && <p className="error" style={{ marginTop: '0.25rem' }}>{joinError}</p>}
            </div>
          </div>
        )}
      </section>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <section className="panel">
          <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', margin: '0 0 0.5rem' }}>Pending Invites</p>
          {invites.map(invite => (
            <div key={invite._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>{invite.guildId?.emblemIcon || '⚔️'}</span>
                <span style={{ fontSize: '0.875rem' }}>{invite.guildId?.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="primary"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                  onClick={() => respondToInvite(invite._id, true)}
                  disabled={inviteLoading[invite._id]}
                >Accept</button>
                <button
                  className="secondary"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                  onClick={() => respondToInvite(invite._id, false)}
                  disabled={inviteLoading[invite._id]}
                >Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Guild Standings */}
      {standings.length === 0 ? (
        <section className="panel empty">
          <p>No guilds yet — be the first to create one.</p>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Guild Standings</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Guild</th>
                <th>Members</th>
                <th>Total Points</th>
                <th>This Week</th>
              </tr>
            </thead>
            <tbody>
              {standings.map(guild => (
                <tr key={guild._id}>
                  <td>{guild.rank}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderLeft: `3px solid ${guild.colorPrimary || '#3B5BA5'}`, paddingLeft: '0.5rem' }}>
                      <span>{guild.emblemIcon || '⚔️'}</span>
                      <span>{guild.name}</span>
                    </span>
                  </td>
                  <td>{guild.memberCount}{guild.maxMembers ? ` / ${guild.maxMembers}` : ''}{guild.memberCount >= guild.maxMembers ? ' 🔒' : ''}</td>
                  <td>{guild.totalPoints}</td>
                  <td>{guild.weeklyPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}