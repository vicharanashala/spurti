# Peer Review — Post-Merge Deployment Guide

## 1. Merge the PR

Merge PR #120 (`feat/peer-review`) into `main` on GitHub. Use **"Squash and merge"** or **"Rebase and merge"**.

## 2. Deploy to production

```bash
ssh sakshi@samagama.in
cd ~/spurti
git pull
npm --prefix client run build
npx pm2 restart spurti
# Backfill teamLink on existing 686 submissions
node server/scripts/backfillPeerReviewTeamLinks.js
```

## 3. Verify

- Check PM2 is running: `npx pm2 status`
- Open https://samagama.in/spurti in a browser
- Log in as a student → the **"Peer Review"** tab should appear in the dashboard
- Log in as admin → hit `GET /api/admin/peer-review/stats` with admin headers to verify admin endpoints

## 4. What students see

- **Submit project**: Students click "Peer Review" tab → fill in PR link, project report URL, product.md URL → submit
- **Review peers**: After submitting, students can browse available submissions → start a review → answer 10 Yes/No rubric questions with explanations → submit review
- **SP rewards**: Reviewee gets SP after 3 reviews received; reviewer gets SP after completing 3 mandatory reviews
