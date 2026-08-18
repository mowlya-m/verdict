"""Fetch published AFCA determinations into a local cache.

READ THIS BEFORE RUNNING IT
---------------------------
AFCA permits reproduction of published de-identified determinations provided the
reproduction is COMPLETELY UNALTERED, AFCA is acknowledged as maker and author,
and an active link to the hosting page is included. Analysis must be clearly
attributed to its own author, not to AFCA.

Consequences for this repository, and they are not optional:

  * The cache is local only. `eval/cache/` and `eval/fixtures/*.json` are
    gitignored. Do not commit determination text.
  * What ships is derived structured fields and metrics, plus commentary that is
    yours. That is analysis, not reproduction.
  * Every case carries `source_url` and the report links back to it.
  * Check https://www.afca.org.au/ terms yourself before any non-personal use.
    This module encodes an interpretation, not legal advice.

ON THE SEARCH PORTAL
--------------------
The decision library at https://my.afca.org.au/searchpublisheddecisions/ is a
Salesforce Experience Cloud site, so a plain requests.get against the listing
page returns a shell with no results. Two workable routes:

  1. Open the portal in a browser, watch the XHR the result grid fires, and point
     `LISTING_ENDPOINT` at it. Fastest, and what you should try first.
  2. Drive it with Playwright. Slower, more robust to their markup changes.

Determinations themselves are PDFs at stable URLs, so once you have the list,
the download half is simple. That is the half implemented here.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import httpx

PORTAL = "https://my.afca.org.au/searchpublisheddecisions/"
LISTING_ENDPOINT = ""  # fill in after inspecting the portal's network calls

CACHE = Path("eval/cache")
DELAY_SECONDS = 2.0  # be a good citizen; do not lower this
USER_AGENT = "verdict-eval/0.1 (research; contact: you@example.com)"


def fetch_pdf(client: httpx.Client, url: str, dest: Path) -> Path | None:
    """Download one determination PDF. Skips anything already cached."""
    if dest.exists():
        return dest
    try:
        r = client.get(url, timeout=30, follow_redirects=True)
        r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  skip {url}: {e}")
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    time.sleep(DELAY_SECONDS)
    return dest


def pdf_to_text(path: Path) -> str:
    """Extract text. pdfplumber handles AFCA's layout better than pypdf here."""
    try:
        import pdfplumber
    except ImportError:
        raise SystemExit("pip install pdfplumber")
    with pdfplumber.open(path) as pdf:
        return "\n".join((page.extract_text() or "") for page in pdf.pages)


def main() -> None:
    p = argparse.ArgumentParser(description="Cache AFCA determination PDFs locally")
    p.add_argument("--manifest", type=Path, required=True,
                   help="JSON list of {case_id, url}. Build this from the portal.")
    p.add_argument("--out", type=Path, default=CACHE)
    a = p.parse_args()

    manifest = json.loads(a.manifest.read_text())
    print(f"{len(manifest)} determinations, {DELAY_SECONDS}s apart\n")

    with httpx.Client(headers={"User-Agent": USER_AGENT}) as client:
        got = 0
        for row in manifest:
            dest = a.out / f"{row['case_id']}.pdf"
            if fetch_pdf(client, row["url"], dest):
                got += 1
                print(f"  {row['case_id']}")
    print(f"\ncached {got} of {len(manifest)} into {a.out}")
    print("next: extract with eval.adapt.EXTRACTION_PROMPT, save via eval.schema.save")


if __name__ == "__main__":
    main()
