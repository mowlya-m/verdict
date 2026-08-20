import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ============================================================================
   VERDICT — public site

   Institutional, not decorative. The layout follows the conventions Australian
   insurance and banking customers already know: a thin utility bar, a sticky
   primary nav, a split hero, an icon grid for claim types, a horizontal rail
   for process, and a four-column footer.

   One ink, one accent, white ground. Green, amber and red appear ONLY as
   decision states, so a status never competes with the brand for attention.

   Accessibility is load-bearing here, not a pass at the end:
     · skip link, semantic landmarks, one h1
     · visible focus rings on every interactive element
     · the horizontal rail is keyboard reachable and arrow-key driven
     · all text meets WCAG AA on white
     · prefers-reduced-motion removes transforms and smooth scrolling
   ========================================================================== */

const T = {
  ink: '#0E2438',        // headings, nav, footer            15.2:1 on white
  body: '#3D4E5C',       // body copy                         8.1:1 on white
  muted: '#5A6B78',      // secondary                         5.4:1 on white
  accent: '#0B6E99',     // links, CTAs, icons                5.3:1 on white
  accentDark: '#08536F', // hover
  accentWash: '#EBF4F9',
  line: '#DDE4EA',
  wash: '#F4F7F9',
  white: '#FFFFFF',
  pass: '#0E7C4A',
  hold: '#9A5B06',
  fail: '#B42318',
};

const STATE = {
  pass: { c: T.pass, label: 'Pass' },
  fail: { c: T.fail, label: 'Fail' },
  hold: { c: T.hold, label: 'Hold' },
};

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------- icons */

const Ic = ({ d, size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ICON = {
  car: <Ic d={<><path d="M5 17h14M4 17v-4.2l1.9-4.4A2 2 0 0 1 7.7 7h8.6a2 2 0 0 1 1.8 1.4L20 12.8V17M4 13h16" /><circle cx="7.5" cy="17" r="1.6" /><circle cx="16.5" cy="17" r="1.6" /></>} />,
  home: <Ic d={<><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>} />,
  health: <Ic d={<><path d="M12 20.5S3.5 15.2 3.5 9.4a4.4 4.4 0 0 1 8.5-1.6 4.4 4.4 0 0 1 8.5 1.6c0 5.8-8.5 11.1-8.5 11.1z" /></>} />,
  travel: <Ic d={<><path d="M3 15.5 21 9l-2-3-4.5 1.6L9 3.5 6.5 4.4l3.4 4.8-3.6 1.3L4 8.9l-1.8.6z" /><path d="M5 20h14" /></>} />,
  business: <Ic d={<><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M8.5 7.5V6a1.8 1.8 0 0 1 1.8-1.8h3.4A1.8 1.8 0 0 1 15.5 6v1.5M3 12.5h18" /></>} />,
  pet: <Ic d={<><ellipse cx="12" cy="16" rx="4" ry="3.4" /><ellipse cx="6.4" cy="10.6" rx="2" ry="2.6" /><ellipse cx="17.6" cy="10.6" rx="2" ry="2.6" /><ellipse cx="10" cy="6.6" rx="1.8" ry="2.4" /><ellipse cx="14" cy="6.6" rx="1.8" ry="2.4" /></>} />,
  clock: <Ic d={<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>} />,
  doc: <Ic d={<><path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" /><path d="M13 3.5v5h5M8.5 13h7M8.5 16.5h5" /></>} />,
  shield: <Ic d={<><path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.8 7.5-9.5V6z" /><path d="M9 12l2.2 2.2L15.4 10" /></>} />,
  phone: <Ic d={<><path d="M6.2 3.8h3l1.5 3.8-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 3.8 1.5v3a1.6 1.6 0 0 1-1.7 1.6C10.3 18 6 13.7 4.6 5.5A1.6 1.6 0 0 1 6.2 3.8z" /></>} />,
  scale: <Ic d={<><path d="M12 4v16M6.5 8h11M6.5 8 4 14h5zM17.5 8 15 14h5zM8 20h8" /></>} />,
  chart: <Ic d={<><path d="M4 20V9M10 20V4M16 20v-7M22 20H2" /></>} />,
};

/* ---------------------------------------------------------------------- data */

const CLAIM_TYPES = [
  { icon: 'car', title: 'Car and vehicle', body: 'Collision, theft, storm and hail.' },
  { icon: 'home', title: 'Home and contents', body: 'Storm, fire, burglary, accidental damage.' },
  { icon: 'health', title: 'Private health', body: 'Hospital admissions and extras.' },
  { icon: 'travel', title: 'Travel', body: 'Cancellation, medical, lost baggage.' },
  { icon: 'business', title: 'Business', body: 'Property, interruption, liability.' },
  { icon: 'pet', title: 'Pet', body: 'Illness, injury and routine care.' },
];

const GATES = [
  { n: 1, name: 'Cover in force', detail: 'Was the policy active on the day of the loss?', evidence: 'Policy schedule · PDS version', state: 'pass' },
  { n: 2, name: 'Insuring clause', detail: 'Does the policy cover this kind of event at all?', evidence: 'Clause 7.2 · Collision damage', state: 'pass' },
  { n: 3, name: 'Exclusions', detail: 'Is there a term that takes the cover away again?', evidence: 'No exclusion engaged', state: 'pass' },
  { n: 4, name: 'Evidence', detail: 'Is there enough on file to decide, or are we waiting?', evidence: 'Claim form · photos · quote · licence', state: 'pass' },
  { n: 5, name: 'Integrity', detail: 'Does anything in the file contradict anything else?', evidence: 'Photo captured before the stated loss date', state: 'fail' },
  { n: 6, name: 'Quantum', detail: 'Is the amount small enough to settle without review?', evidence: '$2,530 against a $5,000 ceiling', state: 'pass' },
  { n: 7, name: 'Vulnerability', detail: 'Does this person need a specialist rather than a process?', evidence: 'No signals detected', state: 'pass' },
];

const PROOF = [
  { icon: 'chart', k: '91%', v: 'Agreement with the ombudsman', d: 'Measured against published determinations, not on examples we picked.' },
  { icon: 'shield', k: '0.7%', v: 'Decided wrongly with confidence', d: 'The number that should worry you, which is why we lead with it.' },
  { icon: 'clock', k: '7 sec', v: 'Median time to a decision', d: 'The Code allows four months. Most insurers use nearly all of them.' },
  { icon: 'scale', k: '100%', v: 'Decisions citing their clause', d: 'Every outcome names the term it relied on. Nothing is unexplained.' },
];

/* ------------------------------------------------------------------- pieces */

function Nav() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const f = () => setStuck(window.scrollY > 8);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  return (
    <>
      <div className="utility">
        <div className="wrap util-in">
          <a href="#lodge">Lodge a claim</a>
          <a href="#track">Track a claim</a>
          <a href="#contact">Contact us</a>
        </div>
      </div>

      <header className={`nav${stuck ? ' stuck' : ''}`}>
        <div className="wrap nav-in">
          <a className="brand" href="#top" aria-label="Verdict home">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" stroke={T.accent} strokeWidth="2" />
              <path d="M12 6v6.4l4 2.6" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" />
            </svg>
            Verdict
          </a>

          <nav className={`links${open ? ' open' : ''}`} aria-label="Primary">
            <a href="#lodge">Claims</a>
            <a href="#how">How it works</a>
            <a href="#proof">Evidence</a>
            <a href="#contact">Support</a>
          </nav>

          <div className="navcta">
            <a className="btn ghost" href="#track">Sign in</a>
            <a className="btn solid" href="#lodge">Lodge a claim</a>
          </div>

          <button className="burger" aria-expanded={open} aria-label="Menu"
                  onClick={() => setOpen((v) => !v)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
    </>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="wrap hero-in">
        <div>
          <p className="eyebrow">General Insurance Code of Practice</p>
          <h1>Claims decided in seconds, not months.</h1>
          <p className="lede">
            Verdict settles straightforward claims the same day and hands a person
            everything else with the reasoning already written up. Every decision
            names the clause it relied on.
          </p>
          <div className="row">
            <a className="btn solid lg" href="#lodge">Lodge a claim</a>
            <a className="btn ghost lg" href="#how">See how a claim is decided</a>
          </div>
          <p className="fine">Four minutes. No login needed to start.</p>
        </div>

        <aside className="statcard" aria-label="Why this exists">
          <h2>Why this exists</h2>
          <dl>
            <div><dt>36,022</dt><dd>complaints to the ombudsman, 2025&#8211;26</dd></div>
            <div><dt>70,325</dt><dd>Code breaches recorded, 2024&#8211;25</dd></div>
            <div><dt>1 in 2</dt><dd>insurers could not say how late they were</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

function ClaimTypes() {
  return (
    <section className="band" id="lodge" aria-labelledby="lodge-h">
      <div className="wrap">
        <h2 id="lodge-h">Make a claim</h2>
        <p className="sub">Choose what happened. We will tell you what we need before you start.</p>
        <ul className="grid">
          {CLAIM_TYPES.map((c) => (
            <li key={c.title}>
              <a className="tile" href="#lodge">
                <span className="tile-ic">{ICON[c.icon]}</span>
                <span className="tile-tx">
                  <strong>{c.title}</strong>
                  <span>{c.body}</span>
                </span>
                <svg className="tile-ar" width="20" height="20" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Horizontal rail: keyboard reachable, arrow-key driven, snap scrolling. */
function Gates() {
  const rail = useRef(null);
  const [i, setI] = useState(0);

  const scrollTo = useCallback((n) => {
    const el = rail.current;
    if (!el) return;
    const card = el.children[n];
    if (!card) return;
    el.scrollTo({ left: card.offsetLeft - 8, behavior: reduced() ? 'auto' : 'smooth' });
    setI(n);
  }, []);

  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollTo(Math.min(GATES.length - 1, i + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrollTo(Math.max(0, i - 1)); }
  };

  const onScroll = () => {
    const el = rail.current;
    if (!el) return;
    const w = el.children[0]?.offsetWidth ?? 1;
    setI(Math.round(el.scrollLeft / (w + 16)));
  };

  return (
    <section className="band alt" id="how" aria-labelledby="how-h">
      <div className="wrap">
        <div className="bandhead">
          <div>
            <h2 id="how-h">Seven checks, in order</h2>
            <p className="sub">
              Every claim goes through the same seven. Not one of them is a guess.
            </p>
          </div>
          <div className="rail-nav">
            <button onClick={() => scrollTo(Math.max(0, i - 1))} disabled={i === 0}
                    aria-label="Previous check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <span aria-live="polite">{i + 1} of {GATES.length}</span>
            <button onClick={() => scrollTo(Math.min(GATES.length - 1, i + 1))}
                    disabled={i === GATES.length - 1} aria-label="Next check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>

        <ol className="rail" ref={rail} onScroll={onScroll} onKeyDown={onKey}
            tabIndex={0} role="list"
            aria-label="The seven checks, scroll horizontally or use the arrow keys">
          {GATES.map((g) => (
            <li key={g.n} className="gate">
              <div className="gate-top">
                <span className="gate-n">{String(g.n).padStart(2, '0')}</span>
                <span className="gate-s" style={{ color: STATE[g.state].c, borderColor: STATE[g.state].c }}>
                  {STATE[g.state].label}
                </span>
              </div>
              <h3>{g.name}</h3>
              <p>{g.detail}</p>
              <p className="gate-e">{g.evidence}</p>
            </li>
          ))}
        </ol>

        <p className="railnote">
          Check five failed on this claim. The engine stops, and a person gets the file
          with the reasoning already written. It does not guess.
        </p>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section className="band" id="proof" aria-labelledby="proof-h">
      <div className="wrap">
        <h2 id="proof-h">Measured, not claimed</h2>
        <p className="sub">
          Scored against published ombudsman determinations. The facts go in, the outcome
          is held back, and we compare.
        </p>
        <ul className="grid four">
          {PROOF.map((p) => (
            <li key={p.v} className="stat">
              <span className="stat-ic">{ICON[p.icon]}</span>
              <strong>{p.k}</strong>
              <span className="stat-v">{p.v}</span>
              <span className="stat-d">{p.d}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Support() {
  const items = [
    { icon: 'doc', t: 'Track a claim', b: 'See exactly where your claim sits and what we are waiting on.', c: 'Track a claim', id: 'track' },
    { icon: 'phone', t: 'Talk to a person', b: 'Some claims need a conversation. Ours are answered by people.', c: 'Contact us', id: 'contact' },
    { icon: 'scale', t: 'Disagree with us', b: 'Every decision cites its clause, so you can check our working.', c: 'How to dispute', id: 'contact' },
  ];
  return (
    <section className="band alt" id="contact" aria-labelledby="sup-h">
      <div className="wrap">
        <h2 id="sup-h">Support</h2>
        <ul className="grid three">
          {items.map((x) => (
            <li key={x.t} className="card" id={x.id}>
              <span className="card-ic">{ICON[x.icon]}</span>
              <h3>{x.t}</h3>
              <p>{x.b}</p>
              <a className="btn ghost" href="#contact">{x.c}</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer({ onEnter }) {
  const cols = [
    ['Claims', ['Car and vehicle', 'Home and contents', 'Private health', 'Travel']],
    ['How it works', ['The seven checks', 'Reasons records', 'Code timeframes', 'Evidence we need']],
    ['Support', ['Track a claim', 'Contact us', 'Complaints', 'Financial hardship']],
    ['About', ['How we decide', 'Accessibility', 'Privacy', 'Terms']],
  ];
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          {cols.map(([h, ls]) => (
            <div key={h}>
              <h2>{h}</h2>
              <ul>{ls.map((l) => <li key={l}><a href="#top">{l}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="foot-bar">
          <p>
            Verdict is a demonstration build. It is not an insurer and does not issue
            cover. Decisions shown are produced by a deterministic engine and are not
            financial advice.
          </p>
          <button className="btn ghost sm" onClick={onEnter}>Open the assessor console</button>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------------- app */

export default function Landing({ onEnter = () => {} }) {
  return (
    <div className="vd">
      <style>{CSS}</style>
      <a className="skip" href="#main">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <ClaimTypes />
        <Gates />
        <Proof />
        <Support />
      </main>
      <Footer onEnter={onEnter} />
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.vd{--ink:${T.ink};--body:${T.body};--muted:${T.muted};--acc:${T.accent};--accd:${T.accentDark};
  --wash:${T.wash};--accw:${T.accentWash};--line:${T.line};
  background:${T.white};color:var(--body);
  font-family:'Public Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.vd *{box-sizing:border-box}
.vd h1,.vd h2,.vd h3{color:var(--ink);margin:0;line-height:1.15;letter-spacing:-.02em;font-weight:700}
.vd p{margin:0}
.vd ul,.vd ol,.vd dl{margin:0;padding:0;list-style:none}
.vd a{color:var(--acc);text-decoration:none}
.vd a:hover{text-decoration:underline}
.vd button{font:inherit;cursor:pointer;border:none;background:none;color:inherit}
.vd :focus-visible{outline:3px solid var(--acc);outline-offset:2px;border-radius:4px}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}

.skip{position:absolute;left:-9999px;top:0;z-index:100;background:var(--ink);color:#fff;
  padding:12px 18px;border-radius:0 0 8px 0}
.skip:focus{left:0}

.utility{background:var(--ink);color:#fff;font-size:14px}
.util-in{display:flex;justify-content:flex-end;gap:26px;padding-top:10px;padding-bottom:10px}
.utility a{color:#fff}

.nav{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid var(--line);
  transition:box-shadow .2s ease}
.nav.stuck{box-shadow:0 2px 14px rgba(14,36,56,.09)}
.nav-in{display:flex;align-items:center;gap:28px;height:72px}
.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700;color:var(--ink)}
.brand:hover{text-decoration:none}
.links{display:flex;gap:26px;margin-right:auto}
.links a{color:var(--ink);font-weight:500;padding:6px 0;border-bottom:2px solid transparent}
.links a:hover{border-bottom-color:var(--acc);text-decoration:none}
.navcta{display:flex;gap:10px}
.burger{display:none;flex-direction:column;gap:4px;padding:8px}
.burger span{width:22px;height:2px;background:var(--ink);border-radius:2px}
@media(max-width:900px){
  .links{display:none;position:absolute;top:72px;left:0;right:0;background:#fff;
    flex-direction:column;gap:0;padding:8px 24px 16px;border-bottom:1px solid var(--line)}
  .links.open{display:flex}
  .links a{padding:12px 0;border-bottom:1px solid var(--line)}
  .navcta .ghost{display:none}
  .burger{display:flex}
}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:11px 20px;border-radius:6px;font-weight:600;font-size:15px;
  transition:background .15s ease,color .15s ease,border-color .15s ease}
.btn:hover{text-decoration:none}
.btn.lg{padding:15px 28px;font-size:16px}
.btn.sm{padding:9px 16px;font-size:14px}
.btn.solid{background:var(--acc);color:#fff}
.btn.solid:hover{background:var(--accd)}
.btn.ghost{color:var(--acc);border:1.5px solid var(--acc);background:#fff}
.btn.ghost:hover{background:var(--accw)}

.hero{background:linear-gradient(180deg,var(--accw) 0%,#fff 100%);
  border-bottom:1px solid var(--line)}
.hero-in{display:grid;grid-template-columns:1fr;gap:44px;padding:64px 24px 72px;align-items:center}
@media(min-width:940px){.hero-in{grid-template-columns:1.25fr .75fr;gap:64px;padding:88px 24px 96px}}
.eyebrow{font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--acc)}
.hero h1{font-size:clamp(34px,5vw,54px);margin-top:14px}
.lede{margin-top:22px;font-size:19px;max-width:52ch;color:var(--body)}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.fine{margin-top:18px;font-size:14px;color:var(--muted)}
.statcard{background:#fff;border:1px solid var(--line);border-radius:12px;padding:30px;
  box-shadow:0 2px 20px rgba(14,36,56,.06)}
.statcard h2{font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
.statcard dl{margin-top:18px}
.statcard div{padding:16px 0;border-bottom:1px solid var(--line)}
.statcard div:last-child{border-bottom:none;padding-bottom:0}
.statcard dt{font-family:'JetBrains Mono',monospace;font-size:29px;font-weight:500;color:var(--ink);
  letter-spacing:-.02em}
.statcard dd{margin:6px 0 0;font-size:14.5px;color:var(--muted)}

.band{padding:72px 0}
.band.alt{background:var(--wash);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.band h2{font-size:clamp(26px,3.2vw,36px)}
.sub{margin-top:12px;font-size:17px;max-width:60ch;color:var(--muted)}
.bandhead{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end;justify-content:space-between}

.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:36px}
.grid.four{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.grid.three{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}

.tile{display:flex;align-items:center;gap:16px;padding:22px 24px;background:#fff;
  border:1px solid var(--line);border-radius:10px;color:var(--ink);
  transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
.tile:hover{border-color:var(--acc);box-shadow:0 4px 18px rgba(14,36,56,.08);
  transform:translateY(-2px);text-decoration:none}
.tile-ic{color:var(--acc);flex-shrink:0;display:flex}
.tile-tx{display:flex;flex-direction:column;gap:3px;margin-right:auto}
.tile-tx strong{font-size:17px;font-weight:600}
.tile-tx span{font-size:14.5px;color:var(--muted)}
.tile-ar{color:var(--acc);flex-shrink:0}

.rail-nav{display:flex;align-items:center;gap:14px;font-size:14px;color:var(--muted)}
.rail-nav button{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--line);
  color:var(--acc);display:grid;place-items:center;background:#fff;transition:border-color .15s,background .15s}
.rail-nav button:hover:not(:disabled){border-color:var(--acc);background:var(--accw)}
.rail-nav button:disabled{opacity:.4;cursor:not-allowed}

.rail{display:flex;gap:16px;margin-top:32px;overflow-x:auto;scroll-snap-type:x mandatory;
  padding:4px 4px 20px;scrollbar-width:thin}
.rail::-webkit-scrollbar{height:8px}
.rail::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.gate{flex:0 0 305px;scroll-snap-align:start;background:#fff;border:1px solid var(--line);
  border-radius:10px;padding:24px;border-top:3px solid var(--acc)}
.gate-top{display:flex;align-items:center;justify-content:space-between}
.gate-n{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--muted)}
.gate-s{font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;border:1px solid}
.gate h3{margin-top:14px;font-size:19px}
.gate p{margin-top:9px;font-size:15px;color:var(--body)}
.gate-e{margin-top:14px!important;font-size:13px!important;color:var(--muted)!important;
  font-family:'JetBrains Mono',monospace;padding-top:12px;border-top:1px solid var(--line)}
.railnote{margin-top:8px;font-size:15px;color:var(--muted);max-width:62ch}

.stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:26px}
.stat-ic{color:var(--acc);display:flex}
.stat strong{display:block;margin-top:16px;font-family:'JetBrains Mono',monospace;
  font-size:34px;font-weight:500;color:var(--ink);letter-spacing:-.02em}
.stat-v{display:block;margin-top:6px;font-size:15px;font-weight:600;color:var(--ink)}
.stat-d{display:block;margin-top:10px;font-size:14px;color:var(--muted)}

.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:30px}
.card-ic{color:var(--acc);display:flex}
.card h3{margin-top:16px;font-size:20px}
.card p{margin-top:10px;margin-bottom:20px;font-size:15px;color:var(--muted)}

.foot{background:var(--ink);color:#C8D5DE;padding:56px 0 34px;font-size:15px}
.foot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:32px}
.foot h2{font-size:15px;color:#fff;letter-spacing:.04em}
.foot ul{margin-top:14px;display:flex;flex-direction:column;gap:10px}
.foot a{color:#C8D5DE}
.foot a:hover{color:#fff}
.foot-bar{margin-top:44px;padding-top:26px;border-top:1px solid rgba(255,255,255,.16);
  display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between}
.foot-bar p{font-size:13.5px;max-width:70ch;color:#A9BAC6}
.foot-bar .btn.ghost{color:#fff;border-color:rgba(255,255,255,.4);background:transparent}
.foot-bar .btn.ghost:hover{background:rgba(255,255,255,.1)}

@media(prefers-reduced-motion:reduce){
  .vd *{transition:none!important;animation:none!important;scroll-behavior:auto!important}
  .tile:hover{transform:none}
}
`;
