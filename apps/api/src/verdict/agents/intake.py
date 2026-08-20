"""Intake agent.

Turns what a person actually typed into the structured facts the engine needs.

This is the first place in the system where a language model does real work, so
the boundary matters more here than anywhere else. Read ADR-0002 before changing
this file. In short:

  * The agent may extract FACTS. Dates, places, parts, who was involved.
  * The agent may report what it could NOT determine.
  * The agent may NOT decide coverage, apply a clause, or suggest an outcome.

Enforced three ways: the response schema has no field capable of expressing an
outcome, `_reject_verdicts` raises if a verdict-shaped key appears anyway, and
`test_intake_cannot_return_a_verdict` fails the build if either slips.

Everything the model returns is provisional. A claimant describing a car park
bump as "a bit of a scrape" has not established that the damage is light, and
the engine treats extracted damage as a lead rather than a finding.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import httpx

MODEL = "claude-sonnet-4-6"
API_URL = "https://api.anthropic.com/v1/messages"
TIMEOUT_SECONDS = 25

#: Keys that would mean the model had crossed from evidence into judgement.
FORBIDDEN_KEYS = {
    "outcome",
    "decision",
    "covered",
    "coverage",
    "approve",
    "approved",
    "decline",
    "declined",
    "payable",
    "settle",
    "liable",
    "liability",
    "confidence",
    "recommendation",
    "verdict",
    "fraud",
    "fraudulent",
}

PERILS = {
    "motor_collision",
    "motor_theft",
    "motor_weather",
    "home_weather",
    "home_theft",
    "home_accidental",
    "health_hospital",
    "health_extras",
    "travel_cancellation",
    "travel_medical",
    "travel_baggage",
    "other",
}

SYSTEM = """You read what a person has written about something that happened to \
them and pull out the facts. You are the intake step of a claims system.

You do not decide anything. You never say whether something is covered, whether \
a claim should be paid, or whether anyone is at fault. Another part of the \
system does that, using rules, and it needs clean facts from you.

Rules you follow without exception:

1. Extract only what the person actually wrote or what follows necessarily from \
it. If they did not say where it happened, the location is null. Do not fill \
gaps with what is likely.
2. Relative dates resolve against the supplied reference date. "Last Tuesday" \
becomes a real date. If you cannot resolve one, leave it null and say so.
3. `missing` lists what a person would still need to ask. This is the most \
useful thing you produce, so be specific: "the other driver's registration", \
not "more details".
4. `quotes` maps each extracted fact to the words it came from, so a human can \
check you. Use the person's exact words, short.
5. If the writing suggests hardship, bereavement, family violence, or distress, \
put a plain description in `vulnerability_signals`. Do not diagnose and do not \
speculate. Only what they said.
6. Never output a field that expresses an outcome, a probability, or a \
recommendation. If you feel the urge to add one, that is the signal you have \
misunderstood your job.

Return one JSON object and nothing else. No prose, no markdown fences."""

SCHEMA_HINT = """{
  "peril": "motor_collision|motor_theft|motor_weather|home_weather|home_theft|"
           "home_accidental|health_hospital|health_extras|travel_cancellation|"
           "travel_medical|travel_baggage|other",
  "date_of_loss": "YYYY-MM-DD or null",
  "time_of_day": "free text or null",
  "location": "free text or null",
  "summary": "one neutral sentence in your own words",
  "parties": ["who was involved, as described"],
  "damage": [{"part": "string", "severity": "light|moderate|heavy|undeterminable",
              "quote": "their words"}],
  "injuries_reported": true/false/null,
  "police_involved": true/false/null,
  "third_party_details_exchanged": true/false/null,
  "vulnerability_signals": ["plain description of anything they said"],
  "missing": ["specific things a person would still need to ask"],
  "quotes": {"field_name": "the words this came from"},
  "unresolved": ["anything you could not work out, and why"]
}"""


@dataclass
class Extraction:
    """What the agent found. Evidence only, by construction."""

    peril: str = "other"
    date_of_loss: date | None = None
    time_of_day: str | None = None
    location: str | None = None
    summary: str = ""
    parties: list[str] = field(default_factory=list)
    damage: list[dict[str, str]] = field(default_factory=list)
    injuries_reported: bool | None = None
    police_involved: bool | None = None
    third_party_details_exchanged: bool | None = None
    vulnerability_signals: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    quotes: dict[str, str] = field(default_factory=dict)
    unresolved: list[str] = field(default_factory=list)

    @property
    def ready_to_decide(self) -> bool:
        """Enough on file to attempt a decision.

        Not a judgement about the claim. A judgement about the paperwork.
        """
        return bool(self.date_of_loss) and self.peril != "other" and not self.missing


class IntakeError(RuntimeError):
    """The agent could not produce usable facts."""


def _reject_verdicts(payload: dict[str, Any]) -> None:
    """Raise if the model returned anything that expresses an outcome.

    A belt-and-braces check. The schema gives it nowhere to put a verdict, but a
    model that invents a `covered: true` key would otherwise have that field
    silently ignored, and silence is the wrong response to a boundary breach.
    """
    found = {k for k in payload if k.lower() in FORBIDDEN_KEYS}
    nested = {
        k
        for k in payload.get("quotes", {})
        if isinstance(payload.get("quotes"), dict) and k.lower() in FORBIDDEN_KEYS
    }
    if found or nested:
        raise IntakeError(
            "Intake returned decision-shaped fields, which it must never do: "
            + ", ".join(sorted(found | nested))
        )


def _parse_date(value: object, reference: date) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        return None
    # A loss cannot be in the future, and a claim about something twenty years
    # ago is a data error rather than a claim. Either way, prefer null to a
    # value the engine would silently act on.
    if parsed > reference or parsed < reference - timedelta(days=365 * 10):
        return None
    return parsed


def _coerce(payload: dict[str, Any], reference: date) -> Extraction:
    peril = str(payload.get("peril") or "other")
    if peril not in PERILS:
        peril = "other"

    damage = []
    for d in payload.get("damage") or []:
        if not isinstance(d, dict) or not d.get("part"):
            continue
        sev = str(d.get("severity") or "undeterminable")
        damage.append(
            {
                "part": str(d["part"]),
                "severity": (
                    sev
                    if sev in {"light", "moderate", "heavy", "undeterminable"}
                    else "undeterminable"
                ),
                "quote": str(d.get("quote") or ""),
            }
        )

    def strs(key: str) -> list[str]:
        return [str(x) for x in (payload.get(key) or []) if str(x).strip()]

    def tri(key: str) -> bool | None:
        v = payload.get(key)
        return v if isinstance(v, bool) else None

    return Extraction(
        peril=peril,
        date_of_loss=_parse_date(payload.get("date_of_loss"), reference),
        time_of_day=(payload.get("time_of_day") or None),
        location=(payload.get("location") or None),
        summary=str(payload.get("summary") or ""),
        parties=strs("parties"),
        damage=damage,
        injuries_reported=tri("injuries_reported"),
        police_involved=tri("police_involved"),
        third_party_details_exchanged=tri("third_party_details_exchanged"),
        vulnerability_signals=strs("vulnerability_signals"),
        missing=strs("missing"),
        quotes={str(k): str(v) for k, v in (payload.get("quotes") or {}).items()},
        unresolved=strs("unresolved"),
    )


def _strip_fences(text: str) -> str:
    """Models fence JSON despite being asked not to. Cheaper to handle it."""
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def extract(
    narrative: str,
    *,
    reference_date: date | None = None,
    api_key: str | None = None,
    client: httpx.Client | None = None,
) -> Extraction:
    """Pull structured facts out of a claimant's own words.

    Raises IntakeError on an empty narrative, a missing key, an unreachable API,
    unparseable output, or a boundary breach. It never returns a partial guess,
    because a half-extracted claim that looks complete is worse than a failure a
    person can see.
    """
    if not narrative or not narrative.strip():
        raise IntakeError("Nothing to read. The narrative is empty.")

    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise IntakeError("ANTHROPIC_API_KEY is not set.")

    reference = reference_date or date.today()
    prompt = (
        f"Today's date is {reference.isoformat()}. Resolve any relative dates "
        f"against it.\n\nReturn exactly this shape:\n{SCHEMA_HINT}\n\n"
        f"What the person wrote:\n---\n{narrative.strip()}\n---"
    )

    owns_client = client is None
    client = client or httpx.Client(timeout=TIMEOUT_SECONDS)
    try:
        res = client.post(
            API_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 1500,
                "system": SYSTEM,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    except httpx.HTTPError as exc:
        raise IntakeError(f"Could not reach the extraction service: {exc}") from exc
    finally:
        if owns_client:
            client.close()

    if res.status_code != 200:
        raise IntakeError(f"Extraction service returned {res.status_code}.")

    body = res.json()
    text = "".join(
        block.get("text", "") for block in body.get("content", []) if block.get("type") == "text"
    )

    try:
        payload = json.loads(_strip_fences(text))
    except json.JSONDecodeError as exc:
        raise IntakeError("Extraction did not return usable JSON.") from exc

    if not isinstance(payload, dict):
        raise IntakeError("Extraction returned something other than an object.")

    _reject_verdicts(payload)
    return _coerce(payload, reference)
