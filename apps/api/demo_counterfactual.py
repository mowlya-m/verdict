from datetime import date
from verdict.counterfactual import explore
from verdict.schemas import *

T = date(2026, 8, 17)
P = Policy("MTR-88213","Comprehensive Motor","2025.11",date(2026,1,1),date(2026,12,31),date(2024,1,1),750.0)

def show(title, c):
    cf = explore(c, T)
    print(f"\n{'─'*74}\n{title}\n  now: {cf.current.value.upper()}   settled: {cf.is_settled}")
    print(f"  {cf.summary()}\n")
    for x in cf.levers:
        money = f"  +${x.payable_delta:,.0f}" if x.payable_delta else ""
        tag = "DECISIVE" if x.decisive else ("progress" if x.progresses else "immovable")
        print(f"    [{tag:9}] {x.action}{money}")
        print(f"                 {x.because}")

base = dict(claim_id="A1", policy=P, date_of_loss=date(2026,8,4), date_notified=date(2026,8,5),
    peril="motor_collision", narrative="Rear-ended.",
    clauses=[PolicyClause("7.2","Collision damage","","insuring")],
    damage=[DamageFinding("rear bumper",Severity.MODERATE,.9,"a.jpg")],
    quote_total=2530.0, estimate_high=2900.0)

show("One document short", Claim(**{**base, "evidence":[EvidenceItem(k,True) for k in ("claim_form","damage_photos","repair_quote")]}))
show("Theft, three documents short", Claim(**{**base, "peril":"motor_theft",
    "clauses":[PolicyClause("8.1","Theft","","insuring")],
    "evidence":[EvidenceItem("claim_form",True)]}))
show("Exclusion applies", Claim(**{**base,
    "evidence":[EvidenceItem(k,True) for k in ("claim_form","damage_photos","repair_quote","licence")],
    "clauses":[PolicyClause("7.2","Collision damage","","insuring"),
               PolicyClause("9.4","Driver not licensed to drive the vehicle","","exclusion")]}))
show("Photo predates the loss", Claim(**{**base,
    "evidence":[EvidenceItem(k,True) for k in ("claim_form","damage_photos","repair_quote","licence")],
    "integrity":[IntegrityFlag("PHOTO_PREDATES_LOSS","p1.jpg was captured on 12 Jul, before the stated loss date.",3)]}))
print()
