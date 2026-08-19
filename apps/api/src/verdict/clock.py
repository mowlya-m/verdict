"""The Code clock.

Runs on every file from notification, independent of which agent is active.
This is the feature the market data says almost nobody has: more than half of
Australian insurers who breached claims-handling timeframes could not say by
how many days.

Timeframes encoded here reflect the current General Insurance Code of Practice
and ASIC RG 271. VERIFY THESE AGAINST THE CODE TEXT BEFORE YOU SHIP. The
redrafted Code (lodged with ASIC H2 2026) changes the consequences, not
primarily the durations, but check.
"""

from __future__ import annotations

from datetime import date, timedelta

#: Position of one file against every applicable Code deadline. Values are
#: mixed by nature: ISO dates, day counts, ratios and booleans.
ClockStatus = dict[str, str | int | float | bool]

DECISION_DAYS = 120  # 4 months from notification
DECISION_DAYS_EXTENDED = 365  # 12 months in defined circumstances
DECISION_DAYS_ALL_INFO = 10  # business days once enquiries complete
IDR_RESPONSE_DAYS = 30  # calendar days, RG 271
UPDATE_INTERVAL_DAYS = 20  # progress update cadence

AMBER_THRESHOLD = 0.75  # fraction of the window consumed before we warn


def business_days_between(start: date, end: date) -> int:
    days = 0
    cur = start
    while cur < end:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            days += 1
    return days


def add_business_days(start: date, n: int) -> date:
    cur = start
    added = 0
    while added < n:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            added += 1
    return cur


def clock_status(
    date_notified: date,
    today: date,
    all_info_received_on: date | None = None,
    extended: bool = False,
) -> ClockStatus:
    """Return the live position against every applicable deadline."""
    window = DECISION_DAYS_EXTENDED if extended else DECISION_DAYS
    decision_due = date_notified + timedelta(days=window)
    elapsed = (today - date_notified).days
    consumed = elapsed / window if window else 1.0

    status: ClockStatus = {
        "date_notified": date_notified.isoformat(),
        "decision_due": decision_due.isoformat(),
        "days_remaining": (decision_due - today).days,
        "window_consumed": round(consumed, 3),
        "breached": today > decision_due,
        "at_risk": consumed >= AMBER_THRESHOLD and today <= decision_due,
        "extended_window": extended,
    }

    if all_info_received_on:
        short_due = add_business_days(all_info_received_on, DECISION_DAYS_ALL_INFO)
        status["short_form_due"] = short_due.isoformat()
        status["short_form_days_remaining"] = (
            business_days_between(today, short_due) if today < short_due else 0
        )
        status["short_form_breached"] = today > short_due
        if status["short_form_breached"]:
            status["breached"] = True

    next_update_due = date_notified
    while next_update_due <= today:
        next_update_due += timedelta(days=UPDATE_INTERVAL_DAYS)
    status["next_update_due"] = next_update_due.isoformat()

    if status["breached"]:
        status["band"] = "breached"
    elif status["at_risk"]:
        status["band"] = "at_risk"
    else:
        status["band"] = "ok"

    return status
