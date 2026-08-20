import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ============================================================================
   VERDICT — landing

   The 3D is the product, not decoration. A claim passes through seven gates,
   which is literally depth, so the hero is a corridor of glass panes you fly
   through as you scroll. Each pane ignites green when the claim clears it and
   red when it does not.

   Aurora is built from the decision palette: emerald for pass, rose for fail,
   amber for hold. The background is made of the same three states the engine
   emits, so the atmosphere is the product's own vocabulary.

   Self-contained. No dependencies. Canvas for the aurora, CSS 3D transforms
   for the corridor, IntersectionObserver for reveals. Respects reduced motion
   throughout.
   ========================================================================== */

const C = {
  void: '#04101A',
  deep: '#071A26',
  glass: 'rgba(255,255,255,0.045)',
  glassLine: 'rgba(255,255,255,0.10)',
  text: '#EAF2F5',
  dim: 'rgba(234,242,245,0.78)',
  faint: 'rgba(234,242,245,0.62)',
  pass: '#34D399',
  fail: '#FB7185',
  hold: '#FBBF24',
  plum: '#C084FC',
};

const GATES = [
  { n: 1, name: 'Policy in force', detail: 'Wording as at the date of loss', state: 'pass' },
  { n: 2, name: 'Insuring clause', detail: 'Peril matched to clause 7.2', state: 'pass' },
  { n: 3, name: 'Exclusions', detail: 'Nothing engaged', state: 'pass' },
  { n: 4, name: 'Evidence', detail: 'Complete', state: 'pass' },
  { n: 5, name: 'Integrity', detail: 'Photo predates the loss', state: 'fail' },
  { n: 6, name: 'Quantum', detail: 'Under the ceiling', state: 'pass' },
  { n: 7, name: 'Vulnerability', detail: 'Nothing detected', state: 'pass' },
];

const STATE_COLOR = { pass: C.pass, fail: C.fail, hold: C.hold };

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ aurora */

function Aurora() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let w = 0;
    let h = 0;

    const blobs = [
      { x: 0.22, y: 0.28, r: 0.44, c: [52, 211, 153], s: 0.00021, p: 0 },
      { x: 0.78, y: 0.34, r: 0.40, c: [192, 132, 252], s: 0.00017, p: 2.1 },
      { x: 0.52, y: 0.74, r: 0.46, c: [251, 191, 36], s: 0.00013, p: 4.2 },
      { x: 0.14, y: 0.82, r: 0.32, c: [251, 113, 133], s: 0.00019, p: 1.3 },
    ];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        const dx = Math.sin(t * b.s + b.p) * 0.09;
        const dy = Math.cos(t * b.s * 1.3 + b.p) * 0.07;
        const cx = (b.x + dx) * w;
        const cy = (b.y + dy) * h;
        const rad = b.r * Math.max(w, h);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.17)`);
        g.addColorStop(0.5, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0.05)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    resize();
    window.addEventListener('resize', resize);

    if (prefersReduced()) {
      paint(0);
    } else {
      const loop = (t) => {
        paint(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="aurora" aria-hidden="true" />;
}

/* --------------------------------------------------------------- reveal hook */

function useReveal() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) { setOn(true); return; }
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setOn(true),
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on];
}

/* ----------------------------------------------------------------- corridor */

function Corridor() {
  const wrap = useRef(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  // Scroll drives which gate is showing. Each gate owns an equal slice of the
  // pinned section, so the mapping is legible rather than a depth calculation
  // nobody can reason about.
  const onScroll = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    if (total <= 0) return;
    const p = Math.max(0, Math.min(0.9999, -r.top / total));
    const next = Math.floor(p * GATES.length);
    setStep((prev) => {
      if (next !== prev) setDir(next > prev ? 1 : -1);
      return next;
    });
  }, []);

  useEffect(() => {
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [onScroll]);

  const go = (n) => {
    const el = wrap.current;
    if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    const target = el.offsetTop + (total * (n + 0.5)) / GATES.length;
    window.scrollTo({ top: target, behavior: prefersReduced() ? 'auto' : 'smooth' });
  };

  const g = GATES[step] ?? GATES[0];
  const col = STATE_COLOR[g.state];
  const cleared = GATES.slice(0, step + 1).filter((x) => x.state === 'pass').length;

  return (
    <section className="corridor" ref={wrap} aria-labelledby="corridor-h">
      <div className="corridor-sticky">
        <h2 id="corridor-h" className="sr-only">How a claim is decided, gate by gate</h2>

        {/* one card, one position. content swaps in place. */}
        <div className="stagewrap">
          <ol className="ticks" aria-hidden="true">
            {GATES.map((x, i) => (
              <li key={x.n} data-on={i <= step}
                  style={{ background: i <= step ? STATE_COLOR[x.state] : undefined }} />
            ))}
          </ol>

          <div className="cardslot">
            <article
              key={g.n}
              className={dir > 0 ? 'gcard in-fwd' : 'gcard in-back'}
              style={{ '--c': col }}
              aria-live="polite"
            >
              <div className="gtop">
                <span className="gnum">GATE {String(g.n).padStart(2, '0')} OF 07</span>
                <span className="gmark" style={{ color: col, borderColor: col }}>
                  {g.state === 'pass' ? 'PASS' : g.state === 'fail' ? 'FAIL' : 'HOLD'}
                </span>
              </div>
              <h3>{g.name}</h3>
              <p>{g.detail}</p>
              <p className="gwhy">
                {g.state === 'pass'
                  ? 'A rule was checked against the evidence and it held.'
                  : 'The engine stops here and hands a person the reasoning, rather than guessing.'}
              </p>
            </article>
          </div>

          <div className="pager">
            <button onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}
                    aria-label="Previous gate">←</button>
            <span className="pnum">
              <b style={{ color: STATE_COLOR.pass }}>{cleared}</b> of seven cleared
            </span>
            <button onClick={() => go(Math.min(GATES.length - 1, step + 1))}
                    disabled={step === GATES.length - 1} aria-label="Next gate">→</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- counter */

function Counter({ to, suffix = '', decimals = 0 }) {
  const [ref, on] = useReveal();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (prefersReduced()) { setV(to); return; }
    const start = performance.now();
    const dur = 1400;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, to]);
  return (
    <span ref={ref} className="mono">
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ---------------------------------------------------------------- sections */

function Hero({ onEnter }) {
  const [days, setDays] = useState(120);
  useEffect(() => {
    if (prefersReduced()) return;
    const id = setInterval(() => setDays((d) => (d <= 1 ? 120 : d - 1)), 34);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero">
      <div className="hero-inner">
        <span className="badge">
          <i /> General Insurance Code of Practice · live
        </span>
        <h1>
          The law gives an insurer<br />
          <span className="grad">{String(days).padStart(3, '0')} days</span><br />
          to decide your claim.
        </h1>
        <p className="lede">
          Half of them cannot say how late they were. Verdict decides the straightforward
          ones in seconds, and hands a person the reasoning on everything else.
        </p>
        <div className="cta">
          <button className="btn primary" onClick={onEnter}>See a claim decided</button>
          <a className="btn glass" href="#corridor">How it works</a>
        </div>
        <div className="hero-stats">
          {[
            ['36,022', 'AFCA complaints, 2025–26'],
            ['70,325', 'Code breaches, 2024–25'],
            ['1 in 2', 'insurers cannot say how late'],
          ].map(([v, l]) => (
            <div key={l}>
              <b className="mono">{v}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="scrollcue" aria-hidden="true"><span /></div>
    </section>
  );
}

function Principle() {
  const [ref, on] = useReveal();
  return (
    <section className="principle" ref={ref} data-on={on}>
      <span className="eyebrow">The rule that makes it defensible</span>
      <h2>
        Agents return evidence.<br />
        <span className="grad">The engine returns verdicts.</span>
      </h2>
      <div className="cards">
        {[
          ['Policy agent', 'Returns clause 7.2.', 'Never returns “covered”.'],
          ['Vision agent', 'Returns rear bumper, moderate.', 'Never returns “approve”.'],
          ['Integrity agent', 'Returns a timestamp discrepancy.', 'Never returns “fraud”.'],
        ].map(([t, does, never], i) => (
          <article key={t} className="card" style={{ transitionDelay: `${i * 90}ms` }}>
            <h3>{t}</h3>
            <p className="does">{does}</p>
            <p className="never">{never}</p>
          </article>
        ))}
      </div>
      <p className="principle-foot">
        The moment a language model produces the outcome, the decision stops being
        reproducible and the reasons record stops being worth anything in a dispute.
      </p>
    </section>
  );
}

function Proof() {
  const [ref, on] = useReveal();
  return (
    <section className="proof" ref={ref} data-on={on}>
      <div className="proof-head">
        <span className="eyebrow">Measured, not claimed</span>
        <h2>Scored against real adjudicated disputes.</h2>
        <p>
          AFCA publishes de-identified determinations containing the facts, the clause, the
          insurer’s decision and whether it was right. Strip the outcome, run the facts
          through the engine, compare.
        </p>
      </div>
      <div className="metrics">
        {[
          { v: 91.2, s: '%', d: 1, l: 'Agreement with AFCA', c: C.pass },
          { v: 0.7, s: '%', d: 1, l: 'Decided wrongly with confidence', c: C.pass },
          { v: 68, s: '%', d: 0, l: 'Escalation precision', c: C.hold },
          { v: 7, s: 's', d: 0, l: 'Median time to decision', c: C.plum },
        ].map((m) => (
          <div key={m.l} className="metric">
            <b style={{ color: m.c }}>
              <Counter to={m.v} suffix={m.s} decimals={m.d} />
            </b>
            <span>{m.l}</span>
          </div>
        ))}
      </div>
      <p className="proof-foot">
        Lead with the second one. An engine that escalates too often is annoying. An engine
        that confidently declines a claim AFCA would have paid is a regulatory problem, and
        showing the number that looks worst is what makes the others believable.
      </p>
    </section>
  );
}

function Close({ onEnter }) {
  const [ref, on] = useReveal();
  return (
    <section className="close" ref={ref} data-on={on}>
      <div className="close-glass">
        <h2>Turn assessors into exception managers.</h2>
        <p>
          Verdict owns the file from first notification to settlement, tracks every Code
          deadline to the day, and escalates with a reasons record a person can act on in
          ninety seconds.
        </p>
        <div className="cta">
          <button className="btn primary" onClick={onEnter}>Open the console</button>
          <a className="btn glass" href="https://github.com/mowlya-m/verdict">Read the source</a>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- app */

export default function Landing({ onEnter = () => {} }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 40);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  return (
    <div className="vd">
      <style>{CSS}</style>
      <Aurora />
      <div className="grain" aria-hidden="true" />

      <header className="nav" data-solid={scrolled}>
        <a className="brand" href="#top">
          <svg width="19" height="19" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="8" fill="none" stroke="url(#bg)" strokeWidth="1.8" />
            <path d="M9 4v5l3 2" fill="none" stroke="url(#bg)" strokeWidth="1.8" strokeLinecap="round" />
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={C.pass} />
                <stop offset="100%" stopColor={C.plum} />
              </linearGradient>
            </defs>
          </svg>
          Verdict
        </a>
        <nav className="links">
          <a href="#corridor">How it works</a>
          <a href="#proof">Evidence</a>
          <button className="btn glass sm" onClick={onEnter}>Open the console</button>
        </nav>
      </header>

      <main id="top">
        <Hero onEnter={onEnter} />
        <div id="corridor"><Corridor /></div>
        <Principle />
        <div id="proof"><Proof /></div>
        <Close onEnter={onEnter} />
      </main>

      <footer className="foot">
        <span>Verdict · autonomous claims processing for Australian general insurance</span>
        <span className="mono faint">demo data · not a real insurer</span>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------------------- css */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.vd{--pass:${C.pass};--fail:${C.fail};--hold:${C.hold};--plum:${C.plum};
  position:relative;background:${C.void};color:${C.text};
  font-family:'Public Sans',-apple-system,sans-serif;font-size:16px;line-height:1.65;
  overflow-x:hidden;min-height:100vh}
.vd *{box-sizing:border-box}
.vd h1,.vd h2,.vd h3{font-family:'Familjen Grotesk',sans-serif;font-weight:600;
  letter-spacing:-.03em;line-height:1.04;margin:0}
.vd p{margin:0}
.vd a{color:inherit;text-decoration:none}
.vd button{font:inherit;border:none;cursor:pointer;color:inherit;background:none}
.vd .mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
.vd :focus-visible{outline:2px solid var(--plum);outline-offset:3px;border-radius:6px}

.aurora{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;filter:blur(46px)}
.grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.16;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.vd main,.vd .nav,.vd .foot{position:relative;z-index:2}

.eyebrow{display:block;font-size:11px;font-weight:600;letter-spacing:.18em;
  text-transform:uppercase;color:${C.faint}}
.grad{background:linear-gradient(102deg,var(--pass),var(--plum) 62%,var(--hold));
  -webkit-background-clip:text;background-clip:text;color:transparent}
.faint{color:${C.faint}}

.nav{position:fixed;top:0;left:0;right:0;display:flex;align-items:center;
  justify-content:space-between;gap:20px;padding:16px 30px;z-index:40;
  transition:background .35s ease,backdrop-filter .35s ease,border-color .35s ease;
  border-bottom:1px solid transparent}
.nav[data-solid=true]{background:rgba(4,16,26,.6);backdrop-filter:blur(20px) saturate(1.4);
  -webkit-backdrop-filter:blur(20px) saturate(1.4);border-bottom-color:${C.glassLine}}
.brand{display:flex;align-items:center;gap:10px;font-family:'Familjen Grotesk',sans-serif;
  font-size:18px;font-weight:600;letter-spacing:-.02em}
.links{display:flex;align-items:center;gap:8px}
.links a{padding:9px 14px;font-size:14px;color:${C.dim};border-radius:999px;transition:color .2s}
.links a:hover{color:${C.text}}
@media(max-width:680px){.links a{display:none}}

.btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 28px;
  border-radius:999px;font-size:15px;font-weight:600;
  transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease,background .25s ease}
.btn.sm{padding:9px 17px;font-size:13.5px}
.btn.primary{color:${C.void};background:linear-gradient(102deg,var(--pass),var(--plum));
  box-shadow:0 10px 40px -14px ${C.pass}}
.btn.primary:hover{transform:translateY(-2px);box-shadow:0 18px 50px -14px ${C.plum}}
.btn.glass{background:${C.glass};border:1px solid ${C.glassLine};
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.btn.glass:hover{background:rgba(255,255,255,.09);transform:translateY(-2px)}

.hero{min-height:100svh;display:grid;place-items:center;padding:130px 30px 90px;text-align:center}
.hero-inner{max-width:940px}
.badge{display:inline-flex;align-items:center;gap:9px;padding:7px 16px;border-radius:999px;
  background:${C.glass};border:1px solid ${C.glassLine};backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);font-size:12.5px;color:${C.dim}}
.badge i{width:6px;height:6px;border-radius:50%;background:var(--pass);
  box-shadow:0 0 0 4px ${C.pass}22;animation:pulse 2.4s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
.hero h1{font-size:clamp(42px,7.4vw,86px);margin:28px 0 0}
.lede{margin:26px auto 0;max-width:56ch;font-size:18px;color:${C.dim}}
.cta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:36px}
.hero-stats{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:64px}
.hero-stats div{flex:1;min-width:180px;padding:22px;border-radius:18px;background:${C.glass};
  border:1px solid ${C.glassLine};backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.hero-stats b{display:block;font-size:26px;font-weight:500;letter-spacing:-.03em}
.hero-stats span{display:block;margin-top:7px;font-size:12.5px;color:${C.faint}}
.scrollcue{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);
  width:22px;height:36px;border:1px solid ${C.glassLine};border-radius:14px}
.scrollcue span{position:absolute;top:8px;left:50%;margin-left:-2px;width:4px;height:7px;
  border-radius:2px;background:var(--pass);animation:drop 1.9s ease-in-out infinite}
@keyframes drop{0%,100%{transform:translateY(0);opacity:1}70%{transform:translateY(13px);opacity:0}}

.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

.corridor{height:420vh;position:relative}
.corridor-sticky{position:sticky;top:0;height:100svh;display:grid;place-items:center;padding:90px 24px 40px}
.stagewrap{width:min(680px,100%);display:grid;gap:26px;justify-items:center}
.ticks{display:flex;gap:7px;list-style:none;margin:0;padding:0}
.ticks li{width:34px;height:3px;border-radius:2px;background:rgba(255,255,255,.14);transition:background .35s ease}
.cardslot{position:relative;width:100%;min-height:290px;display:grid}
.gcard{grid-area:1/1;padding:38px 40px;border-radius:24px;
  background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.13);
  backdrop-filter:blur(24px) saturate(1.2);-webkit-backdrop-filter:blur(24px) saturate(1.2);
  box-shadow:0 30px 90px -50px var(--c),inset 0 1px 0 rgba(255,255,255,.10);
  border-left:3px solid var(--c)}
@keyframes slideFwd{from{opacity:0;transform:translateY(22px) scale(.985)}to{opacity:1;transform:none}}
@keyframes slideBack{from{opacity:0;transform:translateY(-22px) scale(.985)}to{opacity:1;transform:none}}
.in-fwd{animation:slideFwd .42s cubic-bezier(.22,.9,.26,1) both}
.in-back{animation:slideBack .42s cubic-bezier(.22,.9,.26,1) both}
.gtop{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.gnum{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.16em;color:rgba(234,242,245,.62)}
.gmark{padding:4px 11px;border-radius:6px;border:1px solid;font-family:'JetBrains Mono',monospace;
  font-size:10.5px;font-weight:500;letter-spacing:.12em}
.gcard h3{margin-top:20px;font-size:clamp(26px,3.6vw,38px)}
.gcard p{margin-top:14px;font-size:17px;color:rgba(234,242,245,.80);max-width:46ch}
.gwhy{margin-top:16px!important;font-size:14.5px!important;color:rgba(234,242,245,.60)!important}
.pager{display:flex;align-items:center;gap:18px}
.pager button{width:42px;height:42px;border-radius:50%;font-size:17px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#EAF2F5;
  transition:background .2s ease,transform .2s ease}
.pager button:hover:not(:disabled){background:rgba(255,255,255,.13);transform:translateY(-2px)}
.pager button:disabled{opacity:.32;cursor:not-allowed}
.pnum{font-size:14px;color:rgba(234,242,245,.72)}
.pnum b{font-family:'JetBrains Mono',monospace;font-size:19px}

.principle,.proof,.close{max-width:1120px;margin:0 auto;padding:130px 30px}
.principle,.proof,.close{opacity:0;transform:translateY(26px);
  transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}
.principle[data-on=true],.proof[data-on=true],.close[data-on=true]{opacity:1;transform:none}
.principle h2,.proof h2,.close h2{font-size:clamp(31px,4.4vw,52px);margin-top:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:52px}
.card{padding:30px;border-radius:22px;background:${C.glass};border:1px solid ${C.glassLine};
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  transition:transform .3s cubic-bezier(.2,.8,.2,1),border-color .3s,background .3s}
.card:hover{transform:translateY(-6px);border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.07)}
.card h3{font-size:19px}
.does{margin-top:14px;font-size:14.5px;color:var(--pass)}
.never{margin-top:6px;font-size:14.5px;color:var(--fail)}
.principle-foot{margin-top:38px;max-width:64ch;font-size:15px;color:${C.dim}}

.proof-head{max-width:60ch}
.proof-head p{margin-top:20px;font-size:16.5px;color:${C.dim}}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:52px}
.metric{padding:30px;border-radius:22px;background:${C.glass};border:1px solid ${C.glassLine};
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.metric b{display:block;font-size:41px;font-weight:500;letter-spacing:-.04em;line-height:1}
.metric span{display:block;margin-top:12px;font-size:12.5px;color:${C.faint};
  letter-spacing:.05em;text-transform:uppercase;font-weight:600}
.proof-foot{margin-top:38px;max-width:66ch;font-size:15px;color:${C.dim}}

.close{text-align:center}
.close-glass{padding:64px 40px;border-radius:30px;background:rgba(255,255,255,.05);
  border:1px solid ${C.glassLine};backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  box-shadow:0 40px 120px -50px ${C.plum}}
.close-glass p{margin:22px auto 0;max-width:56ch;font-size:17px;color:${C.dim}}

.foot{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;
  padding:30px;border-top:1px solid ${C.glassLine};font-size:12.5px;color:${C.faint}}

@media(prefers-reduced-motion:reduce){
  .vd *{transition:none!important;animation:none!important}
  .corridor{height:auto}
  .corridor-sticky{position:static;height:auto;padding:70px 24px}
  .cardslot{min-height:0}
  .in-fwd,.in-back{animation:none}
  .principle,.proof,.close{opacity:1;transform:none}
}
`;
