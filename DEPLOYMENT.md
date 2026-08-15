# Deployment Guide — Post-Merge

After merging any PR to `main`, deploy manually on `samagama.in`:

```bash
ssh sakshi@samagama.in
cd ~/spurti
git pull
npm --prefix client run build
npx pm2 restart spurti
```

## Verify

1. Open https://samagama.in/spurti — dashboard loads without error
2. Check browser console (F12) for any API 500s
3. For new features, confirm the relevant tab/page renders correctly

## Peer Review — First-Time Setup

No env vars or DB seeding needed. The feature is fully self-contained:

- Students submit their Phase 1 project via the **Peer Review** tab
- The rubric (10 Yes/No questions, max 30 pts) ships in code
- SP is awarded automatically via SPTransaction when thresholds are met
- Admin can monitor via `GET /api/admin/peer-review/stats`
