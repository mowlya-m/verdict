# Before you push

Two failure classes ate an entire afternoon on 2026-08-29. Both were invisible
locally and only surfaced in CI, minutes after a push. Run the checks below
before pushing to `main` and neither will happen again.

## 1. A dependency works locally but not in CI

**Symptom:** `mypy` or a test passes on your machine, fails in CI with
`Cannot find implementation or library stub for module named "X"`.

**Cause:** the package is installed in your local environment (often left
over from earlier work) but was never added to `pyproject.toml`. CI does a
clean install from that file and has none of your machine's history.

**Check before pushing:**

```bash
cd apps/api
grep -c "^import \|^from " src/verdict/**/*.py | cut -d: -f1 | xargs -I{} true
python3 -c "
import ast, pathlib
declared = set()
import tomllib
deps = tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']
for d in deps:
    declared.add(d.split('[')[0].split('>')[0].split('=')[0].strip())
for f in pathlib.Path('src').rglob('*.py'):
    tree = ast.parse(f.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for n in node.names:
                top = n.name.split('.')[0]
                if top not in declared and top not in {'verdict'}:
                    print(f'{f}: imports {top!r}, not in pyproject.toml dependencies')
        elif isinstance(node, ast.ImportFrom) and node.module:
            top = node.module.split('.')[0]
            if top not in declared and top not in {'verdict', '__future__'}:
                print(f'{f}: imports {top!r}, not in pyproject.toml dependencies')
"
```

Any line printed means: add it to `dependencies` in `pyproject.toml`, then
`pip install -e '.[dev]'` locally before re-running checks.

## 2. A GitHub Actions workflow needs a secret that was never set

**Symptom:** a workflow step fails immediately with an auth error
(`no access token available`, `401`, `not authorized`) despite the same
command working fine when you run it yourself.

**Cause:** your terminal has a valid session from `flyctl auth login` /
`vercel login` / etc. GitHub's runners start with nothing — every credential
a workflow needs must be added explicitly as a repository secret.

**Check before trusting a new workflow:**

```bash
gh secret list
```

Compare that against every `${{ secrets.X }}` reference in `.github/workflows/*.yml`:

```bash
grep -ho 'secrets\.[A-Z_]*' .github/workflows/*.yml | sort -u
```

Every name in the second list must appear in the first. If one is missing,
generate the credential and add it at
`github.com/mowlya-m/verdict/settings/secrets/actions` before the workflow
can ever succeed.

**Handling the credential itself:** generate it, pipe it straight to the
clipboard, paste it directly into the GitHub form. Never print it to a
terminal you might paste from, and never paste it into a chat, a commit
message, or an issue — a credential that has appeared in plaintext anywhere
should be treated as compromised and regenerated.

```bash
flyctl tokens create deploy -a <app-name> | pbcopy   # macOS
```

## The five-minute pre-push routine

```bash
cd apps/api
ruff check . && ruff format --check .
mypy src
pytest tests -q
cd ../web
npm run build && npm run lint
```

If all of that is clean, CI will be clean. Nothing in CI is stricter than
this — the two failures above only happened because a dependency was
declared nowhere, and a secret existed nowhere. Both are structural gaps,
not flaky checks.
