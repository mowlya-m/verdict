# eval

Scores `engine.decide()` against published AFCA determinations.

This is the only part of the repository that can tell you whether the engine is
any good. Everything else proves it runs.

## Run it

```bash
PYTHONPATH=apps/api/src:. python3 -m eval.run --fixtures eval/fixtures
```

Exits non-zero when a gate fails, which is what the CI job depends on.

## The three numbers

| Metric | Meaning |
| --- | --- |
| **Agreement** | Engine landed where AFCA landed |
| **Escalation precision** | Of files the engine refused to decide, the share AFCA went on to overturn the insurer on |
| **False confidence** | Engine decided outright and AFCA said otherwise |

Lead with **false confidence**. An engine that escalates too often is annoying.
An engine that confidently declines a claim AFCA would have paid is a regulatory
problem. Showing the number that makes you look worst is what makes the other two
believable.

Note that agreement and escalation are in tension on purpose. Escalating a file
AFCA overturned costs you agreement while protecting false confidence. That
trade-off is the product decision, and the thresholds in `run.py` are where you
declare which side you have chosen.

## Mapping

AFCA does not emit accept/decline. It affirms what the insurer did or overturns
it, so agreement is scored against what the insurer *should* have done:

| AFCA outcome | Correct call |
| --- | --- |
| Affirmed the insurer | `decline` |
| Overturned the insurer | `accept` |
| Decision fine, handling was not | `escalate` |

## Licence, and why the corpus is not in this repo

AFCA permits reproduction of published de-identified determinations provided the
reproduction is **completely unaltered**, AFCA is acknowledged as maker and
author, and an active link to the hosting page is included. Analysis must be
attributed to its own author, not to AFCA.

So:

- `eval/cache/` and `eval/fixtures/*.json` are gitignored. Determination text
  never enters version control.
- What ships is derived structured fields, metrics, and commentary that is yours.
  That is analysis, not reproduction.
- Every case carries `source_url`, and the report links back to it.
- Read AFCA's terms yourself before any non-personal use. `fetch.py` encodes an
  interpretation, not legal advice.

## Building the real corpus

`eval/fixtures/synthetic-seed.json` is eight hand-built cases, flagged
`"synthetic": true`. They exist so the harness runs before you have scraped
anything, and so you can watch a known-bad engine fail. **They are not evidence
of anything.** Replace them.

The decision library at <https://my.afca.org.au/searchpublisheddecisions/> is a
Salesforce Experience Cloud site, so `requests.get` on the listing returns an
empty shell. Two routes:

1. Open the portal, watch the XHR the result grid fires, point
   `fetch.LISTING_ENDPOINT` at it. Try this first.
2. Drive it with Playwright.

Determinations themselves are PDFs at stable URLs, so once you have a manifest of
`{case_id, url}` the download half is done for you:

```bash
python3 -m eval.fetch --manifest manifest.json
```

Then extract with `adapt.EXTRACTION_PROMPT` and save via `schema.save`.

Target 300 motor and home cases. Below about 100 the confidence intervals are
wide enough that the number is not worth quoting.

## The current result, unmodified

```
8 cases
Agreement            62.5%   (gate 85%)   FAIL
False confidence      0.0%   (gate 2%)    pass
Escalation precision 66.7%
Decided outright     50.0%
```

The engine is failing its own gate on a deliberately adversarial seed set. That
is the harness working. Do not tune the thresholds until you have real cases —
moving a gate to make a build go green is how you end up with a number that
means nothing.
