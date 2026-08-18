"""Australian private health insurance rules.

Why this fits the engine better than motor does: almost everything here is
legislated or mandated, so it is genuinely deterministic rather than a matter
of judgement.

  * Since 1 April 2019, hospital cover is sorted into Gold, Silver, Bronze and
    Basic tiers, and 38 clinical categories are mapped across them by the
    Commonwealth. A fund cannot invent its own mapping. That means "is this
    procedure covered by this product" is a lookup, not an opinion.
  * Waiting periods are capped by the Private Health Insurance Act: 12 months
    for pre-existing conditions, 12 months for pregnancy and birth, 2 months
    for everything else. A fund may waive them. It may not extend them.
  * A pre-existing condition is one where signs or symptoms existed in the six
    months before joining, and the assessment must be made by a medical
    practitioner appointed by the insurer, not by the fund's staff and
    certainly not by software.

That last point is the whole reason PEC produces ESCALATE and never DECLINE.

BEFORE PRODUCTION: the category maps below are a working subset, not the full
38. Take the authoritative list from health.gov.au and the fund's own SIS
(Standard Information Statement). The structure does not change; the coverage
does.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum


class Tier(str, Enum):
    BASIC = "basic"
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"


#: Minimum clinical categories each tier must cover. Tiers are cumulative:
#: Silver includes everything in Bronze, Gold everything in Silver.
#: Working subset. Replace with the full mandated list before production.
TIER_CATEGORIES: dict[Tier, set[str]] = {
    Tier.BASIC: {
        "rehabilitation",            # restricted at Basic
        "hospital_psychiatric",      # restricted at Basic
        "palliative_care",           # restricted at Basic
    },
    Tier.BRONZE: {
        "brain_and_nervous_system", "kidney_and_bladder", "digestive_system",
        "hernia_and_appendix", "gastrointestinal_endoscopy", "gynaecology",
        "chemotherapy_radiotherapy_immunotherapy", "pain_management",
        "skin", "breast_surgery", "diabetes_management", "tonsils_adenoids_grommets",
        "bone_joint_and_muscle", "ear_nose_and_throat", "eye_not_cataracts",
        "male_reproductive_system", "miscarriage_and_termination",
    },
    Tier.SILVER: {
        "heart_and_vascular", "lung_and_chest", "blood", "back_neck_and_spine",
        "plastic_and_reconstructive_surgery", "dental_surgery",
        "podiatric_surgery", "implantation_of_hearing_devices",
    },
    Tier.GOLD: {
        "cataracts", "joint_replacements", "dialysis_for_chronic_kidney_failure",
        "pregnancy_and_birth", "assisted_reproductive_services",
        "weight_loss_surgery", "insulin_pumps", "pain_management_with_device",
        "sleep_studies",
    },
}

#: Categories a Basic product covers on a RESTRICTED basis only: benefits are
#: limited to the public hospital rate, so a private admission leaves a large
#: out-of-pocket. Covered, but not covered the way the member expects.
RESTRICTED_AT_BASIC = {"rehabilitation", "hospital_psychiatric", "palliative_care"}

#: Legislated maximum waiting periods, in days.
WAIT_PRE_EXISTING = 365
WAIT_PREGNANCY = 365
WAIT_GENERAL = 61          # "two months"
WAIT_PSYCH_EXEMPTION = 61  # one-off psych waiver still serves the general wait

PREGNANCY_CATEGORIES = {"pregnancy_and_birth", "assisted_reproductive_services"}

#: Window in which signs or symptoms make a condition pre-existing.
PEC_LOOKBACK_DAYS = 183


def categories_for(tier: Tier) -> set[str]:
    """Cumulative coverage. Gold includes Silver includes Bronze includes Basic."""
    order = [Tier.BASIC, Tier.BRONZE, Tier.SILVER, Tier.GOLD]
    covered: set[str] = set()
    for t in order:
        covered |= TIER_CATEGORIES[t]
        if t is tier:
            break
    return covered


@dataclass
class Membership:
    """A health membership. The health analogue of Policy."""

    member_number: str
    fund: str
    tier: Tier
    joined: date                 # start of continuous cover
    product_started: date        # start of THIS product, for upgrade waits
    hospital_excess: float = 0.0
    extras_limits: dict[str, float] = field(default_factory=dict)   # annual entitlement
    extras_used: dict[str, float] = field(default_factory=dict)     # claimed to date
    suspended_from: date | None = None
    suspended_to: date | None = None

    def active_on(self, day: date) -> bool:
        if day < self.joined:
            return False
        if self.suspended_from and self.suspended_to:
            return not (self.suspended_from <= day <= self.suspended_to)
        return True

    def days_held(self, day: date) -> int:
        return (day - self.joined).days

    def extras_remaining(self, service: str) -> float:
        return self.extras_limits.get(service, 0.0) - self.extras_used.get(service, 0.0)


@dataclass
class HealthService:
    """One admission or extras service being claimed."""

    service_type: str            # "hospital" | "extras"
    clinical_category: str       # e.g. "joint_replacements"
    mbs_items: list[str] = field(default_factory=list)
    provider_id: str = ""
    provider_has_agreement: bool = True
    charged: float = 0.0
    medicare_benefit: float = 0.0
    fund_benefit_scheduled: float = 0.0

    # clinical history, extracted from the referral or admission notes
    symptoms_first_noted: date | None = None
    practitioner_assessed_pec: bool | None = None   # None = not yet assessed

    @property
    def gap(self) -> float:
        return round(self.charged - self.medicare_benefit - self.fund_benefit_scheduled, 2)


def waiting_period_days(category: str, is_pre_existing: bool | None) -> int:
    if is_pre_existing:
        return WAIT_PRE_EXISTING
    if category in PREGNANCY_CATEGORIES:
        return WAIT_PREGNANCY
    return WAIT_GENERAL


def looks_pre_existing(service: HealthService, joined: date) -> bool | None:
    """Signal only. Never a determination.

    Returns True when symptoms fall inside the six-month lookback before
    joining, False when they clearly do not, and None when we cannot tell.

    True does NOT mean decline. It means a medical practitioner appointed by
    the insurer has to make that call, so the engine escalates.
    """
    if service.practitioner_assessed_pec is not None:
        return service.practitioner_assessed_pec
    if service.symptoms_first_noted is None:
        return None
    delta = (joined - service.symptoms_first_noted).days
    # Must fall INSIDE the window before joining. A negative delta means the
    # symptoms appeared after cover started, which is the opposite of
    # pre-existing. The one-sided version of this check read every later
    # symptom as pre-existing.
    return 0 <= delta <= PEC_LOOKBACK_DAYS
