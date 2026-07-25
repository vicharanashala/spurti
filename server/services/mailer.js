// ============================================================
// mailer — abstraction over the Samagama mailer (or local log
// fallback). Sends the weekly recovery plan to bottom-50 students
// the moment the recap finalizes.
//
// In production, set SAMAGAMA_MAILER_URL to forward to the
// Samagama side's mailer endpoint. In local dev, no env var is
// expected — the email body is logged to stdout so you can see
// exactly what students would receive.
// ============================================================

const SAMAGAMA_MAILER_URL = process.env.SAMAGAMA_MAILER_URL || '';
const SAMAGAMA_MAILER_TOKEN = process.env.SAMAGAMA_MAILER_TOKEN || '';
const FROM_ADDRESS = process.env.RECOVERY_FROM_EMAIL || 'spurti@iitrpr.ac.in';
const FROM_NAME = process.env.RECOVERY_FROM_NAME || 'Spurti · IIT Ropar';

// Build the recovery email body for a bottom-50 student.
function buildRecoveryEmail({ name, email, weekStart, weekEnd, rank, weeklySp, plan }) {
  const subject = `Your Spurti weekly recap — let\u2019s plan the week ahead (${weekStart})`;
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const firstName = (name || '').split(' ')[0] || 'there';
  const planLines = (plan?.days || []).map(d =>
    `  \u2022 ${d.day}: ${(d.items || []).join(' \u2192 ')}`
  ).join('\n');
  const observations = (plan?.observations || []).map(o => `  \u2022 ${o}`).join('\n');
  const outcomes = plan?.outcomes || {};
  const text = [
    greeting,
    '',
    `Your Spurti recap for the week of ${weekStart} is ready. You finished`,
    `at rank ${rank} with ${weeklySp} SP — this puts you in the bottom 50 of`,
    `the cohort. That is not a failure; it is just a signal that this week`,
    `was quieter than the rest. Every great learner has weeks like this.`,
    '',
    'WHAT YOU ALREADY HAVE',
    observations || '  \u2022 You logged in this week \u2014 the first step is done.',
    '',
    'YOUR RECOVERY PLAN (Mon \u2192 Sat)',
    planLines || '  \u2022 Attend the live session every day and complete all polls.',
    '',
    'ESTIMATED OUTCOMES IF YOU FOLLOW THE PLAN',
    `  \u2022 Attendance: ${outcomes.estAtt ?? '\u2014'}%`,
    `  \u2022 Poll completion: ${outcomes.estPol ?? '\u2014'}%`,
    `  \u2022 Expected Spurti Points: +${outcomes.estSp ?? '\u2014'}`,
    `  \u2022 Estimated rank: Top ${outcomes.estRank ?? '\u2014'}`,
    '',
    'YOU CAN DO IT',
    `Small improvements every day create remarkable results, ${firstName}.`,
    'Open your Spurti dashboard to see the full plan and tick off tasks as',
    'you complete them.',
    '',
    '\u2014 Spurti, IIT Ropar',
    '',
    `(If the link above does not work, open https://samagama.in/spurti/?devEmail=${encodeURIComponent(email)}`
  ].join('\n');

  const html = `
    <div style="font-family:Inter,system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;background:linear-gradient(180deg,#f0f9ff 0%,#ffffff 100%);border-radius:16px;border:1px solid #e0e7ff;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6366f1;font-weight:700;margin-bottom:8px;">Spurti Weekly Recap</div>
      <h2 style="margin:0 0 12px;font-size:22px;color:#0f172a;">${greeting}</h2>
      <p style="margin:0 0 16px;line-height:1.6;color:#334155;">
        Your recap for the week of <strong>${weekStart}</strong> is ready.
        You finished at <strong>rank ${rank}</strong> with <strong>${weeklySp} SP</strong> &mdash;
        this puts you in the bottom 50 of the cohort. That is not a failure;
        it is just a signal that this week was quieter than the rest.
      </p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#047857;font-weight:700;margin-bottom:6px;">\u2705 What You Already Have</div>
        <div style="line-height:1.6;color:#064e3b;">${(plan?.observations || ['You logged in this week \u2014 the first step is done.']).map(o => `<div>\u2022 ${o}</div>`).join('')}</div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#1d4ed8;font-weight:700;margin-bottom:6px;">\ud83d\udcc5 Mon \u2192 Sat \u00b7 Recovery Plan</div>
        <div style="line-height:1.7;color:#1e3a8a;">
          ${(plan?.days || []).map(d => `<div><strong>${d.day}:</strong> ${(d.items || []).join(' \u2192 ')}</div>`).join('')}
        </div>
      </div>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6d28d9;font-weight:700;margin-bottom:6px;">\ud83c\udfaf Estimated Outcomes</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:4px 0;color:#4c1d95;">Attendance</td><td style="text-align:right;font-weight:700;color:#4c1d95;">${outcomes.estAtt ?? '\u2014'}%</td></tr>
          <tr><td style="padding:4px 0;color:#4c1d95;">Poll completion</td><td style="text-align:right;font-weight:700;color:#4c1d95;">${outcomes.estPol ?? '\u2014'}%</td></tr>
          <tr><td style="padding:4px 0;color:#047857;">Expected SP</td><td style="text-align:right;font-weight:700;color:#047857;">+${outcomes.estSp ?? '\u2014'}</td></tr>
          <tr><td style="padding:4px 0;color:#6d28d9;">Estimated rank</td><td style="text-align:right;font-weight:700;color:#6d28d9;">Top ${outcomes.estRank ?? '\u2014'}</td></tr>
        </table>
      </div>
      <p style="margin:16px 0 0;line-height:1.6;color:#334155;">
        Small improvements every day create remarkable results, ${firstName}.
        Open your Spurti dashboard to see the full plan and tick off tasks as you complete them.
      </p>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://samagama.in/spurti/" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;letter-spacing:0.02em;">Open Spurti Dashboard</a>
      </div>
      <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;text-align:center;">
        Sent by ${FROM_NAME} \u00b7 IIT Ropar \u00b7 VLED Summership
      </div>
    </div>
  `;
  return { subject, text, html };
}

// Send a single email. If SAMAGAMA_MAILER_URL is set, POST to it. Otherwise
// log to stdout so the body is visible in server.out for local dev.
export async function sendRecoveryEmail({ name, email, weekStart, weekEnd, rank, weeklySp, plan, recapId }) {
  if (!email) return { ok: false, reason: 'no email' };
  const payload = buildRecoveryEmail({ name, email, weekStart, weekEnd, rank, weeklySp, plan });
  const envelope = {
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    to: email,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    recapId,
    weekStart
  };
  if (!SAMAGAMA_MAILER_URL) {
    console.log(`[mailer] (dry-run) to=${email} subject="${payload.subject}"`);
    console.log(`[mailer] body-start\n${payload.text}\n[mailer] body-end`);
    return { ok: true, mocked: true };
  }
  try {
    const res = await fetch(SAMAGAMA_MAILER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SAMAGAMA_MAILER_TOKEN ? { 'Authorization': `Bearer ${SAMAGAMA_MAILER_TOKEN}` } : {})
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[mailer] send failed to=${email} status=${res.status} body=${body.slice(0, 200)}`);
      return { ok: false, status: res.status };
    }
    console.log(`[mailer] sent to=${email} recapId=${recapId}`);
    return { ok: true };
  } catch (err) {
    console.error(`[mailer] send error to=${email}: ${err?.message}`);
    return { ok: false, reason: err?.message };
  }
}

// Send to every bottom-50 student of a recap. Idempotent at the per-email
// level (caller can pass `excludeEmails` to skip ones already sent).
export async function sendRecoveryEmailsToBottom50(recap, { excludeEmails = new Set() } = {}) {
  if (!recap?.bottom50?.length) return { sent: 0, skipped: 0, failed: 0 };
  let sent = 0, skipped = 0, failed = 0;
  for (const row of recap.bottom50) {
    if (!row?.email) continue;
    if (excludeEmails.has(row.email)) { skipped++; continue; }
    try {
      const { recoveryPlanFor } = await import('./weeklyRecap.js');
      const plan = await recoveryPlanFor(row.email);
      const result = await sendRecoveryEmail({
        name: row.name,
        email: row.email,
        weekStart: recap.weekStart,
        weekEnd: recap.weekEnd,
        rank: row.rank,
        weeklySp: row.weeklySp,
        plan,
        recapId: recap.weekStart
      });
      if (result.ok) sent++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`[mailer] failed to send to ${row.email}: ${err?.message}`);
    }
  }
  return { sent, skipped, failed };
}
