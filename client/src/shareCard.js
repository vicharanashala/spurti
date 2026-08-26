import qrcode from 'qrcode-generator';
import { VLED_LOGO, VLED_LOGO_RATIO } from './vledLogo.js';

// Draws the achievement card to a canvas and hands back a PNG.
//
// Every measurement below is the approved design's own pixel value divided by
// its 460px authoring width, then multiplied by the render width — the same
// maths the preview page does with cqw units. So the exported PNG is the card
// that was signed off, just larger. Export width is 1080 (4:5 → 1080x1350),
// which is what LinkedIn and WhatsApp want for a portrait image.
const REF = 460;
const EXPORT_W = 1080;

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';

const INK = '#22414f';
const TEAL = '#1f6f86';
const GOLD = '#b9862f';
const NAVY = '#20323b';
const MUTED = '#6f8189';
const FAINT = '#8a999e';

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = VLED_LOGO;
    });
  }
  return logoPromise;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shrink the type until the line fits, rather than wrapping — a two-line name
// would push the programme line into the footer.
function fitText(ctx, text, maxWidth, startPx, font, minPx) {
  let size = startPx;
  ctx.font = `700 ${size}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && size > minPx) {
    size -= 1;
    ctx.font = `700 ${size}px ${font}`;
  }
  return size;
}

// `y` is the TOP of the line, not the baseline — the layout below stacks rows by
// height, and mixing baselines into that is how the spacing drifts.
function centred(ctx, text, cx, y, font, weight, size, colour, letterSpacing = 0) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (!letterSpacing) { ctx.fillText(text, cx, y); return; }
  // Canvas has no letter-spacing in older Safari, so space the glyphs by hand.
  const chars = [...text];
  const total = chars.reduce((w, c) => w + ctx.measureText(c).width + letterSpacing, 0) - letterSpacing;
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  for (const c of chars) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + letterSpacing; }
  ctx.textAlign = 'center';
}

function drawQr(ctx, text, x, y, size) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const pad = size * 0.08;
  const cell = (size - pad * 2) / count;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, size, size, size * 0.1);
  ctx.fill();
  ctx.strokeStyle = '#e7ddc9';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();
  ctx.fillStyle = '#12333f';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + pad + c * cell, y + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
}

/**
 * @param {object} a   achievement: { icon, title, period, verifyId }
 * @param {object} s   student: { name, totalSp, level }
 * @param {string} verifyUrl  absolute URL the QR resolves to
 * @returns {Promise<string>} PNG data URL
 */
export async function renderCard(a, s, verifyUrl) {
  const logo = await loadLogo();
  const W = EXPORT_W;
  const H = Math.round(W * 1.25);
  const k = W / REF;                       // design px -> render px
  const u = (px) => px * k;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Rounded corners, clipped once so every band below inherits them — a square
  // PNG would show hard corners against a feed's background.
  roundRect(ctx, 0, 0, W, H, u(20));
  ctx.clip();

  // ---- ground -------------------------------------------------------------
  const ground = ctx.createLinearGradient(0, 0, W * 0.4, H);
  ground.addColorStop(0, '#fefdf9');
  ground.addColorStop(1, '#f5efe3');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);

  // ---- header band + logo -------------------------------------------------
  const padX = u(20);
  const headerH = u(22) + (W - padX * 2) / VLED_LOGO_RATIO + u(26);
  const headBg = ctx.createLinearGradient(0, 0, 0, headerH);
  headBg.addColorStop(0, '#fffdf7');
  headBg.addColorStop(1, '#f8f3e8');
  ctx.fillStyle = headBg;
  ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = '#ece1ca';
  ctx.lineWidth = Math.max(1, u(1));
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(W, headerH);
  ctx.stroke();

  const logoW = W - padX * 2;
  ctx.drawImage(logo, padX, u(22), logoW, logoW / VLED_LOGO_RATIO);

  // ---- "Achievement Unlocked" pill, straddling the header rule ------------
  const pillH = u(26);
  const pillFont = u(10.5);
  const pillText = 'ACHIEVEMENT UNLOCKED';
  const spacing = pillFont * 0.16;
  const pillIcon = '🏅';
  const iconSize = pillFont * 1.25;

  ctx.font = `800 ${pillFont}px ${SANS}`;
  const textW = [...pillText].reduce((w, c) => w + ctx.measureText(c).width + spacing, 0) - spacing;
  ctx.font = `${iconSize}px ${SANS}`;
  const iconW = ctx.measureText(pillIcon).width;
  const iconGap = u(5);
  const pillW = iconW + iconGap + textW + u(30);
  const pillX = (W - pillW) / 2;
  const pillY = headerH - pillH / 2;
  const pillBg = ctx.createLinearGradient(0, pillY, 0, pillY + pillH);
  pillBg.addColorStop(0, '#eabb54');
  pillBg.addColorStop(1, '#c6982f');
  ctx.fillStyle = pillBg;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = '#f2d78f';
  ctx.lineWidth = Math.max(1, u(1));
  ctx.stroke();

  // Contents are centred in the pill by its middle — `centred` draws from the
  // top of the line, so anchoring off a baseline here is what made the caption
  // hang out of the bottom of the pill.
  const pillMid = pillY + pillH / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${iconSize}px ${SANS}`;
  ctx.fillText(pillIcon, pillX + u(15), pillMid);
  ctx.font = `800 ${pillFont}px ${SANS}`;
  ctx.fillStyle = '#3c2a06';
  let px = pillX + u(15) + iconW + iconGap;
  for (const c of pillText) { ctx.fillText(c, px, pillMid); px += ctx.measureText(c).width + spacing; }

  // ---- footer band (drawn before the body so the body can centre in what's left)
  const footerH = u(46) + u(28);
  const footY = H - footerH;
  const footBg = ctx.createLinearGradient(0, footY, 0, H);
  footBg.addColorStop(0, '#faf5ea');
  footBg.addColorStop(1, '#f3ecdc');
  ctx.fillStyle = footBg;
  ctx.fillRect(0, footY, W, footerH);
  ctx.strokeStyle = '#e7ddc9';
  ctx.beginPath();
  ctx.moveTo(0, footY);
  ctx.lineTo(W, footY);
  ctx.stroke();

  // ---- body ---------------------------------------------------------------
  // Rows are measured first and stacked second, so the block is genuinely
  // centred in whatever space the header and footer leave.
  const cx = W / 2;
  const bodyTop = headerH;
  const bodyH = footY - bodyTop;
  const medalD = u(98);
  const maxTextW = W - u(56);

  const titleSize = fitText(ctx, a.title, maxTextW, u(30), SERIF, u(19));
  const nameSize = fitText(ctx, s.name || '', maxTextW, u(28), SERIF, u(15));
  const periodSize = u(12.5);
  const awardedSize = u(11);
  const progSize = u(12.5);

  const rows = [
    { h: medalD, gap: u(14) },                  // medal
    { h: titleSize * 1.15, gap: u(5) },         // title
    { h: periodSize * 1.4, gap: u(14) },        // period
    { h: u(2), gap: u(12) },                    // divider
    { h: awardedSize * 1.4, gap: u(4) },        // "AWARDED TO"
    { h: nameSize * 1.25, gap: u(4) },          // name
    { h: progSize * 1.4, gap: 0 }               // programme
  ];
  const blockH = rows.reduce((t, r) => t + r.h + r.gap, 0);
  let y = bodyTop + (bodyH - blockH) / 2;

  // medal disc
  const mx = cx;
  const my = y + medalD / 2;
  const disc = ctx.createRadialGradient(mx - medalD * 0.12, my - medalD * 0.18, medalD * 0.05, mx, my, medalD * 0.62);
  disc.addColorStop(0, '#ffe6a6');
  disc.addColorStop(0.44, '#e8b24a');
  disc.addColorStop(1, '#b9862f');
  ctx.beginPath();
  ctx.arc(mx, my, medalD / 2, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.font = `${u(44)}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.icon || '🏆', mx, my + u(2));
  y += rows[0].h + rows[0].gap;

  centred(ctx, a.title, cx, y, SERIF, '700', titleSize, TEAL);
  y += rows[1].h + rows[1].gap;

  centred(ctx, a.period || '', cx, y, SANS, '700', periodSize, GOLD);
  y += rows[2].h + rows[2].gap;

  // gold hairline between what was won and who won it
  const dw = u(46);
  const grad = ctx.createLinearGradient(cx - dw / 2, 0, cx + dw / 2, 0);
  grad.addColorStop(0, 'rgba(185,134,47,0)');
  grad.addColorStop(0.5, GOLD);
  grad.addColorStop(1, 'rgba(185,134,47,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - dw / 2, y, dw, Math.max(1.5, rows[3].h));
  y += rows[3].h + rows[3].gap;

  centred(ctx, 'AWARDED TO', cx, y, SANS, '500', awardedSize, FAINT, awardedSize * 0.18);
  y += rows[4].h + rows[4].gap;

  centred(ctx, s.name || '', cx, y, SERIF, '700', nameSize, NAVY);
  y += rows[5].h + rows[5].gap;

  centred(ctx, 'VLED Summership Internship · IIT Ropar', cx, y, SANS, '400', progSize, MUTED);

  // ---- footer contents ----------------------------------------------------
  const fpad = u(24);
  const midY = footY + footerH / 2;
  const valueFont = `700 ${u(19)}px ${SERIF}`;
  const labelFont = `500 ${u(9.5)}px ${SANS}`;
  const spText = Number(s.totalSp || 0).toLocaleString('en-IN');
  const lvlText = `Level ${s.level ?? 0}`;

  // The column has to clear whichever is wider, the number or its label —
  // otherwise a four-digit SP total runs "SPURTI POINTS" into "STANDING".
  ctx.font = valueFont; const spValW = ctx.measureText(spText).width;
  ctx.font = labelFont; const spLabW = ctx.measureText('SPURTI POINTS').width;
  const lvlX = fpad + Math.max(spValW, spLabW) + u(20);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEAL;
  ctx.font = valueFont;
  ctx.fillText(spText, fpad, midY - u(2));
  ctx.fillText(lvlText, lvlX, midY - u(2));

  ctx.fillStyle = FAINT;
  ctx.font = labelFont;
  ctx.fillText('SPURTI POINTS', fpad, midY + u(14));
  ctx.fillText('STANDING', lvlX, midY + u(14));

  const qrSize = u(46);
  const qrX = W - fpad - qrSize;
  drawQr(ctx, verifyUrl, qrX, midY - qrSize / 2, qrSize);

  ctx.textAlign = 'right';
  ctx.fillStyle = FAINT;
  ctx.font = `700 ${u(8)}px ${SANS}`;
  ctx.fillText('SCAN TO VERIFY', qrX - u(9), midY - u(3));
  ctx.fillStyle = TEAL;
  ctx.font = `700 ${u(10)}px ${MONO}`;
  ctx.fillText(a.verifyId || '', qrX - u(9), midY + u(11));

  return canvas.toDataURL('image/png');
}

// The caption is about the achievement, not about the system that issued it.
// Three beats carry it: what was won, what earning it actually involved, and a
// line worth reading. Nobody's feed needs the scoring rules explained.
const WON_IT_BY = {
  total: {
    1: 'Top of the cohort on overall points — earned across standups, polls, peer-learning sessions, and the questions I answered for other interns.',
    2: 'Second across the whole cohort — standups, polls, peer-learning sessions, and the questions I answered for other interns.',
    3: 'Third across the whole cohort — standups, polls, peer-learning sessions, and the questions I answered for other interns.'
  },
  attendance: {
    1: 'This one is just for showing up. Every standup, start to finish, week after week.',
    2: 'This one is just for showing up. Every standup, start to finish, week after week.',
    3: 'This one is just for showing up. Every standup, start to finish, week after week.'
  },
  poll: {
    1: 'Won inside the sessions themselves — reading the question properly and getting the answer right more often than anyone else.',
    2: 'Won inside the sessions themselves — reading the question properly and getting the answer right, more often than almost anyone.',
    3: 'Won inside the sessions themselves — reading the question properly and getting the answer right, more often than almost anyone.'
  },
  spa: {
    1: 'Earned by sitting down with other interns — learning from them, and teaching what I had already worked out.',
    2: 'Earned by sitting down with other interns — learning from them, and teaching what I had already worked out.',
    3: 'Earned by sitting down with other interns — learning from them, and teaching what I had already worked out.'
  },
  query: {
    1: 'Earned by being the one who answered when other interns were stuck.',
    2: 'Earned by answering other interns when they were stuck.',
    3: 'Earned by answering other interns when they were stuck.'
  }
};

// One quote per board and per milestone. Attributions are the real ones: the
// "excellence is a habit" line is Durant's gloss on Aristotle, not Aristotle,
// and is credited that way here because the post is public and someone will check.
const QUOTES = {
  total: '"We are what we repeatedly do. Excellence, then, is not an act, but a habit."\n— Will Durant',
  attendance: '"Little by little, a little becomes a lot."\n— Tanzanian proverb',
  poll: '"The important thing is not to stop questioning."\n— Albert Einstein',
  spa: '"While we teach, we learn."\n— Seneca',
  query: '"No one has ever become poor by giving."\n— Anne Frank',
  level: '"A journey of a thousand miles begins with a single step."\n— Lao Tzu',
  legend: '"Excellence is a continuous process and not an accident."\n— A. P. J. Abdul Kalam',
  club3600: '"You can\'t cross the sea merely by standing and staring at the water."\n— Rabindranath Tagore'
};

// Legend's threshold is a server-side number that may well be raised later, so
// the figure is read back out of the achievement's own `detail` ("Crossed 1,500
// SP") rather than written in here — a hardcoded 1,500 would keep printing in
// captions long after the cards had stopped meaning it.
function legendPoints(a) {
  const n = /([\d,]+)\s*SP/i.exec(a.detail || '');
  return n ? `${n[1]} Spurti Points` : 'The Legend badge';
}

function whatItTook(a) {
  if (a.kind === 'rank') return WON_IT_BY[a.board]?.[a.place] || '';
  if (a.achId === 'ms:legend') return `${legendPoints(a)}. There is no fast way to this one — it is the whole internship's work, added up.`;
  const lvl = /^ms:level:(\d+)$/.exec(a.achId || '');
  if (lvl) return `${(Number(lvl[1]) * 100).toLocaleString('en-IN')} Spurti Points, built up one session at a time.`;
  if (a.achId === 'ms:club3600') return '3,600 minutes of standups — the full attendance goal for the internship, finished.';
  return '';
}

function quoteFor(a) {
  if (a.kind === 'rank') return QUOTES[a.board] || '';
  if (a.achId === 'ms:legend') return QUOTES.legend;
  if (a.achId === 'ms:club3600') return QUOTES.club3600;
  if (/^ms:level:\d+$/.test(a.achId || '')) return QUOTES.level;
  return '';
}

// All three podium places share one title — "Cohort Champion" is what 1st, 2nd
// and 3rd are all called, and only the medal drawn on the card tells them apart.
// In text there is no medal, so a 3rd place would read as an outright win unless
// the caption says the place in words. That is what this is for.
const PLACE_WORD = { 1: '1st place', 2: '2nd place', 3: '3rd place' };

// No profile link in the text: LinkedIn only turns a name into a real tag when
// it is picked from the composer's @-dropdown, so a pasted link notifies nobody
// and just reads like a footnote. The modal asks for the @-tag instead.
// Hashtags do survive a paste, which is why they stay.
export function shareCaption(a, verifyUrl = '') {
  const place = a.kind === 'rank' ? PLACE_WORD[a.place] : '';
  const when = a.period && a.period !== 'All-time' ? a.period : '';
  const head = [a.title, place, when].filter(Boolean).join(' — ');
  const lines = [
    `${head}.`,
    '',
    whatItTook(a),
    '',
    quoteFor(a),
    ''
  ];
  // The link is the whole point of the card: it opens a page that confirms the
  // achievement, so the post can be checked instead of taken on trust.
  if (verifyUrl) lines.push('Verified here, if anyone wants to check:', verifyUrl, '');
  // Two kinds of tag doing two jobs: the first three are distinctive enough to
  // search on later and actually find these posts; the last two buy reach in
  // feeds that don't know what Spurti is. Five is about LinkedIn's useful limit
  // — more starts to cost reach rather than add it. "#sp" was dropped: far too
  // common to find anything by.
  lines.push('#Spurti #SpurtiPoints #Vicharanashala #VLEDSummership #IITRopar');
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

// A PNG data URL as a File, so it can go into navigator.share({ files }) — that
// is the one path that puts the picture into the post without a download.
export function dataUrlToFile(dataUrl, filename) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
