"""Run health claims through the engine.

PYTHONPATH=src python3 demo_health.py
"""

from __future__ import annotations

from datetime import date

from verdict.health import HealthService, Membership, Tier
from verdict.health_engine import decide_health

TODAY = date(2026, 8, 18)
G, R, A, D, X = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def show(
    title: str,
    member: Membership,
    service: HealthService,
    dos: date,
    **kw: list[str],
) -> None:
    rec = decide_health(title, member, service, dos, dos, today=TODAY, **kw)
    tone = {"accept": G, "decline": R, "partial": A}.get(rec.outcome.value, A)
    print(f"\n{'─' * 76}")
    print(
        f"{title}  {tone}{rec.outcome.value.upper()}{X}   "
        f"{D}{member.tier.value} · {service.clinical_category}{X}\n"
    )
    for g in rec.gates:
        mark = f"{G}PASS{X}" if g.passed else f"{R}FAIL{X}"
        print(f"  {mark}  {g.n}. {g.name:<38} {D}{g.citation or ''}{X}")
    print(f"\n  {rec.summary()}")


silver = Membership(
    "HM-40218",
    "Southern Health",
    Tier.SILVER,
    joined=date(2023, 1, 10),
    product_started=date(2023, 1, 10),
    hospital_excess=500.0,
    extras_limits={"dental": 1200.0, "optical": 350.0},
    extras_used={"dental": 300.0, "optical": 0.0},
)

show(
    "H-1001 clean cardiac admission",
    silver,
    HealthService(
        "hospital",
        "heart_and_vascular",
        ["38456"],
        "H0912",
        True,
        9800.0,
        2100.0,
        6900.0,
        symptoms_first_noted=date(2025, 11, 2),
    ),
    date(2026, 7, 20),
)

show(
    "H-1002 knee replacement on Silver",
    silver,
    HealthService(
        "hospital",
        "joint_replacements",
        ["49518"],
        "H0912",
        True,
        22400.0,
        3900.0,
        16800.0,
        symptoms_first_noted=date(2025, 8, 1),
    ),
    date(2026, 7, 22),
)

new_member = Membership(
    "HM-77390",
    "Southern Health",
    Tier.GOLD,
    joined=date(2026, 3, 1),
    product_started=date(2026, 3, 1),
    hospital_excess=250.0,
)

show(
    "H-1003 back surgery, symptoms predate joining",
    new_member,
    HealthService(
        "hospital",
        "back_neck_and_spine",
        ["48678"],
        "H2201",
        True,
        14200.0,
        2800.0,
        10600.0,
        symptoms_first_noted=date(2026, 1, 18),
    ),
    date(2026, 7, 30),
)

show(
    "H-1004 optical over the annual limit",
    silver,
    HealthService(
        "extras", "optical", provider_id="O1180", charged=700.0, fund_benefit_scheduled=520.0
    ),
    date(2026, 8, 2),
)

show(
    "H-1005 hospital with no agreement",
    silver,
    HealthService(
        "hospital",
        "digestive_system",
        ["30473"],
        "H8800",
        False,
        6100.0,
        1400.0,
        3900.0,
        symptoms_first_noted=date(2025, 12, 1),
    ),
    date(2026, 8, 5),
)
print()
