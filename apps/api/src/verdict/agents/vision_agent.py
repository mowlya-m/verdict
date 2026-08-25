"""Vision agent.

Reads a damage photo and returns what is visible in it: parts, a severity
band, and how clear the image actually was. Evidence only, same rule as every
other agent in this package — it never returns a verdict, a repair estimate,
or an opinion about whether the damage is consistent with the claim.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import anthropic
from anthropic.types import ImageBlockParam

MODEL = "claude-sonnet-4-6"
_SEVERITY_BANDS = {"minor", "moderate", "severe", "undeterminable"}


@dataclass
class DamageAssessment:
    """Evidence read from one image. Never a decision."""

    damaged_parts: list[str]
    severity_band: str
    visibility_quality: str
    notes: str


class VisionError(RuntimeError):
    """The agent could not produce a usable assessment."""


def _load_image_as_base64(image_path: str) -> str:
    path = Path(image_path)
    if not path.exists():
        raise VisionError(f"Image not found: {image_path}")
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8")


def assess_damage_from_image(
    image_path: str | None = None,
    image_base64: str | None = None,
) -> DamageAssessment:
    """Read one claim photo and report what is visible.

    Raises VisionError if neither input is given, the file is missing, the
    model is unreachable, or the response cannot be parsed. It never returns
    a guess dressed up as a finding.
    """
    if not image_path and not image_base64:
        raise VisionError("Either image_path or image_base64 must be provided")

    image_data = _load_image_as_base64(image_path) if image_path else image_base64

    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model=MODEL,
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        cast(
                            ImageBlockParam,
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_data,
                                },
                            },
                        ),
                        {"type": "text", "text": _PROMPT},
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        raise VisionError(f"Vision service unavailable: {exc}") from exc

    block = message.content[0]
    if block.type != "text":
        raise VisionError(f"Vision service returned a {block.type} block, not text.")
    response_text = block.text
    match = re.search(r"\{.*\}", response_text, re.DOTALL)
    if not match:
        raise VisionError("Vision response contained no JSON.")

    try:
        data = json.loads(match.group())
    except json.JSONDecodeError as exc:
        raise VisionError("Vision response was not valid JSON.") from exc

    return DamageAssessment(
        damaged_parts=list(data.get("damaged_parts", [])),
        severity_band=(
            data["severity_band"]
            if data.get("severity_band") in _SEVERITY_BANDS
            else "undeterminable"
        ),
        visibility_quality=data.get("visibility_quality", "poor"),
        notes=data.get("notes", ""),
    )


_PROMPT = (
    "Analyze this damage image. Return ONLY JSON:\n"
    '{"damaged_parts": ["list"], '
    '"severity_band": "minor|moderate|severe|undeterminable", '
    '"visibility_quality": "clear|partial|poor", '
    '"notes": "Brief observations."}'
)
