"""Wire format for the decision API.

Kept separate from `verdict.schemas` on purpose. Those are the engine's internal
dataclasses and they change when the engine changes. These are a published
contract, and breaking one is a versioning event.

The translation between them lives in `mapping.py`, which is the only place
that knows about both.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ClauseIn(BaseModel):
    """A clause the policy agent retrieved. Never a verdict."""

    clause_id: str = Field(..., examples=["7.2"])
    heading: str = Field(default="", examples=["Collision damage"])
    kind: Literal["insuring", "exclusion", "condition", "excess"]
    text: str = ""


class DamageIn(BaseModel):
    part: str = Field(..., examples=["rear bumper"])
    severity: Literal["light", "moderate", "heavy", "undeterminable"]
    confidence: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Detection confidence only. Never decision confidence.",
    )
    source_image: str = ""


class IntegrityFlagIn(BaseModel):
    code: str = Field(..., examples=["PHOTO_PREDATES_LOSS"])
    detail: str = ""
    weight: int = Field(..., ge=1, le=3, description="1 minor, 2 material, 3 serious")


class PolicyIn(BaseModel):
    policy_number: str
    product: str = Field(..., examples=["Comprehensive Motor"])
    pds_version: str = Field(
        ...,
        description="The wording in force at the date of loss, not the current one",
    )
    effective_from: date
    effective_to: date
    inception: date
    excess: float = Field(..., ge=0)

    @model_validator(mode="after")
    def cover_period_ordered(self) -> PolicyIn:
        if self.effective_to < self.effective_from:
            raise ValueError("effective_to precedes effective_from")
        return self


class MotorClaimIn(BaseModel):
    """Everything the engine needs to decide a motor or home claim.

    Every field here is evidence. Nothing in this model expresses an opinion
    about the outcome, which is the contract described in ADR-0002.
    """

    claim_id: str
    policy: PolicyIn
    date_of_loss: date
    date_notified: date
    peril: str = Field(..., examples=["motor_collision"])
    narrative: str = ""

    clauses: list[ClauseIn] = []
    damage: list[DamageIn] = []
    integrity: list[IntegrityFlagIn] = []
    evidence_present: list[str] = Field(
        default_factory=list,
        examples=[["claim_form", "damage_photos"]],
    )
    vulnerability_signals: list[str] = []

    quote_total: float | None = Field(None, ge=0)
    estimate_low: float | None = Field(None, ge=0)
    estimate_high: float | None = Field(None, ge=0)
    all_info_received_on: date | None = None

    @model_validator(mode="after")
    def dates_ordered(self) -> MotorClaimIn:
        if self.date_notified < self.date_of_loss:
            raise ValueError("date_notified precedes date_of_loss")
        return self


class MembershipIn(BaseModel):
    member_number: str
    fund: str
    tier: Literal["basic", "bronze", "silver", "gold"]
    joined: date
    product_started: date
    hospital_excess: float = Field(0.0, ge=0)
    extras_limits: dict[str, float] = {}
    extras_used: dict[str, float] = {}
    suspended_from: date | None = None
    suspended_to: date | None = None


class HealthServiceIn(BaseModel):
    service_type: Literal["hospital", "extras"]
    clinical_category: str = Field(..., examples=["joint_replacements"])
    mbs_items: list[str] = []
    provider_id: str = ""
    provider_has_agreement: bool = True
    charged: float = Field(0.0, ge=0)
    medicare_benefit: float = Field(0.0, ge=0)
    fund_benefit_scheduled: float = Field(0.0, ge=0)
    symptoms_first_noted: date | None = None
    practitioner_assessed_pec: bool | None = Field(
        None,
        description=(
            "Only a medical practitioner appointed by the insurer may set this. "
            "Leaving it null means the engine escalates rather than decides."
        ),
    )


class HealthClaimIn(BaseModel):
    claim_id: str
    membership: MembershipIn
    service: HealthServiceIn
    date_of_service: date
    date_notified: date
    vulnerability_signals: list[str] = []


# --------------------------------------------------------------------- out


class GateOut(BaseModel):
    n: int
    name: str
    passed: bool
    basis: str
    citation: str | None = None


class DecisionOut(BaseModel):
    """The reasons record, as published.

    Deliberately contains no aggregate confidence score. The gates and the
    clauses relied on are the audit trail; a percentage would not be
    calibrated against anything. See ADR-0004.
    """

    claim_id: str
    outcome: Literal["accept", "partial", "decline", "request_evidence", "escalate"]
    summary: str
    gates: list[GateOut]
    payable: float | None
    excess_applied: float | None
    missing_evidence: list[str]
    escalation_reasons: list[str]
    clauses_relied_on: list[str]
    clock: dict[str, str | int | float | bool]
    engine_version: str


class ErrorOut(BaseModel):
    detail: str
