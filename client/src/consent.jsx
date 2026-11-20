import React, { useEffect, useState } from 'react';

// Research notice. The study runs under a waiver of individual consent, so this is
// an information notice with an opt-out, not a consent form. The wording follows the
// IEC annexure; when it changes, edit it here and bump CONSENT_VERSION on the server
// so every student sees the notice again.
const RECORDED = [
  'Your account details: name, email, cohort and start date',
  'Attendance at live sessions and your answers to session polls',
  'Your progress on the course and activity platforms used in the programme',
  'Questions you ask or answer, and your FAQ and peer-learning contributions',
  'Goals and commitments you set, and the points you earn or lose',
  'How you use this dashboard, such as pages opened and cards shared',
  'Your answers to programme surveys'
];

// "OK" keeps records and survey answers in the research; written answers are never quoted.
const STAY_IN = { records: true, surveys: true, quotations: false };

export function ConsentModal({ api, email, current = null, mode = 'first', optOutButton = true, onDone, onClose }) {
  const showOptOut = mode === 'change' || optOutButton;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const optedOutNow = Boolean(current?.optedOut);

  useEffect(() => {
    if (!saved) return undefined;
    const id = setTimeout(() => onDone(saved), 2200);
    return () => clearTimeout(id);
  }, [saved, onDone]);

  const submit = async (optOut) => {
    setSaving(true); setError('');
    try {
      const r = await fetch(`${api}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, readTerms: true, optOut, ...(optOut ? {} : STAY_IN) })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not save. Please try again.');
      setSaved(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <div className="survey-modal consent-modal">
          <div className="survey-head">
            <h2 id="consent-title">{saved.optedOut ? 'You have opted out' : 'Thank you'}</h2>
            <p>{saved.optedOut
              ? 'Your records will not be used for research. Everything in Spurti works the same for you.'
              : 'Everything in Spurti works the same for you.'}</p>
            <p className="consent-small">You can change this later from “Research consent” at the bottom of your dashboard, until 30 days after your programme ends.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="survey-modal consent-modal">
        <div className="survey-head">
          <h2 id="consent-title">Your data and our research</h2>
          <p>Please read this once. It takes about a minute.</p>
        </div>

        <div className="consent-body">
          <h3>What Spurti records as part of the programme</h3>
          <p>To run the programme, Spurti records your learning activity. A points pipeline then turns these records into your Spurti Points. This is routine and happens whether or not you opt out.</p>
          <ul>{RECORDED.map(item => <li key={item}>{item}</li>)}</ul>

          <h3>How the records are used for research</h3>
          <ul>
            <li>These records are used for research on how learners take part and progress in online learning, unless you opt out.</li>
            <li>Before analysis, a lab staff member who is not part of the research team replaces your name and email with a code. The researchers do not see who you are.</li>
            <li>Results are reported only for groups of learners. No report, paper or dataset names you or your college. Anonymised records may be shared in public research datasets.</li>
            <li>Your written answers are only grouped into themes. They are never quoted and never released in any dataset.</li>
            <li>Opting out does not affect your points, rank, evaluation, certificate, completion or access to any part of Spurti. Programme staff do not see your choice.</li>
            <li>There is no payment or reward for taking part.</li>
            <li>This programme is for learners aged 18 or older.</li>
          </ul>

          <h3>About this study</h3>
          <ul>
            <li>The research is run by the Vicharanashala Lab for Education Design, IIT Ropar, and led by Prof. S. R. Sudarshan Iyengar.</li>
            <li>Risk: very small. Benefit: none directly to you; the findings will help improve later programmes.</li>
            <li>Questions about the research: sudarshan@iitrpr.ac.in. Your rights as a participant: comm.inst.ethics@iitrpr.ac.in.</li>
          </ul>

          <h3>If you do not want to take part</h3>
          {mode === 'change' && (
            <p><b>Right now: {optedOutNow ? 'you have opted out of research.' : 'your records are used for research.'}</b></p>
          )}
          <p>You do not need to do anything to take part. If you do not want your records used for research, {showOptOut
            ? <>choose “Opt out of research”, now or later from “Research consent” at the bottom of your dashboard,</>
            : <>open “Research consent” at the bottom of your dashboard and choose “Opt out of research”,</>} until 30 days after your programme ends. After you opt out, your records are left out of any new analysis, but results already produced cannot be changed.</p>
        </div>

        {error && <p className="survey-note" role="alert">{error}</p>}
        <div className="survey-actions">
          {mode === 'change' && <button type="button" className="survey-ghost" disabled={saving} onClick={onClose}>Cancel</button>}
          {mode === 'change' && optedOutNow
            ? <button type="button" className="survey-primary" disabled={saving} onClick={() => submit(false)}>{saving ? 'Saving…' : 'Use my records for research'}</button>
            : <>
                {showOptOut && <button type="button" className="survey-ghost" disabled={saving} onClick={() => submit(true)}>Opt out of research</button>}
                {mode !== 'change' && <button type="button" className="survey-primary" disabled={saving} onClick={() => submit(false)}>{saving ? 'Saving…' : 'OK'}</button>}
              </>}
        </div>
      </div>
    </div>
  );
}

// Small link at the bottom of the dashboard to look at the notice again or change the choice.
export function ConsentLink({ api, email }) {
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
          ? <ConsentModal api={api} email={email} mode="change" current={state.current}
              onDone={() => setOpen(false)} onClose={() => setOpen(false)} />
          : (
            <div className="survey-overlay" role="dialog" aria-modal="true">
              <div className="survey-modal consent-modal">
                <div className="survey-head">
                  <h2>Your research choice</h2>
                  <p>{state.current?.optedOut ? 'You opted out of research.' : 'Your records are used for research.'} The period for changing it has ended.</p>
                </div>
                <div className="survey-actions"><button type="button" className="survey-primary" onClick={() => setOpen(false)}>Close</button></div>
              </div>
            </div>
          )
      )}
    </>
  );
}
