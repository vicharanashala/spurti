# Spurti Peer Challenge Feature (v2)

## Overview
The Peer Challenge feature allows VLED Summership interns to challenge each other to friendly engagement contests, wagering their earned Spurti Points (SP). This feature encourages consistent study habits and active participation in daily session tasks.

> [!NOTE]
> All progress data in this version of the feature is **simulated/demo progress**. Real integration with live Zoom polls, matrix question databases, and course grading platforms will follow in a subsequent phase.

---

## 1. Database Schema

### `Challenge` (Collection: `challenges`)
Tracks wagers and wagers lifecycles between challenger and opponent:
```javascript
{
  _id,
  challengerId, challengerEmail, challengerName,
  opponentId, opponentEmail, opponentName,
  topic: 'vibe_course' | 'matrix_questions' | 'poll_accuracy',
  topicRef: {
    label,           // e.g., "Poll Accuracy Challenge (Wager: 10 SP)"
    windowStart,
    windowEnd
  },
  betAmount,         // Amount wagered by each participant (min: 1 SP)
  status: 'pending' | 'expired' | 'declined' | 'cancelled' | 'active' | 'completed' | 'void',
  requestedAt,       // Time request was issued
  respondTimeoutAt,  // requestedAt + 2 hours
  respondedAt,       // Time accepted/declined
  startAt,           // Live window start (accepted time)
  endAt,             // startAt + duration (capped at 7 days)
  escrow: {
    challengerLocked,
    opponentLocked
  },
  progressSnapshot: { challenger, opponent }, // Captured at startAt
  progressFinal:    { challenger, opponent }, // Captured at settlement
  winnerId,
  loserId,
  resultReason,
  settledAt,
  settledBy: 'auto' | 'admin',
  auditTrail: [{ at, actor, action, detail }]
}
```

---

## 2. Business Rules (Enforced Server-Side)

1. **Max Concurrent Limit:** A student can have a maximum of 3 concurrent active or pending challenges.
2. **Acceptance Window:** Opponent has exactly 2 hours to accept or decline the challenge. Ignores trigger automatic expiration.
3. **Challenge Duration:** Challenger can specify a duration from 1 day (minimum) to 7 days (maximum).
4. **Wager Verification:** Wagers are validated against the student's *available* SP (`totalSp` minus SP locked in other active or pending challenges).
5. **No Self-Challenges:** Students are blocked from challenging themselves.
6. **Escrow Lock:** On accept, the wagers are locked in escrow (`escrow.challengerLocked` and `escrow.opponentLocked`). Student `totalSp` is NOT decreased until settlement, keeping overall SP invariants intact.
7. **Settlement Transactions:** Settle wagers directly into student `totalSp` using `challenge_win` and `challenge_loss` categories in the standard MERN-additive `SPTransaction` schema.

---

## 3. API Endpoints

### Student-Facing
- `GET /api/challenges/topics` - Returns supported topics and descriptions.
- `GET /api/challenges/peers?q=` - Search active classmates, flagging limits.
- `POST /api/challenges` - Issue a challenge invitation.
- `GET /api/challenges/mine` - Retrieve student's challenges grouped by lifecycle stages.
- `GET /api/challenges/:id` - Fetch details for a specific challenge.
- `POST /api/challenges/:id/accept` - Accept challenge.
- `POST /api/challenges/:id/decline` - Decline challenge.
- `POST /api/challenges/:id/cancel` - Cancel sent pending challenge request.

### Admin Overrides
- `GET /api/admin/challenges` - List all challenges.
- `POST /api/admin/challenges/:id/settle` - Force settle an active challenge.
- `POST /api/admin/challenges/:id/void` - Manually void a challenge.

---

## 4. Background Scheduler
The background cron runs every 5 minutes in `server/server.js`:
- **Timeout Worker:** Checks for pending invites past `respondTimeoutAt` and marks them as `expired`.
- **Settlement Worker:** Processes active wagers past `endAt`, queries `dummyProgress.js` for final metrics, updates student balances, issues ledger transactions, and marks status as `completed` (or `void` in case of ties).
