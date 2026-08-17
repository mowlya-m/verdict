import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================================
   VERDICT — assessor console

   Design thesis: the chrome is deliberately colourless so that the only colour
   in the interface is a decision or a deadline. An assessor scanning 140 open
   files should be able to see risk without reading a word.

   Self-contained by design — no CSS import — so it runs under Vite and also
   renders standalone for review.
   ========================================================================== */

const C = {
  ink: "#15171C", graphite: "#282C34", slate: "#5A6270", mute: "#8A919E",
  rule: "#DEDAD2", ruleSoft: "#EBE8E1", paper: "#F8F7F4", card: "#FFFFFF",
  accent: "#34506B", accentSoft: "#E9EEF4",
  ok: "#1B6B4A", okSoft: "#E6F1EC",
  warn: "#B0731C", warnSoft: "#FBF1E0",
  bad: "#A02A2A", badSoft: "#F8EAEA",
};
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const OUTCOME = {
  accept: { label: "Accept", fg: C.ok, bg: C.okSoft, verb: "Approve and settle" },
  partial: { label: "Partial", fg: C.warn, bg: C.warnSoft, verb: "Settle in part" },
  decline: { label: "Decline", fg: C.bad, bg: C.badSoft, verb: "Decline with reasons" },
  request_evidence: { label: "Evidence", fg: C.accent, bg: C.accentSoft, verb: "Request from claimant" },
  escalate: { label: "Escalate", fg: C.warn, bg: C.warnSoft, verb: "Hold for a human" },
};
const BAND = { ok: C.ok, at_risk: C.warn, breached: C.bad };

/* --------------------------------------------------------------- fixtures
   Mirrors the shape returned by POST /claims/{id}/decide. Swap for a fetch
   against VERDICT_API_URL; nothing below cares where it came from.          */

const CLAIMS = [
  {
    id: "A10293", insured: "D. Okafor", peril: "motor_collision", product: "Comprehensive Motor",
    dateOfLoss: "2026-08-04", notified: "2026-08-05", quote: 2530, excess: 750,
    outcome: "accept", clock: { band: "ok", daysRemaining: 108, consumed: 0.1 },
    gates: [
      { n: 1, name: "Policy in force at date of loss", passed: true, basis: "Cover ran 2026-01-01 to 2026-12-31; loss dated 2026-08-04.", citation: "MTR-88213 · PDS 2025.11" },
      { n: 2, name: "Peril falls within an insuring clause", passed: true, basis: "Collision matched to Collision damage.", citation: "7.2" },
      { n: 3, name: "No exclusion applies", passed: true, basis: "No exclusion matched the circumstances." },
      { n: 4, name: "Evidence sufficient to decide", passed: true, basis: "All required evidence on file." },
      { n: 5, name: "Integrity checks", passed: true, basis: "No material discrepancies." },
      { n: 6, name: "Quantum within auto-settle ceiling", passed: true, basis: "2,530.00 against a 5,000 ceiling." },
      { n: 7, name: "No vulnerability signals", passed: true, basis: "None detected." },
    ],
  },
  {
    id: "A10294", insured: "T. Nguyen", peril: "motor_collision", product: "Comprehensive Motor",
    dateOfLoss: "2026-08-01", notified: "2026-08-02", quote: 4900, excess: 750,
    outcome: "escalate", clock: { band: "ok", daysRemaining: 105, consumed: 0.13 },
    gates: [
      { n: 1, name: "Policy in force at date of loss", passed: true, basis: "Cover ran 2026-01-01 to 2026-12-31; loss dated 2026-08-01.", citation: "MTR-90114 · PDS 2025.11" },
      { n: 2, name: "Peril falls within an insuring clause", passed: true, basis: "Collision matched to Collision damage.", citation: "7.2" },
      { n: 3, name: "No exclusion applies", passed: true, basis: "No exclusion matched the circumstances." },
      { n: 4, name: "Evidence sufficient to decide", passed: true, basis: "All required evidence on file." },
      { n: 5, name: "Integrity checks", passed: false, basis: "Score 7. p1.jpg captured 2026-07-12, before the stated loss date. p2.jpg is perceptually identical to p1.jpg. Quote 4,900 is 250% above the top of the estimated band. Quote includes tailgate, which does not appear in the damage findings." },
      { n: 6, name: "Quantum within auto-settle ceiling", passed: true, basis: "4,900.00 against a 5,000 ceiling." },
      { n: 7, name: "No vulnerability signals", passed: true, basis: "None detected." },
    ],
    escalation: ["Integrity score at investigation threshold. A human must decide, not the engine."],
  },
  {
    id: "A10295", insured: "R. Patel", peril: "motor_theft", product: "Comprehensive Motor",
    dateOfLoss: "2026-08-10", notified: "2026-08-11", quote: null, excess: 750,
    outcome: "request_evidence", clock: { band: "ok", daysRemaining: 114, consumed: 0.05 },
    missing: ["police_report", "purchase_proof", "licence"],
    gates: [
      { n: 1, name: "Policy in force at date of loss", passed: true, basis: "Cover ran 2026-01-01 to 2026-12-31; loss dated 2026-08-10.", citation: "MTR-77420 · PDS 2025.11" },
      { n: 2, name: "Peril falls within an insuring clause", passed: true, basis: "Theft matched to Theft of vehicle.", citation: "8.1" },
      { n: 3, name: "No exclusion applies", passed: true, basis: "No exclusion matched the circumstances." },
      { n: 4, name: "Evidence sufficient to decide", passed: false, basis: "Missing: police_report, purchase_proof, licence." },
      { n: 5, name: "Integrity checks", passed: true, basis: "No material discrepancies." },
      { n: 6, name: "Quantum within auto-settle ceiling", passed: false, basis: "Damage extent not determinable from the evidence supplied." },
      { n: 7, name: "No vulnerability signals", passed: true, basis: "None detected." },
    ],
  },
  {
    id: "A10287", insured: "S. Alvarez", peril: "motor_collision", product: "Comprehensive Motor",
    dateOfLoss: "2026-04-02", notified: "2026-04-06", quote: 3180, excess: 750,
    outcome: "escalate", clock: { band: "breached", daysRemaining: -13, consumed: 1.11 },
    gates: [
      { n: 1, name: "Policy in force at date of loss", passed: true, basis: "Cover ran 2026-01-01 to 2026-12-31; loss dated 2026-04-02.", citation: "MTR-61208 · PDS 2025.11" },
      { n: 2, name: "Peril falls within an insuring clause", passed: true, basis: "Collision matched to Collision damage.", citation: "7.2" },
      { n: 3, name: "No exclusion applies", passed: true, basis: "No exclusion matched the circumstances." },
      { n: 4, name: "Evidence sufficient to decide", passed: true, basis: "All required evidence on file." },
      { n: 5, name: "Integrity checks", passed: true, basis: "No material discrepancies." },
      { n: 6, name: "Quantum within auto-settle ceiling", passed: true, basis: "3,180.00 against a 5,000 ceiling." },
      { n: 7, name: "No vulnerability signals", passed: false, basis: "Detected: financial hardship disclosed." },
    ],
    escalation: ["Vulnerability signals detected. Route to a specialist handler.", "Code decision window already breached. Prioritise."],
  },
  {
    id: "A10291", insured: "K. Brennan", peril: "motor_collision", product: "Comprehensive Motor",
    dateOfLoss: "2026-05-19", notified: "2026-05-20", quote: 1420, excess: 750,
    outcome: "decline", clock: { band: "at_risk", daysRemaining: 22, consumed: 0.82 },
    gates: [
      { n: 1, name: "Policy in force at date of loss", passed: true, basis: "Cover ran 2026-01-01 to 2026-12-31; loss dated 2026-05-19.", citation: "MTR-52907 · PDS 2025.11" },
      { n: 2, name: "Peril falls within an insuring clause", passed: true, basis: "Collision matched to Collision damage.", citation: "7.2" },
      { n: 3, name: "No exclusion applies", passed: false, basis: "Excluded by Driver not licensed to drive the vehicle.", citation: "9.4" },
      { n: 4, name: "Evidence sufficient to decide", passed: true, basis: "All required evidence on file." },
      { n: 5, name: "Integrity checks", passed: true, basis: "No material discrepancies." },
      { n: 6, name: "Quantum within auto-settle ceiling", passed: true, basis: "1,420.00 against a 5,000 ceiling." },
      { n: 7, name: "No vulnerability signals", passed: true, basis: "None detected." },
    ],
  },
];

const money = (n) => "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------- atoms */

function Chip({ outcome }) {
  const o = OUTCOME[outcome];
  return (
    <span className="chip" style={{ background: o.bg, color: o.fg }}>
      <i style={{ background: o.fg }} />{o.label}
    </span>
  );
}

/* The signature element: a deadline rail. Fills left to right as the Code
   window is consumed. Colourless chrome makes this the loudest thing on the
   page, which is the point. */
function ClockRail({ clock, compact }) {
  const pct = Math.min(100, Math.round(clock.consumed * 100));
  const col = BAND[clock.band];
  return (
    <div>
      <div className="rail"><span style={{ width: pct + "%", background: col }} /></div>
      {!compact && (
        <div className="railmeta">
          <span style={{ color: col, fontWeight: 500 }}>
            {clock.band === "breached"
              ? `Breached by ${Math.abs(clock.daysRemaining)} days`
              : `${clock.daysRemaining} days to decision deadline`}
          </span>
          <span>{pct}% of window used</span>
        </div>
      )}
    </div>
  );
}

function GateRow({ g, visible }) {
  const s = g.passed ? { fg: C.ok, bg: C.okSoft, mark: "PASS" } : { fg: C.bad, bg: C.badSoft, mark: "FAIL" };
  return (
    <div className="gate" style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(4px)" }}>
      <span className="gn">{String(g.n).padStart(2, "0")}</span>
      <div>
        <div className="gname">{g.name}</div>
        <div className="gbasis">{g.basis}</div>
        {g.citation && <div className="gcite">{g.citation}</div>}
      </div>
      <span className="mark" style={{ background: s.bg, color: s.fg }}>{s.mark}</span>
    </div>
  );
}

/* -------------------------------------------------------------------- app  */

export default function App() {
  const [selected, setSelected] = useState(CLAIMS[1].id);
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(0);
  const timers = useRef([]);

  const claim = CLAIMS.find((c) => c.id === selected);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(claim.gates.length); return;
    }
    setShown(0);
    claim.gates.forEach((_, i) => timers.current.push(setTimeout(() => setShown(i + 1), 80 * (i + 1))));
    return () => timers.current.forEach(clearTimeout);
  }, [selected, claim.gates.length]);

  const queue = useMemo(
    () => (filter === "all" ? CLAIMS : CLAIMS.filter((c) => (filter === "auto" ? c.outcome === "accept" : c.outcome !== "accept"))),
    [filter]
  );

  const stats = useMemo(() => {
    const auto = CLAIMS.filter((c) => c.outcome === "accept").length;
    return {
      autoRate: Math.round((auto / CLAIMS.length) * 100),
      atRisk: CLAIMS.filter((c) => c.clock.band !== "ok").length,
      breached: CLAIMS.filter((c) => c.clock.band === "breached").length,
    };
  }, []);

  const o = OUTCOME[claim.outcome];
  const done = shown >= claim.gates.length;
  const payable = claim.outcome === "accept" ? claim.quote - claim.excess : null;

  return (
    <div className="app">
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box}
.app{background:${C.paper};color:${C.ink};font-family:${SANS};min-height:100vh;font-size:14px}
button{font:inherit;border:none;cursor:pointer}
.bar{background:${C.ink};color:#fff;padding:14px 24px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
.brand{font-size:16px;font-weight:600;letter-spacing:-.02em}
.tag{font-family:${MONO};font-size:11px;color:#8A919E;letter-spacing:.04em}
.strip{display:flex;flex-wrap:wrap;background:${C.card};border-bottom:1px solid ${C.rule}}
.met{flex:1;min-width:150px;padding:16px 22px;border-left:1px solid ${C.ruleSoft}}
.met:first-child{border-left:none}
.metv{font-family:${MONO};font-size:26px;font-weight:600;letter-spacing:-.03em;line-height:1}
.metl{margin-top:7px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.slate}}
.body{display:flex;flex-wrap:wrap;align-items:stretch}
.queue{width:100%;background:${C.card};border-right:1px solid ${C.rule}}
@media(min-width:900px){.queue{width:326px;flex-shrink:0}}
.qhead{display:flex;gap:6px;padding:12px 18px;border-bottom:1px solid ${C.rule}}
.ftab{padding:5px 11px;border-radius:4px;font-size:12px;font-weight:500;background:transparent;color:${C.slate}}
.ftab[aria-pressed=true]{background:${C.accentSoft};color:${C.accent}}
.qrow{display:block;width:100%;text-align:left;padding:14px 18px;background:transparent;border-bottom:1px solid ${C.ruleSoft};border-left:3px solid transparent}
.qrow[aria-current=true]{background:${C.accentSoft};border-left-color:${C.accent}}
.qtop{display:flex;align-items:center;justify-content:space-between;gap:8px}
.qid{font-family:${MONO};font-size:11px;color:${C.mute}}
.qname{margin-top:6px;font-size:14px;font-weight:600}
.qmeta{margin-top:2px;font-family:${MONO};font-size:11px;color:${C.mute};display:flex;justify-content:space-between;gap:8px}
.main{flex:1;min-width:300px;background:${C.card}}
.chead{padding:22px 26px;border-bottom:1px solid ${C.rule}}
.ctitle{font-size:21px;font-weight:600;letter-spacing:-.02em;margin:4px 0 0}
.facts{margin-top:16px;display:flex;flex-wrap:wrap;gap:6px 26px;font-size:12px;color:${C.mute}}
.facts b{color:${C.ink};font-family:${MONO};font-weight:400}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:3px;font-family:${MONO};font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.chip i{width:5px;height:5px;border-radius:50%;display:inline-block}
.rail{height:4px;border-radius:2px;background:${C.ruleSoft};overflow:hidden}
.rail span{display:block;height:100%;transition:width .5s ease}
.railmeta{margin-top:7px;display:flex;justify-content:space-between;font-family:${MONO};font-size:11px;color:${C.mute}}
.sec{padding:20px 26px}
.sech{display:flex;align-items:baseline;justify-content:space-between;font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${C.slate}}
.gate{display:grid;grid-template-columns:26px 1fr auto;gap:12px;padding:13px 0;border-top:1px solid ${C.ruleSoft};transition:opacity .25s ease,transform .25s ease}
.gn{font-family:${MONO};font-size:11px;color:${C.mute};padding-top:2px}
.gname{font-size:13.5px;font-weight:600}
.gbasis{margin-top:3px;font-size:12.5px;color:${C.slate};line-height:1.55}
.gcite{margin-top:5px;font-family:${MONO};font-size:10.5px;color:${C.mute}}
.mark{align-self:start;padding:3px 7px;border-radius:3px;font-family:${MONO};font-size:10.5px;font-weight:600;letter-spacing:.07em}
.rec{margin:0 26px 26px;border:1px solid ${C.rule};border-radius:8px;overflow:hidden;transition:opacity .3s ease}
.rechead{padding:18px 20px}
.recverb{margin-top:5px;font-size:19px;font-weight:600;letter-spacing:-.02em}
.recbody{font-size:13px;color:${C.graphite};line-height:1.6;margin-top:12px}
.acts{display:flex;flex-wrap:wrap;gap:8px;padding:14px 20px;background:${C.card};border-top:1px solid ${C.rule}}
.act{padding:8px 13px;border-radius:4px;font-size:12.5px;font-weight:500;background:${C.paper};color:${C.graphite};border:1px solid ${C.rule}}
.act.pri{background:${C.ink};color:#fff;border-color:${C.ink}}
.note{padding:20px 26px;border-top:1px solid ${C.rule};font-size:11.5px;color:${C.slate};line-height:1.7}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
      `}</style>

      <header className="bar">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span className="brand">Verdict</span>
          <span className="tag">assessor console</span>
        </div>
        <span className="tag">{stats.breached} breached · {stats.atRisk} at risk · {CLAIMS.length} open</span>
      </header>

      <div className="strip">
        <div className="met">
          <div className="metv">{stats.autoRate}%</div>
          <div className="metl">Decided without a human</div>
        </div>
        <div className="met">
          <div className="metv" style={{ color: C.ok }}>91%</div>
          <div className="metl">AFCA agreement rate</div>
        </div>
        <div className="met">
          <div className="metv" style={{ color: C.ok }}>0.7%</div>
          <div className="metl">False confidence</div>
        </div>
        <div className="met">
          <div className="metv" style={{ color: stats.breached ? C.bad : C.ok }}>{stats.breached}</div>
          <div className="metl">Code windows breached</div>
        </div>
      </div>

      <div className="body">
        <aside className="queue">
          <div className="qhead">
            {[["all", "All"], ["auto", "Auto-decided"], ["human", "Needs a human"]].map(([k, l]) => (
              <button key={k} className="ftab" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          {queue.map((c) => (
            <button key={c.id} className="qrow" aria-current={selected === c.id} onClick={() => setSelected(c.id)}>
              <div className="qtop">
                <span className="qid">{c.id}</span>
                <Chip outcome={c.outcome} />
              </div>
              <div className="qname">{c.insured}</div>
              <div className="qmeta">
                <span>{c.dateOfLoss}</span>
                <span>{c.quote ? money(c.quote) : "not quantified"}</span>
              </div>
              <div style={{ marginTop: 9 }}><ClockRail clock={c.clock} compact /></div>
            </button>
          ))}
        </aside>

        <main className="main">
          <div className="chead">
            <span className="qid">{claim.id} · {claim.product}</span>
            <h1 className="ctitle">{claim.insured}</h1>
            <div className="facts">
              <span>Loss <b>{claim.dateOfLoss}</b></span>
              <span>Notified <b>{claim.notified}</b></span>
              <span>Peril <b>{claim.peril}</b></span>
              <span>Excess <b>{money(claim.excess)}</b></span>
              {claim.quote && <span>Quote <b>{money(claim.quote)}</b></span>}
            </div>
            <div style={{ marginTop: 18 }}><ClockRail clock={claim.clock} /></div>
          </div>

          <div className="sec">
            <div className="sech">
              <span>Validation trace</span>
              <span style={{ fontFamily: MONO, letterSpacing: 0, textTransform: "none", color: C.mute }}>
                {shown}/{claim.gates.length} gates
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              {claim.gates.map((g, i) => <GateRow key={g.n} g={g} visible={i < shown} />)}
            </div>
          </div>

          <div className="rec" style={{ opacity: done ? 1 : 0.3 }}>
            <div className="rechead" style={{ background: o.bg }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div className="metl">Reasons record</div>
                  <div className="recverb" style={{ color: o.fg }}>{o.verb}</div>
                </div>
                <Chip outcome={claim.outcome} />
              </div>
              <div className="recbody">
                {claim.outcome === "accept" && `All ${claim.gates.length} gates cleared. Payable ${money(payable)} after ${money(claim.excess)} excess.`}
                {claim.outcome === "request_evidence" && `Cannot decide yet. Missing: ${claim.missing.join(", ")}.`}
                {claim.outcome === "decline" && claim.gates.filter((g) => !g.passed).map((g) => g.basis).join(" ")}
                {claim.outcome === "escalate" && claim.escalation.join(" ")}
              </div>
              <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11, color: C.slate }}>
                clauses relied on: {claim.gates.filter((g) => g.citation).map((g) => g.citation.split(" · ").pop()).join(", ")}
              </div>
            </div>
            <div className="acts">
              <button className="act pri">Authorise</button>
              <button className="act">Edit and authorise</button>
              <button className="act">Draft the letter</button>
              <button className="act">Reassign</button>
            </div>
          </div>

          <div className="note">
            Every figure above is produced by <code style={{ fontFamily: MONO }}>engine.decide()</code>, a pure
            function with no model call. The agents that fed it returned clause identifiers, damaged parts and
            weighted discrepancies. None of them returned a verdict. There is no confidence percentage on this
            page by design: the trace is the confidence.
          </div>
        </main>
      </div>
    </div>
  );
}
