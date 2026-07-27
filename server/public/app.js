const sessionLabels = ['15 May Morning', '15 May Evening', '16 May Morning', '16 May Evening', '17 May Weekend Special'];
let students = [];
let pendingStudentEmail = '';

const byId = (id) => document.getElementById(id);
const n = (value) => Number(value || 0);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function hasActivity(student) {
  return Array.isArray(student.activities) && student.activities.length > 0;
}

function findMatches(query) {
  const value = query.trim().toLowerCase();
  if (value.length < 2) return [];
  return students
    .filter((student) => `${student.name} ${student.email} ${student.alternateEmail}`.toLowerCase().includes(value))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isExactEmailSearch(query) {
  const value = normalizeEmail(query);
  return value.includes('@') && students.some((student) => normalizeEmail(student.email) === value || normalizeEmail(student.alternateEmail) === value);
}

function exactEmailMatch(query) {
  const value = normalizeEmail(query);
  return students.find((student) => normalizeEmail(student.email) === value || normalizeEmail(student.alternateEmail) === value);
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd = name.length > 4 ? name.slice(-2) : '';
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}

function renderMatches(matches) {
  const box = byId('matches');
  if (!byId('searchInput').value.trim()) {
    box.innerHTML = '';
    return;
  }
  if (!matches.length) {
    box.innerHTML = '<div class="empty">No matching student record found.</div>';
    return;
  }
  box.innerHTML = `
    <h2>Select your record</h2>
    <div class="match-grid">
      ${matches.map((student) => `
        <button class="match-card" type="button" onclick="requestEmailConfirmation('${esc(student.email)}')">
          <strong>${esc(student.name)}</strong>
          <span>${esc(maskEmail(student.email))}</span>
          ${student.alternateEmail && student.alternateEmail !== student.email ? `<span>${esc(maskEmail(student.alternateEmail))}</span>` : ''}
          <em>Confirm email to view SP</em>
        </button>
      `).join('')}
    </div>
  `;
}

function renderConfirmation(student) {
  pendingStudentEmail = student.email;
  byId('record').innerHTML = '';
  byId('matches').innerHTML = `
    <div class="confirm-card">
      <h2>Confirm your email</h2>
      <p class="muted">To protect records with duplicate or similar names, enter your full email before viewing this SP record.</p>
      <div class="confirm-target">
        <strong>${esc(student.name)}</strong>
        <span>${esc(maskEmail(student.email))}</span>
      </div>
      <div class="search-row">
        <input id="confirmEmail" type="email" placeholder="Enter full email" autocomplete="off" />
        <button class="primary-btn" type="button" onclick="confirmSelectedStudent()">Confirm</button>
      </div>
      <div id="confirmMsg" class="search-hint">Use the same email used in the roster/attendance record.</div>
    </div>
  `;
  byId('confirmEmail').focus();
}

function sessionLedger(student) {
  return sessionLabels.map((label) => {
    const minutes = n(student.sessions?.[label]);
    const entry = student.sp.sessionLedger.find((item) => item.label === label);
    const spClass = entry.sp > 0 ? 'plus' : entry.sp < 0 ? 'minus' : 'neutral-sp';
    const spText = entry.sp > 0 ? `+${entry.sp} SP` : `${entry.sp} SP`;
    return `
      <div class="ledger-row">
        <div>
          <strong>${esc(label)}</strong>
          <span>${esc(entry.reason)}</span>
        </div>
        <b class="${spClass}">${spText}</b>
      </div>
    `;
  }).join('');
}

function activityBlock(student) {
  if (!hasActivity(student)) {
    return '<div class="empty compact">No activity participation found, so no activity SP was added.</div>';
  }
  return student.activities.map((activity) => `
    <div class="activity-row">
      <span>${esc(activity.item || 'Activity submitted')}</span>
      <strong>${esc(activity.matched || 'Unknown')}</strong>
    </div>
  `).join('');
}

function renderRecord(student) {
  byId('record').innerHTML = `
    <article class="student-record">
      <header class="record-head">
        <div>
          <p class="eyebrow">Student record</p>
          <h2>${esc(student.name)}</h2>
          <p>${esc(student.email)}${student.alternateEmail && student.alternateEmail !== student.email ? ` · ${esc(student.alternateEmail)}` : ''}</p>
        </div>
        <div class="final-score">
          <span>Final SP</span>
          <strong>${student.sp.total}</strong>
        </div>
      </header>

      <section class="score-grid">
        <div><span>Initial SP</span><strong>${student.sp.initial}</strong></div>
        <div><span>Attendance SP</span><strong>${student.sp.attendance > 0 ? '+' : ''}${student.sp.attendance}</strong></div>
        <div><span>Activity SP</span><strong>+${student.sp.activity}</strong></div>
        <div><span>Sessions</span><strong>${student.sessionsAttended}/${sessionLabels.length}</strong></div>
      </section>

      <section class="record-section">
        <h3>Attendance ledger</h3>
        <div class="ledger">${sessionLedger(student)}</div>
      </section>

      <section class="record-section">
        <h3>Game/activity ledger</h3>
        <p class="muted">${esc(student.sp.activityReason)}: +${student.sp.activity} SP</p>
        <div class="activity-list">${activityBlock(student)}</div>
      </section>
    </article>
  `;
}

window.selectStudent = (email) => {
  const student = students.find((item) => item.email === email);
  if (student) {
    byId('matches').innerHTML = '';
    renderRecord(student);
  }
};

window.requestEmailConfirmation = (email) => {
  const student = students.find((item) => item.email === email);
  if (student) renderConfirmation(student);
};

window.confirmSelectedStudent = () => {
  const student = students.find((item) => item.email === pendingStudentEmail);
  const typed = normalizeEmail(byId('confirmEmail')?.value);
  const message = byId('confirmMsg');
  if (!student) return;
  if (typed === normalizeEmail(student.email) || typed === normalizeEmail(student.alternateEmail)) {
    byId('matches').innerHTML = '';
    renderRecord(student);
    return;
  }
  message.textContent = 'Email did not match this record.';
  message.classList.add('error-text');
};

function runSearch() {
  byId('record').innerHTML = '';
  pendingStudentEmail = '';
  const query = byId('searchInput').value;
  if (isExactEmailSearch(query)) {
    byId('matches').innerHTML = '';
    renderRecord(exactEmailMatch(query));
    return;
  }
  const matches = findMatches(query);
  renderMatches(matches);
}

function showSearchPage() {
  byId('introPage').classList.add('hidden');
  byId('searchPage').classList.remove('hidden');
  byId('searchInput').focus();
}

function showIntroPage() {
  byId('searchPage').classList.add('hidden');
  byId('introPage').classList.remove('hidden');
  byId('searchInput').value = '';
  byId('matches').innerHTML = '';
  byId('record').innerHTML = '';
}

async function init() {
  const response = await fetch('/api/students');
  const payload = await response.json();
  students = payload.students || [];
  byId('startSearch').addEventListener('click', showSearchPage);
  byId('backHome').addEventListener('click', showIntroPage);
  byId('searchBtn').addEventListener('click', runSearch);
  byId('searchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
  });
  byId('searchInput').addEventListener('input', () => {
    byId('searchHint').textContent = byId('searchInput').value.trim().length < 2
      ? 'Type at least 2 characters to search.'
      : 'Press Enter or click Search.';
  });
}

init().catch((error) => {
  byId('introPage').innerHTML = `<div class="empty">Failed to load student data: ${esc(error.message)}</div>`;
});
