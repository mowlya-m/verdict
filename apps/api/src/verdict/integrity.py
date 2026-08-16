"""Integrity checks.

Deliberately NOT called fraud. The system surfaces discrepancies. A human
alleges fraud. An agent that labels a legitimate claimant fraudulent is a
defamation and unfair-treatment problem no compliance officer will sign off.

Every check here works on a SINGLE claim with no customer history, because
you do not have a claims portfolio. That constraint is what makes these
buildable today rather than aspirational.
"""

from __future__ import annotations

from datetime import date, timedelta

from .schemas import Claim, IntegrityFlag

INCEPTION_PROXIMITY_DAYS = 30
NOTIFICATION_LAG_DAYS = 60
QUOTE_VARIANCE_TOLERANCE = 0.40


def check_incident_before_inception(claim: Claim) -> IntegrityFlag | None:
    if claim.date_of_loss < claim.policy.inception:
        return IntegrityFlag(
            code="LOSS_BEFORE_INCEPTION",
            detail=f"Loss dated {claim.date_of_loss} precedes policy inception {claim.policy.inception}.",
            weight=3,
        )
    return None


def check_inception_proximity(claim: Claim) -> IntegrityFlag | None:
    gap = (claim.date_of_loss - claim.policy.inception).days
    if 0 <= gap <= INCEPTION_PROXIMITY_DAYS:
        return IntegrityFlag(
            code="EARLY_CLAIM",
            detail=f"Loss occurred {gap} days after inception. Not itself suspicious, but verify.",
            weight=1,
        )
    return None


def check_notification_lag(claim: Claim) -> IntegrityFlag | None:
    lag = (claim.date_notified - claim.date_of_loss).days
    if lag > NOTIFICATION_LAG_DAYS:
        return IntegrityFlag(
            code="LATE_NOTIFICATION",
            detail=f"Notified {lag} days after the loss.",
            weight=2,
        )
    if lag < 0:
        return IntegrityFlag(
            code="NOTIFIED_BEFORE_LOSS",
            detail="Notification date precedes the date of loss.",
            weight=3,
        )
    return None


def check_exif_dates(claim: Claim, exif_dates: dict[str, date]) -> list[IntegrityFlag]:
    """Photo capture timestamps versus the stated incident date."""
    flags = []
    for image, captured in exif_dates.items():
        if captured < claim.date_of_loss:
            flags.append(
                IntegrityFlag(
                    code="PHOTO_PREDATES_LOSS",
                    detail=f"{image} captured {captured}, before the stated loss date.",
                    weight=3,
                )
            )
        elif (captured - claim.date_of_loss).days > 90:
            flags.append(
                IntegrityFlag(
                    code="PHOTO_LONG_AFTER_LOSS",
                    detail=f"{image} captured {(captured - claim.date_of_loss).days} days after the loss.",
                    weight=1,
                )
            )
    return flags


def check_duplicate_images(image_hashes: dict[str, str]) -> list[IntegrityFlag]:
    """Perceptual hash collisions. Same image submitted twice under
    different names, or reused across claims."""
    seen: dict[str, str] = {}
    flags = []
    for name, h in image_hashes.items():
        if h in seen:
            flags.append(
                IntegrityFlag(
                    code="DUPLICATE_IMAGE",
                    detail=f"{name} is perceptually identical to {seen[h]}.",
                    weight=2,
                )
            )
        else:
            seen[h] = name
    return flags


def check_quote_against_damage(claim: Claim) -> IntegrityFlag | None:
    """Repair quote materially outside the estimated band."""
    if claim.quote_total is None or claim.estimate_high is None:
        return None
    if claim.estimate_high <= 0:
        return None
    over = (claim.quote_total - claim.estimate_high) / claim.estimate_high
    if over > QUOTE_VARIANCE_TOLERANCE:
        return IntegrityFlag(
            code="QUOTE_ABOVE_BAND",
            detail=f"Quote {claim.quote_total:,.0f} is {over:.0%} above the top of the estimated band.",
            weight=2,
        )
    return None


def check_undamaged_parts_quoted(claim: Claim, quoted_parts: list[str]) -> list[IntegrityFlag]:
    """Quote line items for parts the vision agent found no damage on."""
    damaged = {d.part.lower() for d in claim.damage if d.severity is not None}
    flags = []
    for part in quoted_parts:
        if part.lower() not in damaged:
            flags.append(
                IntegrityFlag(
                    code="QUOTED_PART_NOT_DAMAGED",
                    detail=f"Quote includes {part}, which does not appear in the damage findings.",
                    weight=2,
                )
            )
    return flags


def run_all(
    claim: Claim,
    exif_dates: dict[str, date] | None = None,
    image_hashes: dict[str, str] | None = None,
    quoted_parts: list[str] | None = None,
) -> list[IntegrityFlag]:
    flags: list[IntegrityFlag] = []
    for fn in (
        check_incident_before_inception,
        check_inception_proximity,
        check_notification_lag,
        check_quote_against_damage,
    ):
        f = fn(claim)
        if f:
            flags.append(f)
    if exif_dates:
        flags.extend(check_exif_dates(claim, exif_dates))
    if image_hashes:
        flags.extend(check_duplicate_images(image_hashes))
    if quoted_parts:
        flags.extend(check_undamaged_parts_quoted(claim, quoted_parts))
    return flags


def integrity_score(flags: list[IntegrityFlag]) -> int:
    """Sum of weights. Not a probability, not a percentage, deliberately."""
    return sum(f.weight for f in flags)
