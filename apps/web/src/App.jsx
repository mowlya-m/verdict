import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Landing from './Landing.jsx';
import { ALL_CLAIMS, AS_AT } from './claims.js';
import { decideMotor, decideHealth, counterfactual, serviceUp } from './api.js';

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
  // One design system, shared with Landing.jsx. Every value measured against
  // white: nothing here is below the 4.5:1 WCAG AA floor for body text.
  //
  // Key names are kept from the previous palette so the stylesheet below did
  // not need rewriting, but `plum` and `petrol` now both resolve to the single
  // cerulean accent. There is one accent in this product, not three.
  ink: '#0E2438',        // headings, chrome            15.8:1
  petrol: '#0B6E99',     // accent, kept for the request-evidence state
  plum: '#0B6E99',       // accent: links, CTAs, focus   5.7:1
  plumSoft: '#EBF4F9',
  paper: '#F4F7F9',
  sand: '#EDF1F4',
  rule: '#DDE4EA',
  ruleSoft: '#E9EEF2',
  card: '#FFFFFF',
  body: '#3D4E5C',       //                              8.6:1
  mute: '#5A6B78',       // was #7C858E at 3.5:1, which failed AA
  ok: '#0E7C4A',         //                              5.3:1
  okSoft: '#E6F4EC',
  warn: '#9A5B06',       // was #B0731C at 3.7:1, which failed AA
  warnSoft: '#FBF2E2',
  bad: '#B42318',        //                              6.6:1
  badSoft: '#FBEAE8',
};

// Landing dropped the display face. One type system, one voice.
const DISPLAY = "'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif";
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

/**
 * Ask the engine to decide one claim.
 *
 * The console renders what it is told. It computes no outcome, derives no
 * payable amount and infers no clock band. Everything below the API boundary
 * is the engine's word.
 */
async function decideOne(entry) {
  const fn = entry.kind === 'health' ? decideHealth : decideMotor;
  const decision = await fn(entry.body, AS_AT);
  return { ...entry, decision };
}

/** Decide the whole book, keeping failures alongside successes. */
async function decideAll(entries) {
  const settled = await Promise.allSettled(entries.map(decideOne));
  return settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ...entries[i], decision: null, error: r.reason?.message ?? 'Decision failed' },
  );
}

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

function Outcome({ decision, error, onConsole, onRetry }) {
  if (error) {
    return (
      <section className="outcome">
        <div className="ocard">
          <Pill outcome="escalate">Not decided</Pill>
          <h2>We could not decide this yet.</h2>
          <p className="sub">{error}</p>
          <div className="cta">
            <button className="btn primary" onClick={onRetry}>Try again</button>
            <button className="btn ghost" onClick={onConsole}>Open the console</button>
          </div>
        </div>
      </section>
    );
  }
  if (!decision) return null;

  const clauses = decision.clauses_relied_on.join(', ');

  return (
    <section className="outcome">
      <div className="ocard">
        <Pill outcome={decision.outcome} />
        <h2>
          {decision.outcome === 'accept' && 'Your claim is approved.'}
          {decision.outcome === 'partial' && 'Your claim is partly covered.'}
          {decision.outcome === 'decline' && 'We cannot pay this claim.'}
          {decision.outcome === 'request_evidence' && 'We need a little more from you.'}
          {decision.outcome === 'escalate' && 'A person is looking at this.'}
        </h2>
        <p className="sub">
          Decided in seconds. The Code allowed {decision.clock.days_remaining >= 0
            ? `${decision.clock.days_remaining} more days`
            : 'four months'}.
        </p>

        {decision.payable !== null && (
          <dl className="sums">
            <div>
              <dt>Benefit assessed</dt>
              <dd className="mono">{money(decision.payable + (decision.excess_applied ?? 0))}</dd>
            </div>
            <div>
              <dt>Your excess</dt>
              <dd className="mono">−{money(decision.excess_applied ?? 0)}</dd>
            </div>
            <div className="tot">
              <dt>We pay</dt>
              <dd className="mono">{money(decision.payable)}</dd>
            </div>
          </dl>
        )}

        <div className="why">
          <span className="tiny">Why</span>
          <p>{decision.summary}</p>
          {clauses && (
            <p style={{ marginTop: 8, fontSize: 12.5, color: T.mute }}>
              Relied on {clauses}.
            </p>
          )}
        </div>

        <div className="cta">
          <button className="btn primary">
            {decision.outcome === 'accept' ? 'Book the repair' : 'Contact us'}
          </button>
          <button className="btn ghost" onClick={onConsole}>See how it was decided</button>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- assessor view */


/* ------------------------------------------------------- counterfactual panel

   Sits under the reasons record because it answers the question a person has
   the moment they read one: is there a way forward, or is this finished.

   Levers arrive already ordered and already classified. This renders them; it
   decides nothing. An immovable fact carries no outcome and no money, so there
   is deliberately no path here that could make one look actionable.
   ---------------------------------------------------------------------------- */

const LEVER_KIND = {
  claimant: { label: 'The claimant can do this', c: T.accent },
  insurer: { label: 'We do this', c: T.petrol },
  practitioner: { label: 'A practitioner must do this', c: T.warn },
  immovable: { label: 'Cannot change', c: T.mute },
};

function Counterfactual({ payload, asAt }) {
  const [state, setState] = useState({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await counterfactual(payload, asAt) });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  }, [payload, asAt]);

  if (state.status === 'idle') {
    return (
      <div className="cf cf-idle">
        <div>
          <b>What would change this?</b>
          <p>Re-runs the decision with one fact altered at a time.</p>
        </div>
        <button className="btn ghost sm" onClick={load}>Work it out</button>
      </div>
    );
  }

  if (state.status === 'loading') {
    return <div className="cf cf-idle"><p>Re-running the decision…</p></div>;
  }

  if (state.status === 'error') {
    return (
      <div className="cf cf-idle">
        <p style={{ color: T.bad }}>{state.message}</p>
        <button className="btn ghost sm" onClick={load}>Try again</button>
      </div>
    );
  }

  const { data } = state;

  if (!data.levers.length) {
    return (
      <div className="cf cf-idle">
        <p style={{ color: T.ok }}>{data.summary}</p>
      </div>
    );
  }

  return (
    <div className="cf">
      <div className="cf-head">
        <span className="tiny">What would change this</span>
        {data.is_settled && <span className="cf-settled">Nothing further to chase</span>}
      </div>
      <p className="cf-sum">{data.summary}</p>

      <ul className="cf-list">
        {data.levers.map((x, i) => {
          const kind = LEVER_KIND[x.kind] ?? LEVER_KIND.immovable;
          return (
            <li key={i} className="cf-item" data-immovable={x.kind === 'immovable'}>
              <span className="cf-bar" style={{ background: kind.c }} />
              <div className="cf-body">
                <div className="cf-top">
                  <b>{x.action}</b>
                  {/* Money only ever appears where a real re-run produced it. */}
                  {x.payable_delta > 0 && (
                    <span className="cf-money mono">
                      +${x.payable_delta.toLocaleString('en-AU')}
                    </span>
                  )}
                </div>
                <p>{x.because}</p>
                <div className="cf-tags">
                  <span style={{ color: kind.c }}>{kind.label}</span>
                  {x.decisive && <span className="cf-tag cf-yes">Settles the claim</span>}
                  {x.progresses && <span className="cf-tag">Closes {x.gaps_closed} gap{x.gaps_closed === 1 ? '' : 's'}</span>}
                  {x.gate_cleared && <span className="cf-tag cf-gate">{x.gate_cleared}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="cf-note">
        Every figure above is <code>engine.decide()</code> re-run with one fact changed, not
        an estimate. Facts that could only change by misrepresenting the loss are never
        offered as options.
      </p>
    </div>
  );
}

function Console() {
  const [book, setBook] = useState(null);          // null = still loading
  const [sel, setSel] = useState(null);
  const [product, setProduct] = useState('all');
  const [shown, setShown] = useState(0);
  const [offline, setOffline] = useState(false);
  const timers = useRef([]);

  // Decide the whole book once, on mount. Every gate on screen comes back
  // from the engine; nothing here works out an outcome for itself.
  useEffect(() => {
    let live = true;
    (async () => {
      const up = await serviceUp();
      if (!live) return;
      setOffline(!up);
      const decided = await decideAll(ALL_CLAIMS);
      if (!live) return;
      setBook(decided);
      const firstInteresting =
        decided.find((c) => c.decision && c.decision.outcome !== 'accept') ?? decided[0];
      setSel(firstInteresting?.body.claim_id ?? null);
    })();
    return () => { live = false; };
  }, []);

  const visible = useMemo(
    () => (book ?? []).filter((c) => product === 'all' || c.kind === product),
    [book, product],
  );
  const claim = (book ?? []).find((c) => c.body.claim_id === sel) ?? null;
  // The ?? [] fallback allocates a fresh array on every render, which would
  // restart the trace animation continuously. Memoise so the effect only fires
  // when the decision actually changes.
  const gates = useMemo(() => claim?.decision?.gates ?? [], [claim?.decision]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (!gates.length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(gates.length);
      return;
    }
    setShown(0);
    timers.current = gates.map((_, i) => setTimeout(() => setShown(i + 1), 80 * (i + 1)));
    return () => timers.current.forEach(clearTimeout);
  }, [sel, gates]);

  const stats = useMemo(() => {
    const decided = (book ?? []).filter((c) => c.decision);
    if (!decided.length) return { auto: 0, breached: 0, n: 0 };
    return {
      n: decided.length,
      auto: Math.round(
        (decided.filter((c) => c.decision.outcome === 'accept').length / decided.length) * 100,
      ),
      breached: decided.filter((c) => c.decision.clock.band === 'breached').length,
    };
  }, [book]);

  if (!book) {
    return (
      <section className="console">
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <p>Asking the engine to decide {ALL_CLAIMS.length} claims…</p>
        </div>
      </section>
    );
  }

  if (offline) {
    return (
      <section className="console">
        <div className="loading">
          <h2 style={{ fontSize: 22 }}>The decision service is not running.</h2>
          <p style={{ marginTop: 10, maxWidth: '46ch' }}>
            Every outcome on this screen comes from the engine over HTTP, so there is
            nothing to show without it. Start it with <code>make api</code>, then reload.
          </p>
        </div>
      </section>
    );
  }

  const o = claim?.decision ? OUTCOME[claim.decision.outcome] : null;
  const done = shown >= gates.length && gates.length > 0;

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
        <aside className="queue" aria-label="Claim queue">
          <div className="qfilter">
            {[['all', 'All'], ['motor', 'Motor'], ['health', 'Health']].map(([k, l]) => (
              <button key={k} data-on={product === k} onClick={() => setProduct(k)}>{l}</button>
            ))}
          </div>
          {visible.map((c) => (
            <button
              key={c.body.claim_id}
              className="qrow"
              aria-current={sel === c.body.claim_id}
              onClick={() => setSel(c.body.claim_id)}
            >
              <div className="qt">
                <span className="mono tiny">{c.body.claim_id}</span>
                {c.decision ? <Pill outcome={c.decision.outcome} /> : <span className="tiny">error</span>}
              </div>
              <b>{c.insured}</b>
              <div className="qm">
                <span>{c.label}</span>
              </div>
              {c.decision && <Rail clock={c.decision.clock} />}
            </button>
          ))}
        </aside>

        <section className="file" aria-label="Claim detail">
          {!claim && <div className="loading"><p>Pick a claim.</p></div>}

          {claim && claim.error && (
            <div className="loading">
              <h2 style={{ fontSize: 20 }}>{claim.body.claim_id} could not be decided</h2>
              <p style={{ marginTop: 8 }}>{claim.error}</p>
            </div>
          )}

          {claim && claim.decision && (
            <>
              <header className="fhead">
                <div>
                  <span className="mono tiny">{claim.body.claim_id} · {claim.kind}</span>
                  <h2>{claim.insured}</h2>
                  <p className="sub">{claim.label}</p>
                </div>
                <Ring clock={claim.decision.clock} />
              </header>

              <div className="trace">
                <div className="th">
                  <span className="tiny">Validation trace</span>
                  <span className="mono tiny">{shown}/{gates.length}</span>
                </div>
                {gates.map((g, i) => (
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

              <div
                className="record"
                style={{ opacity: done ? 1 : 0.3 }}
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="rhead" style={{ background: o.bg }}>
                  <div className="rtop">
                    <div>
                      <span className="tiny">Reasons record</span>
                      <b style={{ color: o.fg }}>{o.verb}</b>
                    </div>
                    <Pill outcome={claim.decision.outcome} />
                  </div>
                  <p>{claim.decision.summary}</p>
                  {claim.decision.clauses_relied_on.length > 0 && (
                    <span className="mono cite">
                      relied on {claim.decision.clauses_relied_on.join(', ')}
                    </span>
                  )}
                </div>
                <div className="acts">
                  <button className="btn primary sm">Authorise</button>
                  <button className="btn ghost sm">Edit and authorise</button>
                  <button className="btn ghost sm">Draft the letter</button>
                </div>
              </div>

              {claim.kind !== 'health' && claim.decision.outcome !== 'accept' && (
                <Counterfactual payload={claim.payload} asAt={AS_AT} />
              )}

              <p className="note">
                Every line above came back from <code>engine.decide()</code> over HTTP, a pure
                function with no model call. This console computed none of it. There is no
                confidence score on this page by design — the trace is the confidence.
                <span className="mono" style={{ display: 'block', marginTop: 8 }}>
                  engine {claim.decision.engine_version}
                </span>
              </p>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const [view, setView] = useState('landing');
  const isClaimant = ['home', 'lodge', 'processing', 'outcome'].includes(view);

  // The landing page owns the full viewport and its own chrome.
  if (view === 'landing') return <Landing onEnter={() => setView('home')} />;

  return (
    <div className="app">
      <style>{CSS}</style>
      <a className="skip" href="#main">Skip to content</a>
      <header className="shell">
        <button className="brand" onClick={() => setView('landing')}>
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

      <main id="main">
      {view === 'home' && <Hero onStart={() => setView('lodge')} />}
      {view === 'lodge' && <Lodge onSubmit={() => setView('processing')} />}
      {view === 'processing' && <Processing onDone={() => setView('outcome')} />}
      {view === 'outcome' && <Outcome onConsole={() => setView('console')} />}
      {view === 'console' && <Console />}

      </main>

      <footer className="foot">
        <span>Verdict · autonomous claims processing for Australian general insurance</span>
        <span className="mono">demo data · not a real insurer</span>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------------- css */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box}
.skip{position:absolute;left:-9999px;top:0;z-index:100;background:${T.ink};color:#fff;
  padding:12px 18px;border-radius:0 0 8px 0;font-weight:600}
.skip:focus{left:0}
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
.cf{margin:14px 30px 0;border:1px solid ${T.rule};border-radius:14px;padding:20px 24px;background:${T.card}}
.cf-idle{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
.cf-idle b{display:block;font-size:15px;color:${T.ink}}
.cf-idle p{margin-top:4px;font-size:13.5px;color:${T.mute}}
.cf-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.cf-settled{font-size:11.5px;font-weight:600;letter-spacing:.04em;padding:3px 10px;border-radius:20px;
  background:${T.sand};color:${T.slate}}
.cf-sum{margin-top:10px;font-size:15px;color:${T.ink};font-weight:600}
.cf-list{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.cf-item{display:flex;gap:14px;padding:14px 16px;border:1px solid ${T.ruleSoft};border-radius:10px;
  background:${T.paper}}
.cf-item[data-immovable=true]{opacity:.72;background:${T.card};border-style:dashed}
.cf-bar{width:3px;border-radius:2px;flex-shrink:0}
.cf-body{flex:1;min-width:0}
.cf-top{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;justify-content:space-between}
.cf-top b{font-size:14.5px;color:${T.ink}}
.cf-money{font-size:15px;font-weight:600;color:${T.ok}}
.cf-body p{margin-top:5px;font-size:13.5px;color:${T.body};line-height:1.55}
.cf-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px;font-size:11.5px;font-weight:600}
.cf-tag{padding:2px 9px;border-radius:20px;background:${T.sand};color:${T.slate};font-weight:500}
.cf-yes{background:${T.okSoft};color:${T.ok};font-weight:600}
.cf-gate{font-family:${MONO};font-size:10.5px;letter-spacing:.02em}
.cf-note{margin-top:16px;padding-top:14px;border-top:1px solid ${T.ruleSoft};
  font-size:12px;color:${T.mute};line-height:1.6}
.cf-note code{font-family:${MONO};font-size:11.5px}

.note{margin:24px 30px 0;padding-top:22px;border-top:1px solid ${T.ruleSoft};font-size:12.5px;color:${T.mute};line-height:1.75;max-width:74ch}
.note code{font-family:${MONO};font-size:12px;color:${T.petrol}}

.foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;padding:26px 30px;border-top:1px solid ${T.rule};font-size:12px;color:${T.mute}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
