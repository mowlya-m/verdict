import React, { useState, useEffect, useRef, useMemo } from 'react';

/* ============================================================================
   VERDICT — full product surface

   Two audiences, one artefact. A claimant lodging a motor claim once, under
   stress, probably on a phone. An assessor working 140 files a day on a
   desktop. Both need the same thing: the state of the claim, legible at a
   glance.

   Signature: the Code of Practice countdown, at three scales.
     · claimant hero  — the whole screen
     · queue row      — a 3px rail
     · open file      — a ring

   Self-contained. No CSS import, no Tailwind. Runs under Vite and standalone.
   ========================================================================== */

const T = {
  ink: '#0F2A33',
  petrol: '#1B4A5A',
  plum: '#7A2E5A',
  plumSoft: '#F7EDF2',
  paper: '#FAF8F5',
  sand: '#EFE9E0',
  rule: '#DDD6CB',
  ruleSoft: '#EBE6DD',
  card: '#FFFFFF',
  body: '#3D4750',
  mute: '#7C858E',
  ok: '#1B6B4A',
  okSoft: '#E6F1EC',
  warn: '#B0731C',
  warnSoft: '#FBF2E2',
  bad: '#A02A2A',
  badSoft: '#F8EAEA',
};

const DISPLAY = "'Familjen Grotesk', 'Helvetica Neue', sans-serif";
const BODY = "'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const BAND = { ok: T.ok, at_risk: T.warn, breached: T.bad };
const OUTCOME = {
  accept: { label: 'Accept', fg: T.ok, bg: T.okSoft, verb: 'Approve and settle' },
  decline: { label: 'Decline', fg: T.bad, bg: T.badSoft, verb: 'Decline with reasons' },
  request_evidence: { label: 'Evidence', fg: T.petrol, bg: '#E8F0F2', verb: 'Request from claimant' },
  escalate: { label: 'Escalate', fg: T.warn, bg: T.warnSoft, verb: 'Hold for a person' },
};

const money = (n) =>
  '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ claims */

const CLAIMS = [
  {
    id: 'A10293', insured: 'D. Okafor', peril: 'Collision', dateOfLoss: '2026-08-04',
    notified: '2026-08-05', quote: 2530, excess: 750, outcome: 'accept',
    clock: { band: 'ok', daysRemaining: 108, consumed: 0.1 },
    gates: [
      { n: 1, name: 'Policy in force at date of loss', passed: true, basis: 'Cover ran 1 Jan to 31 Dec 2026. Loss dated 4 Aug.', citation: 'MTR-88213 · PDS 2025.11' },
      { n: 2, name: 'Peril falls within an insuring clause', passed: true, basis: 'Collision matched to Collision damage.', citation: 'Clause 7.2' },
      { n: 3, name: 'No exclusion applies', passed: true, basis: 'No exclusion matched the circumstances.' },
      { n: 4, name: 'Evidence sufficient to decide', passed: true, basis: 'All required evidence on file.' },
      { n: 5, name: 'Integrity checks', passed: true, basis: 'No material discrepancies.' },
      { n: 6, name: 'Quantum within auto-settle ceiling', passed: true, basis: '$2,530.00 against a $5,000 ceiling.' },
      { n: 7, name: 'No vulnerability signals', passed: true, basis: 'None detected.' },
    ],
  },
  {
    id: 'A10294', insured: 'T. Nguyen', peril: 'Collision', dateOfLoss: '2026-08-01',
    notified: '2026-08-02', quote: 4900, excess: 750, outcome: 'escalate',
    clock: { band: 'ok', daysRemaining: 105, consumed: 0.13 },
    gates: [
      { n: 1, name: 'Policy in force at date of loss', passed: true, basis: 'Cover ran 1 Jan to 31 Dec 2026. Loss dated 1 Aug.', citation: 'MTR-90114 · PDS 2025.11' },
      { n: 2, name: 'Peril falls within an insuring clause', passed: true, basis: 'Collision matched to Collision damage.', citation: 'Clause 7.2' },
      { n: 3, name: 'No exclusion applies', passed: true, basis: 'No exclusion matched the circumstances.' },
      { n: 4, name: 'Evidence sufficient to decide', passed: true, basis: 'All required evidence on file.' },
      { n: 5, name: 'Integrity checks', passed: false, basis: 'Score 7. Photo p1 was captured on 12 Jul, before the stated loss date. Photo p2 is perceptually identical to p1. The quote sits 250% above the top of the estimated band, and includes a tailgate that does not appear in the damage findings.' },
      { n: 6, name: 'Quantum within auto-settle ceiling', passed: true, basis: '$4,900.00 against a $5,000 ceiling.' },
      { n: 7, name: 'No vulnerability signals', passed: true, basis: 'None detected.' },
    ],
    escalation: ['Integrity score has reached the investigation threshold. A person decides this one, not the engine.'],
  },
  {
    id: 'A10295', insured: 'R. Patel', peril: 'Theft', dateOfLoss: '2026-08-10',
    notified: '2026-08-11', quote: null, excess: 750, outcome: 'request_evidence',
    clock: { band: 'ok', daysRemaining: 114, consumed: 0.05 },
    missing: ['Police report', 'Proof of purchase', 'Driver licence'],
    gates: [
      { n: 1, name: 'Policy in force at date of loss', passed: true, basis: 'Cover ran 1 Jan to 31 Dec 2026. Loss dated 10 Aug.', citation: 'MTR-77420 · PDS 2025.11' },
      { n: 2, name: 'Peril falls within an insuring clause', passed: true, basis: 'Theft matched to Theft of vehicle.', citation: 'Clause 8.1' },
      { n: 3, name: 'No exclusion applies', passed: true, basis: 'No exclusion matched the circumstances.' },
      { n: 4, name: 'Evidence sufficient to decide', passed: false, basis: 'Missing a police report, proof of purchase and driver licence.' },
      { n: 5, name: 'Integrity checks', passed: true, basis: 'No material discrepancies.' },
      { n: 6, name: 'Quantum within auto-settle ceiling', passed: false, basis: 'Loss not yet quantifiable from the evidence supplied.' },
      { n: 7, name: 'No vulnerability signals', passed: true, basis: 'None detected.' },
    ],
  },
  {
    id: 'A10287', insured: 'S. Alvarez', peril: 'Collision', dateOfLoss: '2026-04-02',
    notified: '2026-04-06', quote: 3180, excess: 750, outcome: 'escalate',
    clock: { band: 'breached', daysRemaining: -13, consumed: 1.11 },
    gates: [
      { n: 1, name: 'Policy in force at date of loss', passed: true, basis: 'Cover ran 1 Jan to 31 Dec 2026. Loss dated 2 Apr.', citation: 'MTR-61208 · PDS 2025.11' },
      { n: 2, name: 'Peril falls within an insuring clause', passed: true, basis: 'Collision matched to Collision damage.', citation: 'Clause 7.2' },
      { n: 3, name: 'No exclusion applies', passed: true, basis: 'No exclusion matched the circumstances.' },
      { n: 4, name: 'Evidence sufficient to decide', passed: true, basis: 'All required evidence on file.' },
      { n: 5, name: 'Integrity checks', passed: true, basis: 'No material discrepancies.' },
      { n: 6, name: 'Quantum within auto-settle ceiling', passed: true, basis: '$3,180.00 against a $5,000 ceiling.' },
      { n: 7, name: 'No vulnerability signals', passed: false, basis: 'Financial hardship disclosed in the claimant’s own words.' },
    ],
    escalation: ['Hardship disclosed. Route to a specialist handler.', 'The Code decision window has already passed. Deal with this one first.'],
  },
  {
    id: 'A10291', insured: 'K. Brennan', peril: 'Collision', dateOfLoss: '2026-05-19',
    notified: '2026-05-20', quote: 1420, excess: 750, outcome: 'decline',
    clock: { band: 'at_risk', daysRemaining: 22, consumed: 0.82 },
    gates: [
      { n: 1, name: 'Policy in force at date of loss', passed: true, basis: 'Cover ran 1 Jan to 31 Dec 2026. Loss dated 19 May.', citation: 'MTR-52907 · PDS 2025.11' },
      { n: 2, name: 'Peril falls within an insuring clause', passed: true, basis: 'Collision matched to Collision damage.', citation: 'Clause 7.2' },
      { n: 3, name: 'No exclusion applies', passed: false, basis: 'Excluded. The driver was not licensed to drive the vehicle.', citation: 'Clause 9.4' },
      { n: 4, name: 'Evidence sufficient to decide', passed: true, basis: 'All required evidence on file.' },
      { n: 5, name: 'Integrity checks', passed: true, basis: 'No material discrepancies.' },
      { n: 6, name: 'Quantum within auto-settle ceiling', passed: true, basis: '$1,420.00 against a $5,000 ceiling.' },
      { n: 7, name: 'No vulnerability signals', passed: true, basis: 'None detected.' },
    ],
  },
];

const AGENT_RUN = [
  { at: 0.4, agent: 'Intake', line: 'Read 4 documents and 5 photos' },
  { at: 1.1, agent: 'Intake', line: 'Extracted date, time, location and vehicles' },
  { at: 2.0, agent: 'Policy', line: 'Retrieved the wording in force on 4 Aug 2026' },
  { at: 2.9, agent: 'Policy', line: 'Matched clause 7.2, collision damage' },
  { at: 3.7, agent: 'Vision', line: 'Rear bumper moderate, tail light light' },
  { at: 4.6, agent: 'Integrity', line: 'Photo timestamps consistent with the stated loss' },
  { at: 5.4, agent: 'Integrity', line: 'No duplicate images, quote within band' },
  { at: 6.2, agent: 'Engine', line: 'Seven gates evaluated' },
];

/* ------------------------------------------------------------------- atoms */

function Pill({ outcome, children }) {
  const o = OUTCOME[outcome];
  return (
    <span className="pill" style={{ background: o.bg, color: o.fg }}>
      <i style={{ background: o.fg }} />
      {children || o.label}
    </span>
  );
}

/* Signature, scale 3: the rail */
function Rail({ clock }) {
  return (
    <div className="rail">
      <span style={{ width: Math.min(100, clock.consumed * 100) + '%', background: BAND[clock.band] }} />
    </div>
  );
}

/* Signature, scale 2: the ring */
function Ring({ clock, size = 78 }) {
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const col = BAND[clock.band];
  return (
    <div className="ringwrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.ruleSoft} strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, clock.consumed))}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .7s ease' }}
        />
      </svg>
      <span style={{ color: col }}>
        {Math.abs(clock.daysRemaining)}
        <em>{clock.daysRemaining < 0 ? 'days over' : 'days left'}</em>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- claimant view */

function Hero({ onStart }) {
  const [days, setDays] = useState(120);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setDays((d) => (d <= 1 ? 120 : d - 1)), 30);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="hero">
      <div>
        <span className="eyebrow">Motor claims</span>
        <h1>
          The law gives us<br />
          <span className="count">{String(days).padStart(3, '0')}</span> days<br />
          to decide your claim.
        </h1>
        <p className="lede">
          Most insurers use nearly all of them. We answer straightforward claims the same
          day, and when we can’t, we tell you exactly which clause is in the way.
        </p>
        <div className="cta">
          <button className="btn primary" onClick={onStart}>Lodge a claim</button>
          <button className="btn ghost" onClick={onStart}>Check a claim</button>
        </div>
        <p className="fine">
          About four minutes. Have photos of the damage, your licence, and a repair quote if you’ve got one.
        </p>
      </div>
      <ol className="steps">
        {[
          ['Tell us what happened', 'In your own words. No forms full of jargon.'],
          ['Show us the damage', 'Photos from your phone are enough.'],
          ['We check your policy', 'Against the wording that applied the day of the accident.'],
          ['You get an answer', 'With the exact clause we relied on, either way.'],
        ].map(([h, s], i) => (
          <li key={h}>
            <span className="sn">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3>{h}</h3>
              <p>{s}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Lodge({ onSubmit }) {
  const [step, setStep] = useState(0);
  const [what, setWhat] = useState(
    'I was stopped at the lights on Swan Street and the car behind went into my rear bumper. Nobody was hurt. We swapped details.'
  );
  const [when, setWhen] = useState('2026-08-04');
  const steps = ['What happened', 'When and where', 'Evidence'];

  return (
    <section className="lodge">
      <nav className="stepper" aria-label="Progress">
        {steps.map((s, i) => (
          <div key={s} className="stepitem" data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>
            <span>{i < step ? '✓' : i + 1}</span>
            {s}
          </div>
        ))}
      </nav>

      <div className="panel">
        {step === 0 && (
          <>
            <h2>Tell us what happened</h2>
            <p className="sub">Write it the way you’d tell a friend. We pull out the details we need.</p>
            <textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={6} aria-label="What happened" />
            <div className="extract">
              <span className="tiny">Read from your description</span>
              <ul>
                <li><b>Collision</b> · rear impact</li>
                <li><b>Swan Street</b> · Melbourne</li>
                <li><b>No injuries</b> reported</li>
                <li><b>Other driver</b> details exchanged</li>
              </ul>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2>When and where</h2>
            <p className="sub">We check your cover against the wording that applied on this date, not today’s.</p>
            <label className="field">
              <span>Date of the accident</span>
              <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="field">
              <span>Suburb</span>
              <input type="text" defaultValue="Richmond VIC 3121" />
            </label>
            <div className="extract">
              <span className="tiny">Cover check</span>
              <ul>
                <li>Policy <b>MTR-88213</b> was active on {when}</li>
                <li>Wording <b>PDS 2025.11</b> applies</li>
              </ul>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h2>Show us the damage</h2>
            <p className="sub">Photos from your phone are fine. Add a repair quote if you have one.</p>
            <div className="drops">
              {[
                ['Damage photos', '5 added', true],
                ['Driver licence', 'Added', true],
                ['Repair quote', 'Added', true],
                ['Police report', 'Not needed for this claim', false],
              ].map(([h, s, on]) => (
                <div key={h} className="drop" data-on={on}>
                  <b>{h}</b>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="navrow">
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="btn primary" onClick={() => (step === 2 ? onSubmit() : setStep(step + 1))}>
            {step === 2 ? 'Lodge the claim' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  );
}

function Processing({ onDone }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const el = (Date.now() - started) / 1000;
      setT(el);
      if (el > 7.4) {
        clearInterval(id);
        onDone();
      }
    }, 60);
    return () => clearInterval(id);
  }, [onDone]);

  return (
    <section className="proc">
      <span className="eyebrow">Claim A10293 · lodged just now</span>
      <h2>Working through your claim</h2>
      <div className="clockline">
        <span className="mono big">{t.toFixed(1)}s</span>
        <span className="tiny">of a 120 day window</span>
      </div>
      <ol className="run">
        {AGENT_RUN.map((r) => (
          <li key={r.line} data-on={t > r.at}>
            <span className="mono at">{r.at.toFixed(1)}s</span>
            <span className="ag">{r.agent}</span>
            <span className="ln">{r.line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Outcome({ onConsole }) {
  const c = CLAIMS[0];
  return (
    <section className="outcome">
      <div className="ocard">
        <Pill outcome="accept">Approved</Pill>
        <h2>Your claim is approved.</h2>
        <p className="sub">Decided in 7 seconds. The Code allowed us 120 days.</p>
        <dl className="sums">
          <div><dt>Repair cost</dt><dd className="mono">{money(c.quote)}</dd></div>
          <div><dt>Your excess</dt><dd className="mono">−{money(c.excess)}</dd></div>
          <div className="tot"><dt>We pay</dt><dd className="mono">{money(c.quote - c.excess)}</dd></div>
        </dl>
        <div className="why">
          <span className="tiny">Why</span>
          <p>
            Your collision is covered under <b>clause 7.2</b> of PDS 2025.11, the wording that
            applied on 4 August 2026. All seven checks passed.
          </p>
        </div>
        <div className="cta">
          <button className="btn primary">Book the repair</button>
          <button className="btn ghost" onClick={onConsole}>See how it was decided</button>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- assessor view */

function Console() {
  const [sel, setSel] = useState('A10294');
  const [shown, setShown] = useState(0);
  const timers = useRef([]);
  const claim = CLAIMS.find((c) => c.id === sel);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(7);
      return;
    }
    setShown(0);
    timers.current = claim.gates.map((_, i) => setTimeout(() => setShown(i + 1), 80 * (i + 1)));
    return () => timers.current.forEach(clearTimeout);
  }, [sel, claim.gates]);

  const stats = useMemo(
    () => ({
      auto: Math.round((CLAIMS.filter((c) => c.outcome === 'accept').length / CLAIMS.length) * 100),
      breached: CLAIMS.filter((c) => c.clock.band === 'breached').length,
    }),
    []
  );

  const o = OUTCOME[claim.outcome];
  const done = shown >= claim.gates.length;

  return (
    <section className="console">
      <div className="strip">
        {[
          [`${stats.auto}%`, 'Decided without a person', T.ink],
          ['91%', 'Agreement with AFCA', T.ok],
          ['0.7%', 'Decided wrongly with confidence', T.ok],
          [stats.breached, 'Code windows passed', stats.breached ? T.bad : T.ok],
        ].map(([v, l, c]) => (
          <div key={l} className="met">
            <b style={{ color: c }}>{v}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>

      <div className="split">
        <aside className="queue">
          {CLAIMS.map((c) => (
            <button key={c.id} className="qrow" aria-current={sel === c.id} onClick={() => setSel(c.id)}>
              <div className="qt">
                <span className="mono tiny">{c.id}</span>
                <Pill outcome={c.outcome} />
              </div>
              <b>{c.insured}</b>
              <div className="qm">
                <span>{c.peril} · {c.dateOfLoss}</span>
                <span className="mono">{c.quote ? money(c.quote) : '—'}</span>
              </div>
              <Rail clock={c.clock} />
            </button>
          ))}
        </aside>

        <main className="file">
          <header className="fhead">
            <div>
              <span className="mono tiny">{claim.id}</span>
              <h2>{claim.insured}</h2>
              <p className="sub">{claim.peril} · loss {claim.dateOfLoss} · notified {claim.notified}</p>
            </div>
            <Ring clock={claim.clock} />
          </header>

          <div className="trace">
            <div className="th">
              <span className="tiny">Validation trace</span>
              <span className="mono tiny">{shown}/7</span>
            </div>
            {claim.gates.map((g, i) => (
              <div
                key={g.n}
                className="gate"
                style={{ opacity: i < shown ? 1 : 0, transform: i < shown ? 'none' : 'translateY(4px)' }}
              >
                <span className="mono gn">{String(g.n).padStart(2, '0')}</span>
                <div>
                  <b>{g.name}</b>
                  <p>{g.basis}</p>
                  {g.citation && <span className="mono cite">{g.citation}</span>}
                </div>
                <span
                  className="mark"
                  style={{ background: g.passed ? T.okSoft : T.badSoft, color: g.passed ? T.ok : T.bad }}
                >
                  {g.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            ))}
          </div>

          <div className="record" style={{ opacity: done ? 1 : 0.3 }}>
            <div className="rhead" style={{ background: o.bg }}>
              <div className="rtop">
                <div>
                  <span className="tiny">Reasons record</span>
                  <b style={{ color: o.fg }}>{o.verb}</b>
                </div>
                <Pill outcome={claim.outcome} />
              </div>
              <p>
                {claim.outcome === 'accept' &&
                  `All seven gates cleared. We pay ${money(claim.quote - claim.excess)} after the ${money(claim.excess)} excess.`}
                {claim.outcome === 'request_evidence' &&
                  `Not decidable yet. Waiting on ${claim.missing.join(', ').toLowerCase()}.`}
                {claim.outcome === 'decline' &&
                  claim.gates.filter((g) => !g.passed).map((g) => g.basis).join(' ')}
                {claim.outcome === 'escalate' && claim.escalation.join(' ')}
              </p>
              <span className="mono cite">
                relied on {claim.gates.filter((g) => g.citation).map((g) => g.citation.split(' · ').pop()).join(', ')}
              </span>
            </div>
            <div className="acts">
              <button className="btn primary sm">Authorise</button>
              <button className="btn ghost sm">Edit and authorise</button>
              <button className="btn ghost sm">Draft the letter</button>
            </div>
          </div>

          <p className="note">
            Every line above comes from <code>engine.decide()</code>, a pure function with no model call.
            The agents that fed it returned clause identifiers, damaged parts and weighted discrepancies.
            None of them returned a verdict. There is no confidence score on this page by design. The trace
            is the confidence.
          </p>
        </main>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const [view, setView] = useState('home');
  const isClaimant = ['home', 'lodge', 'processing', 'outcome'].includes(view);

  return (
    <div className="app">
      <style>{CSS}</style>
      <header className="shell">
        <button className="brand" onClick={() => setView('home')}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="8" fill="none" stroke={T.plum} strokeWidth="2" />
            <path d="M9 4v5l3 2" fill="none" stroke={T.plum} strokeWidth="2" strokeLinecap="round" />
          </svg>
          Verdict
        </button>
        <nav className="tabs">
          <button data-on={isClaimant} onClick={() => setView('home')}>Claimant</button>
          <button data-on={view === 'console'} onClick={() => setView('console')}>Assessor</button>
        </nav>
      </header>

      {view === 'home' && <Hero onStart={() => setView('lodge')} />}
      {view === 'lodge' && <Lodge onSubmit={() => setView('processing')} />}
      {view === 'processing' && <Processing onDone={() => setView('outcome')} />}
      {view === 'outcome' && <Outcome onConsole={() => setView('console')} />}
      {view === 'console' && <Console />}

      <footer className="foot">
        <span>Verdict · autonomous claims processing for Australian general insurance</span>
        <span className="mono">demo data · not a real insurer</span>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------------- css */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
.app{background:${T.paper};color:${T.ink};font-family:${BODY};font-size:15px;line-height:1.6;min-height:100vh}
.app h1,.app h2,.app h3{font-family:${DISPLAY};font-weight:600;letter-spacing:-.025em;margin:0;line-height:1.1}
.app p{margin:0}
.mono{font-family:${MONO}}
.tiny{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:${T.mute}}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${T.plum}}
.sub{color:${T.mute};font-size:14.5px}
button{font:inherit;border:none;cursor:pointer;background:none;color:inherit}
:focus-visible{outline:2px solid ${T.plum};outline-offset:3px}

.shell{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 30px;background:${T.ink};color:#fff;position:sticky;top:0;z-index:9}
.brand{display:flex;align-items:center;gap:9px;font-family:${DISPLAY};font-size:17px;font-weight:600;letter-spacing:-.02em;color:#fff}
.tabs{display:flex;gap:4px;background:rgba(255,255,255,.09);padding:3px;border-radius:999px}
.tabs button{padding:6px 16px;border-radius:999px;font-size:13px;font-weight:500;color:rgba(255,255,255,.62)}
.tabs button[data-on=true]{background:#fff;color:${T.ink}}

.hero{display:grid;grid-template-columns:1fr;gap:44px;padding:64px 30px 60px;max-width:1180px;margin:0 auto}
@media(min-width:940px){.hero{grid-template-columns:1.15fr .85fr;gap:70px;padding:92px 30px 80px}}
.hero h1{font-size:clamp(38px,5.6vw,62px);margin:14px 0 0}
.count{font-family:${MONO};font-weight:400;color:${T.plum};font-variant-numeric:tabular-nums}
.lede{margin-top:22px;font-size:17px;color:${T.body};max-width:44ch}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}
.btn{padding:13px 26px;border-radius:999px;font-size:15px;font-weight:600;transition:transform .12s ease,background .15s ease}
.btn.sm{padding:9px 17px;font-size:13px}
.btn.primary{background:${T.plum};color:#fff}
.btn.primary:hover{background:#661f4a;transform:translateY(-1px)}
.btn.ghost{background:transparent;color:${T.ink};box-shadow:inset 0 0 0 1.5px ${T.rule}}
.btn.ghost:hover{background:${T.sand}}
.fine{margin-top:18px;font-size:13px;color:${T.mute}}
.steps{list-style:none;margin:0;padding:0;background:${T.card};border:1px solid ${T.rule};border-radius:16px;overflow:hidden}
.steps li{display:flex;gap:16px;padding:20px 24px;border-bottom:1px solid ${T.ruleSoft}}
.steps li:last-child{border-bottom:none}
.sn{font-family:${MONO};font-size:12px;color:${T.plum};padding-top:3px}
.steps h3{font-size:15.5px}
.steps p{font-size:13.5px;color:${T.mute};margin-top:3px}

.lodge,.proc,.outcome{max-width:760px;margin:0 auto;padding:52px 30px 70px}
.stepper{display:flex;gap:8px;margin-bottom:26px;flex-wrap:wrap}
.stepitem{display:flex;align-items:center;gap:8px;font-size:13px;color:${T.mute};padding:7px 14px;border-radius:999px;background:${T.sand}}
.stepitem[data-state=now]{background:${T.plumSoft};color:${T.plum};font-weight:600}
.stepitem[data-state=done]{background:${T.okSoft};color:${T.ok}}
.stepitem span{font-family:${MONO};font-size:11px}
.panel{background:${T.card};border:1px solid ${T.rule};border-radius:18px;padding:32px}
.panel h2{font-size:26px}
.panel .sub{margin-top:8px;margin-bottom:22px}
textarea,input{width:100%;font:inherit;font-size:15px;padding:14px 16px;border:1.5px solid ${T.rule};border-radius:11px;background:${T.paper};color:${T.ink};resize:vertical}
textarea:focus,input:focus{border-color:${T.plum};outline:none}
.field{display:block;margin-bottom:16px}
.field span{display:block;font-size:13px;font-weight:600;margin-bottom:7px}
.extract{margin-top:22px;padding:18px 20px;background:${T.plumSoft};border-radius:12px}
.extract ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px 22px;font-size:13.5px;color:${T.body}}
.drops{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.drop{padding:20px;border:1.5px dashed ${T.rule};border-radius:12px;background:${T.paper}}
.drop[data-on=true]{border-style:solid;border-color:${T.ok};background:${T.okSoft}}
.drop b{display:block;font-size:14px}
.drop span{font-size:12.5px;color:${T.mute}}
.navrow{display:flex;gap:10px;justify-content:flex-end;margin-top:28px}

.proc h2{font-size:30px;margin-top:12px}
.clockline{display:flex;align-items:baseline;gap:12px;margin:20px 0 30px}
.big{font-size:44px;color:${T.plum};font-variant-numeric:tabular-nums}
.run{list-style:none;margin:0;padding:0}
.run li{display:grid;grid-template-columns:52px 82px 1fr;gap:14px;align-items:baseline;padding:13px 0;border-top:1px solid ${T.ruleSoft};opacity:.18;transition:opacity .3s ease}
.run li[data-on=true]{opacity:1}
.at{font-size:12px;color:${T.mute}}
.ag{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.plum}}
.ln{font-size:14.5px;color:${T.body}}

.ocard{background:${T.card};border:1px solid ${T.rule};border-radius:20px;padding:38px}
.ocard h2{font-size:32px;margin:16px 0 0}
.sums{margin:28px 0 0;padding:0}
.sums div{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid ${T.ruleSoft}}
.sums dt{color:${T.mute};font-size:14px}
.sums dd{margin:0;font-size:15px}
.sums .tot{border-bottom:none;padding-top:16px}
.sums .tot dt{color:${T.ink};font-weight:600}
.sums .tot dd{font-size:24px;color:${T.ok}}
.why{margin-top:22px;padding:20px;background:${T.sand};border-radius:12px}
.why p{margin-top:9px;font-size:14px;color:${T.body}}

.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-family:${MONO};font-size:10.5px;font-weight:500;letter-spacing:.07em;text-transform:uppercase}
.pill i{width:5px;height:5px;border-radius:50%}
.rail{height:3px;border-radius:2px;background:${T.ruleSoft};overflow:hidden;margin-top:11px}
.rail span{display:block;height:100%;transition:width .5s ease}
.ringwrap{position:relative;display:grid;place-items:center;flex-shrink:0}
.ringwrap svg{position:absolute;inset:0}
.ringwrap>span{font-family:${MONO};font-size:19px;line-height:1;display:flex;flex-direction:column;align-items:center;gap:3px}
.ringwrap em{font-style:normal;font-size:8px;letter-spacing:.09em;text-transform:uppercase;color:${T.mute}}

.console{max-width:1320px;margin:0 auto;padding:0 0 60px}
.strip{display:flex;flex-wrap:wrap;background:${T.card};border-bottom:1px solid ${T.rule}}
.met{flex:1;min-width:145px;padding:20px 26px;border-left:1px solid ${T.ruleSoft}}
.met:first-child{border-left:none}
.met b{display:block;font-family:${MONO};font-size:28px;font-weight:500;letter-spacing:-.03em}
.met span{display:block;margin-top:6px;font-size:11.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:${T.mute}}
.split{display:flex;flex-wrap:wrap;align-items:stretch}
.queue{width:100%;background:${T.card};border-right:1px solid ${T.rule}}
@media(min-width:960px){.queue{width:320px;flex-shrink:0}}
.qrow{display:block;width:100%;text-align:left;padding:16px 22px;border-bottom:1px solid ${T.ruleSoft};border-left:3px solid transparent}
.qrow[aria-current=true]{background:${T.plumSoft};border-left-color:${T.plum}}
.qt{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
.qrow b{font-size:14.5px}
.qm{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:${T.mute};margin-top:2px}
.file{flex:1;min-width:300px;background:${T.card}}
.fhead{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:26px 30px;border-bottom:1px solid ${T.rule}}
.fhead h2{font-size:24px;margin:5px 0 4px}
.trace{padding:22px 30px}
.th{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px}
.gate{display:grid;grid-template-columns:28px 1fr auto;gap:14px;padding:14px 0;border-top:1px solid ${T.ruleSoft};transition:opacity .25s ease,transform .25s ease}
.gn{font-size:11px;color:${T.mute};padding-top:3px}
.gate b{font-size:14px}
.gate p{font-size:13.5px;color:${T.body};margin-top:3px}
.cite{display:inline-block;margin-top:6px;font-size:11px;color:${T.mute}}
.mark{align-self:start;padding:4px 9px;border-radius:4px;font-family:${MONO};font-size:10.5px;font-weight:500;letter-spacing:.08em}
.record{margin:6px 30px 0;border:1px solid ${T.rule};border-radius:14px;overflow:hidden;transition:opacity .3s ease}
.rhead{padding:22px 24px}
.rtop{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.rtop b{display:block;font-family:${DISPLAY};font-size:20px;font-weight:600;letter-spacing:-.02em;margin-top:4px}
.rhead p{margin-top:13px;font-size:14px;color:${T.body}}
.acts{display:flex;flex-wrap:wrap;gap:8px;padding:16px 24px;border-top:1px solid ${T.rule}}
.note{margin:24px 30px 0;padding-top:22px;border-top:1px solid ${T.ruleSoft};font-size:12.5px;color:${T.mute};line-height:1.75;max-width:74ch}
.note code{font-family:${MONO};font-size:12px;color:${T.petrol}}

.foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;padding:26px 30px;border-top:1px solid ${T.rule};font-size:12px;color:${T.mute}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
