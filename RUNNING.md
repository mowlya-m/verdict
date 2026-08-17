# Running it locally

## 0. Restore the git history

Downloads strip the `.git` directory, so the thirteen commits came separately as
a bundle. Clone from it and you get the full history, branches and tags.

```bash
cd ~/projects                       # wherever you keep repos
git clone verdict/verdict-history.bundle verdict
cd verdict
git log --oneline --decorate
```

You should see thirteen commits and tags `v0.1.0` and `v0.2.0`.

If the bundle didn't come through, initialise fresh instead. You lose the
history, which is the part worth having, so try the bundle first.

```bash
cd verdict && git init -b main && git add -A && git commit -m "chore(infra): initial import"
```

Then delete the bundle from the working tree so it isn't committed:

```bash
rm verdict-history.bundle
```

## 1. Check the hidden files survived

macOS and most browsers hide dotfiles, and some archive tools drop them.

```bash
ls -a
```

Expected: `.github`, `.gitignore`, `.env.example`. If `.github` is missing, the
CI, labels and templates are gone and you'll need to pull them from the chat
files again.

## 2. Run the decision core

No dependencies, no API key, no network. This is the whole engine.

```bash
cd apps/api
PYTHONPATH=src /opt/anaconda3/bin/python3.12 -m pytest tests -q
PYTHONPATH=src /opt/anaconda3/bin/python3.12 demo.py
```

Expect `14 passed`, then four claims printed with their gate traces:

| Claim | Outcome | Why |
|---|---|---|
| A10293 | `ACCEPT` | Seven gates clear, payable $1,780 after excess |
| A10294 | `ESCALATE` | Photo predates the loss, duplicate image, quote 250% above band |
| A10295 | `REQUEST_EVIDENCE` | Missing police report, purchase proof, licence |
| A10291 | `DECLINE` | Exclusion 9.4, driver not licensed |

The `PYTHONPATH=src` is only needed until you install the package. To skip it:

```bash
/opt/anaconda3/bin/python3.12 -m pip install -e '.[dev]'
python3.12 -m pytest    # pyproject already sets pythonpath
```

## 3. Run the console

Needs Node 20 or later. Check with `node -v`.

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:5173. Click through the five claims in the left queue and
watch the gate trace animate. A10287 is the one to look at: breached Code
window, vulnerability signal, escalated.

Production build check:

```bash
npm run build && npm run preview
```

## 4. Deploy the console

```bash
npm i -g vercel
cd ~/projects/verdict     # repo root, not apps/web
vercel
vercel --prod
```

`vercel.json` already points the build at `apps/web` and sets the security
headers, so accept the defaults when prompted.

## What does not work yet, and why

**`make dev` fails on the API side.** There is no FastAPI app: `src/verdict/api/`
is BUILD_PLAN PR 10. Until it lands, run the two workspaces separately as above.

**`make eval` fails.** The AFCA harness is PR 17 and 18. The CI eval gate will
also fail on a real push for the same reason, so either build the harness or
comment out the `eval` job in `.github/workflows/ci.yml` before your first push.

**`make setup` may fail on `uv`.** The CI uses `uv`; the Makefile uses plain
`pip`. If you prefer `uv` locally: `brew install uv`.

## Push it to GitHub

```bash
gh repo create verdict --public --source=. --remote=origin
git push -u origin main --tags
make labels    # needs GITHUB_TOKEN exported
```

Push the tags. `v0.1.0` and `v0.2.0` on the graph is what makes the history read
as deliberate rather than decorative.

## If something breaks

`ModuleNotFoundError: verdict` — you're not in `apps/api`, or `PYTHONPATH=src`
is missing.

`command not found: npm` — install Node: `brew install node`.

Blank page at :5173 — check the browser console. The Google Fonts import is the
only external dependency and it degrades to system fonts offline.

`fatal: detected dubious ownership` — `git config --global --add safe.directory
$(pwd)`.
