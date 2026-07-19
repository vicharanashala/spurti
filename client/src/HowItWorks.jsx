import React from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';

export function HowItWorks({ onBack }) {
  return (
    <div className="panel" style={{ maxWidth: 800, margin: '20px auto', padding: 32, lineHeight: '1.6em' }}>
      <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 24 }}>
        <p className="eyebrow" style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>VLED Summership Rules</p>
        <h1 style={{ margin: '4px 0 0 0', fontSize: 28, fontWeight: 800 }}>Spurti Peer Challenges</h1>
        <p className="lead" style={{ margin: '8px 0 0 0', color: 'var(--muted)', fontSize: 16 }}>
          A peer-to-peer engagement motivator to challenge classmates and wager Spurti Points (SP).
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>What is a Peer Challenge?</h2>
          <p>
            Peer Challenges are formal academic motivators designed to encourage study consistency and session participation.
            A student can challenge any active classmate to a friendly engagement match on a specific topic.
            Both students wager the same amount of Spurti Points (SP). At the end of the duration, the student with the higher progress wins the wagered pot of SP.
          </p>
        </section>

        <section style={{ background: '#f8fafc', padding: 20, borderRadius: 8, border: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: 'var(--amber)' }}>⚠️ CRITICAL NOTICE: Simulated/Demo Data</h2>
          <p style={{ margin: 0 }}>
            Please note that progress tracking for all topics is currently powered by a **deterministic progress simulator** for this demo version.
            Live API integrations for the ViBe Course platform, Matrix question sets, and session poll grading are pending.
            Your scores and wagers are processed automatically by the simulator, which is labeled as demo-mode in your dashboard.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>The Three Challenge Topics</h2>
          <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li>
              <strong>Vibe Course Progress:</strong> Tracks module completion percentage within the designated challenge duration window.
            </li>
            <li>
              <strong>Matrix Questions:</strong> Compares scores obtained by completing targeted programming and analytical matrix exercises.
            </li>
            <li>
              <strong>Poll Accuracy:</strong> Assesses attempt accuracy and correctness on session polls run throughout the cohort days.
            </li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Rules & Mechanics</h2>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Parameter</th>
                <th style={{ padding: '8px 12px' }}>Rule Limit / Value</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}><strong>Max Concurrent Challenges</strong></td>
                <td style={{ padding: '10px 12px' }}>3 (combined total of pending sent, pending received, and active runs)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}><strong>Response Time Window</strong></td>
                <td style={{ padding: '10px 12px' }}>2 hours from issue (auto-expires if not accepted)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}><strong>Wager Limits</strong></td>
                <td style={{ padding: '10px 12px' }}>Min 1 SP, Max is the student's available SP balance (excluding SP locked in other challenges)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}><strong>Duration Clamps</strong></td>
                <td style={{ padding: '10px 12px' }}>Between 1 day (minimum) and 7 days (maximum)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}><strong>Ties & Draws</strong></td>
                <td style={{ padding: '10px 12px' }}>If final progress is exactly equal, the challenge voids and wagers are returned with no penalty</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Step-by-Step Flow</h2>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li><strong>Issue Invite:</strong> Challenger selects a topic, wagers an amount, chooses duration, and searches for an opponent peer.</li>
            <li><strong>Escrow Lock:</strong> When the opponent accepts, the wagered SP for both students is "locked" in escrow. Available balances are updated immediately, but `totalSp` is untouched.</li>
            <li><strong>Compete:</strong> Over the challenge duration, progress is tracked. Active progress bars can be reviewed in the dashboard.</li>
            <li><strong>Auto-Settlement:</strong> Once the end time passes, the background scheduler resolves the challenge, distributes wagers directly into student `totalSp` using `challenge_win` and `challenge_loss` ledger transaction rows.</li>
          </ol>
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>FAQ</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <strong>Q: Can I challenge myself?</strong>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)' }}>No, self-challenges are strictly blocked by the validation engine.</p>
            </div>
            <div>
              <strong>Q: What happens if an opponent ignores my invite?</strong>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)' }}>If the opponent does not respond within 2 hours, the request automatically expires. Any locked balance is returned.</p>
            </div>
            <div>
              <strong>Q: Can I forfeit or cancel an active challenge?</strong>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)' }}>No, once a challenge is accepted and becomes active, neither student can cancel or abort unilaterally.</p>
            </div>
          </div>
        </section>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            All challenges are tracked and auditable by VLED Program Admins.
          </span>
          <button className="primary" onClick={onBack ? onBack : () => window.location.href = APP_BASE}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
