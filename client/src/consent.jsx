import React, { useEffect, useState } from 'react';

// Research-consent screen. The wording follows the IEC consent annexure; when the
// approved text changes, edit it here and bump CONSENT_VERSION on the server so
// every student sees the screen again.
const RECORDED = [
  'Your account details: name, email, cohort and start date',
  'Attendance at live sessions and your answers to session polls',
  'Your progress on the course and activity platforms used in the programme',
  'Questions you ask or answer, and your FAQ and peer-learning contributions',
  'Goals and commitments you set, and the points you earn or lose',
  'How you use this dashboard, such as pages opened and cards shared',
  'Your answers to programme surveys'
];

const CHOICES = [
  ['records', 'My programme records (the items listed above) may be used for research.'],
  ['surveys', 'My answers to programme surveys may be used for research.'],
  ['quotations', 'Short quotations from my written answers may be used in research reports, without my name.']
];

function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ConsentModal({ api, email, current = null, changeUntil = '', mode = 'first', onDone, onClose }) {
  const [pick, setPick] = useState({
    records: current?.records ?? false,
    surveys: current?.surveys ?? false,
    quotations: current?.quotations ?? false
  });
  const [readTerms, setReadTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!saved) return undefined;
    const id = setTimeout(() => onDone(saved), 2200);
    return () => clearTimeout(id);
  }, [saved, onDone]);

  const submit = async (optOut) => {
    if (!readTerms) { setError('Please tick “I have read the terms above” first.'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`${api}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, readTerms: true, optOut, ...(optOut ? {} : pick) })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not save your choice. Please try again.');
      setSaved(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const none = !pick.records && !pick.surveys && !pick.quotations;

  if (saved) {
    return (
      <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <div className="survey-modal consent-modal">
          <div className="survey-head">
            <h2 id="consent-title">Thank you — your choice is saved</h2>
            <p>{saved.optedOut
              ? 'You have opted out. Your data will not be used for research. Everything in Spurti works the same for you.'
              : 'Thank you for helping our research. Everything in Spurti works the same for you.'}</p>
            <p className="consent-small">You can change this later from “Research consent” at the bottom of your dashboard{changeUntil ? ` (until ${fmtDate(changeUntil)})` : ''}.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="survey-modal consent-modal">
        <div className="survey-head">
          <h2 id="consent-title">{mode === 'change' ? 'Change your research choice' : 'Your data and our research'}</h2>
          <p>Please read this once and make your choice. It takes about a minute.</p>
        </div>

        <div className="consent-body">
          <h3>What Spurti records as part of the programme</h3>
          <p>To run the programme, Spurti records your learning activity. A points pipeline then turns these records into your Spurti Points. This is routine and happens whatever you choose below.</p>
          <ul>{RECORDED.map(item => <li key={item}>{item}</li>)}</ul>

          <h3>How the records are used for research</h3>
          <ul>
            <li>With your consent, these records are used for research on how learners take part and progress in online learning.</li>
            <li>Before analysis, your name and email are replaced by a code.</li>
            <li>Results are reported only for groups of learners. No report, paper or dataset names you or your college. Anonymised records may be shared in public research datasets.</li>
            <li>Your choice does not affect your points, rank, evaluation, certificate or completion in any way. Programme staff do not see your choice.</li>
            <li>There is no payment or reward for giving consent.</li>
            <li>You can change your choice later from “Research consent” at the bottom of your dashboard{changeUntil ? `, until ${fmtDate(changeUntil)}` : ''}.</li>
            <li>By answering, you confirm you are 18 years of age or older.</li>
          </ul>

          <h3>Your choice</h3>
          <p className="consent-small">Tick each one you agree to. Leave a box empty to say no.</p>
          <div className="consent-choices">
            {CHOICES.map(([key, text]) => (
              <label key={key} className="consent-choice">
                <input type="checkbox" checked={pick[key]} onChange={e => setPick(p => ({ ...p, [key]: e.target.checked }))} />
                <span>{text}</span>
              </label>
            ))}
          </div>
          <label className="consent-choice consent-read">
            <input type="checkbox" checked={readTerms} onChange={e => { setReadTerms(e.target.checked); setError(''); }} />
            <span><b>I have read the terms above.</b></span>
          </label>
        </div>

        {error && <p className="survey-note" role="alert">{error}</p>}
        <div className="survey-actions">
          {mode === 'change' && <button type="button" className="survey-ghost" disabled={saving} onClick={onClose}>Cancel</button>}
          <button type="button" className="survey-ghost" disabled={saving} onClick={() => submit(true)}>Opt out of research</button>
          <button type="button" className="survey-primary" disabled={saving} onClick={() => submit(false)}>
            {saving ? 'Saving…' : none ? 'Save (no research use)' : 'Save my choice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Small link at the bottom of the dashboard to look at or change the choice.
export function ConsentLink({ api, email, changeUntil }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const openIt = async () => {
    setError('');
    try {
      const r = await fetch(`${api}/consent?email=${encodeURIComponent(email)}`);
      if (!r.ok) throw new Error();
      setState(await r.json());
      setOpen(true);
    } catch {
      setError('Could not load your research choice. Please try again.');
    }
  };
  return (
    <>
      <div className="consent-link">
        <button type="button" onClick={openIt}>Research consent</button>
        {error && <span role="alert"> {error}</span>}
      </div>
      {open && state && (
        state.changeOpen
          ? <ConsentModal api={api} email={email} mode="change" current={state.current} changeUntil={changeUntil}
              onDone={() => setOpen(false)} onClose={() => setOpen(false)} />
          : (
            <div className="survey-overlay" role="dialog" aria-modal="true">
              <div className="survey-modal consent-modal">
                <div className="survey-head">
                  <h2>Your research choice</h2>
                  <p>{state.current?.optedOut ? 'You opted out of research.' : 'You gave consent for research use.'} The period for changing it has ended.</p>
                </div>
                <div className="survey-actions"><button type="button" className="survey-primary" onClick={() => setOpen(false)}>Close</button></div>
              </div>
            </div>
          )
      )}
    </>
  );
}
