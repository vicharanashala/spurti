# Upvote Challenge System

Adds a voting-based weekly challenge system to Spurti. Students spend SP to vote on proposed challenges. The challenge with the most SP wins and becomes active. Only voters of the winning challenge are eligible to participate; on completion they receive their invested SP back multiplied by the challenge's `rewardMultiplier`.

## How it works

- Proposed challenges appear in a new **Challenges** tab in the student dashboard, each with a voting window, type (`attendance` / `poll_participation`), and reward multiplier.
- Students spend SP to vote. They can add more SP to an existing vote or withdraw (full refund) any time before voting closes.
- An admin resolves the round once voting ends. The challenge with the highest `totalSpInvested` transitions to `active` with a 7-day live window; all others are archived.
- Students who voted for the winning challenge are enrolled. On completion they earn `spInvested * rewardMultiplier` SP credited back via `challenge_reward` transactions.
- SP spent on losing challenges is forfeited. Withdrawals are only possible during the voting phase.

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/challenges/proposed` | Open challenges + user's votes + SP balance |
| `GET` | `/api/challenges/active` | Currently active challenge + enrollment status |
| `POST` | `/api/challenges/:id/vote` | Cast or increment a vote (`{ spPoints: number }`) |
| `POST` | `/api/challenges/:id/withdraw` | Withdraw vote, refund SP |
| `POST` | `/api/admin/challenges/:id/resolve` | Resolve round — pick winner, activate, archive losers |

## Seed data

Run `node server/scripts/seedChallenges.js` to create 3 sample proposed challenges with 7-day voting windows (idempotent — skips if challenges already exist).
