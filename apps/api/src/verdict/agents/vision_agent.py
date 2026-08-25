"""Vision agent for VERDICT. Analyzes images, returns damage evidence."""

import anthropic
import base64
from pathlib import Path
from dataclasses import dataclass


@dataclass
class DamageAssessment:
    """Evidence from vision analysis."""
    damaged_parts: list[str]
    severity_band: str
    visibility_quality: str
    notes: str


def assess_damage_from_image(image_path: str | None = None, image_base64: str | None = None) -> DamageAssessment:
    """Analyze a claim image for damage."""
    
    if not image_path and not image_base64:
        raise ValueError("Either image_path or image_base64 must be provided")
    
    if image_path:
        image_data = _load_image_as_base64(image_path)
    else:
        image_data = image_base64
    
    client = anthropic.Anthropic()
    
    message = client.messages.create(
        model="claude-opus-4-1",
        max_tokens=500,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": image_data},
                    },
                    {
                        "type": "text",
                        "text": """Analyze this damage image. Return ONLY JSON:
{"damaged_parts": ["list"], "severity_band": "minor|moderate|severe|undeterminable", "visibility_quality": "clear|partial|poor", "notes": "Brief observations."}""",
                    }
                ],
            }
        ],
    )
    
    import json
    import re
    
    response_text = message.content[0].text
    json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
    
    if not json_match:
        return DamageAssessment([], "undeterminable", "poor", "Parse error")
    
    try:
        data = json.loads(json_match.group())
        return DamageAssessment(
            damaged_parts=data.get("damaged_parts", []),
            severity_band=data.get("severity_band", "undeterminable"),
            visibility_quality=data.get("visibility_quality", "poor"),
            notes=data.get("notes", "")
        )
    except:
        return DamageAssessment([], "undeterminable", "poor", "Parse error")


def _load_image_as_base64(image_path: str) -> str:
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")
