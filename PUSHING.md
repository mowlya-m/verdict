# Pushing this to GitHub

Seventeen commits and four tags already exist locally. Nothing here rewrites
them. Run the blocks one at a time and check the output before moving on.

Every command assumes you are in the repo root:

```bash
cd "/Users/mowlya/Downloads/PERSONAL PROJECT/verdict"
```

Quote the path. The space in `PERSONAL PROJECT` breaks anything unquoted.

---

## 1. Confirm the history survived the download

```bash
git config --global --add safe.directory "$(pwd)"
git log --oneline --decorate | head -5
git tag
```

Expected: `chore(infra): add editor settings...` at the top, and tags
`v0.1.0` `v0.2.0` `v0.3.0` `v0.4.0`.

If you get `not a git repository`, the `.git` directory did not survive. Extract
the zip again from the terminal with `unzip`, not by double-clicking, because
Finder's Archive Utility sometimes drops dotfiles.

---

## 2. Set your identity on the repo

The commits currently carry a placeholder email.

```bash
git config user.name "Mowlya Shree Manjunatha"
git config user.email "your-github-email@example.com"
```

Use the email attached to your GitHub account, otherwise the commits will not
link to your profile and the contribution graph stays empty.

This only affects future commits. To relabel the existing seventeen:

```bash
git rebase --root --exec 'git commit --amend --no-edit --reset-author' --quiet
```

Do that **before** the first push, never after.

---

## 3. Authenticate

```bash
brew install gh
gh auth login
```

Pick GitHub.com, HTTPS, and authenticate in the browser. Verify:

```bash
gh auth status
```

---

## 4. Create the repository and push

```bash
gh repo create verdict \
  --public \
  --source=. \
  --remote=origin \
  --description "An autonomous claims agent for Australian general insurance"

git push -u origin main
git push origin --tags
```

Push the tags. `v0.1.0` through `v0.4.0` on the graph is what makes the history
read as deliberate rather than decorative.

---

## 5. Sync the label taxonomy

```bash
export GITHUB_TOKEN=$(gh auth token)
npx github-label-sync --access-token $GITHUB_TOKEN --labels .github/labels.yml mowlya-m/verdict
```

Twenty-one labels across four dimensions, plus `compliance`. Check them at
`https://github.com/mowlya-m/verdict/labels`.

---

## 6. Protect main

This is the step most people skip, and it is the one that makes the workflow
real rather than described.

```bash
gh api -X PUT repos/mowlya-m/verdict/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=API" \
  -F "required_status_checks[contexts][]=Web" \
  -F "required_status_checks[contexts][]=Commit messages" \
  -F "enforce_admins=false" \
  -F "required_pull_request_reviews[required_approving_review_count]=0" \
  -F "restrictions=null" \
  -f "allow_force_pushes=false" \
  -f "allow_deletions=false"
```

Then set squash-only merging, which is what `CONTRIBUTING.md` assumes:

```bash
gh api -X PATCH repos/mowlya-m/verdict \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_squash_merge=true \
  -F delete_branch_on_merge=true
```

Note that the `Eval gate` check is deliberately **not** in the required list. It
fails right now at 62.5% against an 85% gate, on eight hand-built fixtures. Add
it once you have real determinations:

```bash
gh api -X PUT repos/mowlya-m/verdict/branches/main/protection/required_status_checks \
  -F "strict=true" \
  -F "contexts[]=API" -F "contexts[]=Web" \
  -F "contexts[]=Commit messages" -F "contexts[]=Eval gate"
```

---

## 7. Open the backlog

`BUILD_PLAN.md` lists 21 pull requests. Turn the unbuilt ones into issues so the
repository reads as a roadmap rather than a finished artefact:

```bash
gh issue create --title "Expose POST /claims/{id}/decide over FastAPI" \
  --label "type: feature,area: api,priority: p0"

gh issue create --title "Add PDS retrieval keyed to date of loss" \
  --label "type: feature,area: agents,priority: p0" \
  --body "Must select the wording in force at the date of loss, not the current one. Needs a regression test; this bug is silent and invalidates every coverage decision on an older claim."

gh issue create --title "Replace synthetic eval fixtures with real AFCA determinations" \
  --label "type: feature,area: eval,priority: p0,compliance" \
  --body "Target 300 motor and home cases. Determination text stays out of version control; see eval/README.md."
```

---

## 8. The daily loop

From here, nothing goes directly to `main`.

```bash
gh issue create --title "Engine collapses partial coverage into decline" \
                --label "type: fix,area: engine,priority: p1"

git switch -c fix/engine-partial-coverage
# work
git commit -m "fix(engine): add PARTIAL outcome for split-liability claims"
git push -u origin fix/engine-partial-coverage

gh pr create --fill --label "type: fix,area: engine,priority: p1"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

`gh pr checks --watch` blocks until CI finishes. If `commitlint` rejects your
message, fix it with `git commit --amend` and force-push the branch. Never force
-push `main`.

---

## 9. Deploy the console

```bash
npm i -g vercel
vercel
vercel --prod
```

Run it from the repo root, not `apps/web`. `vercel.json` already points the build
at the right workspace and sets the security headers, so accept the defaults.

Then put the live URL in the README badge line and in your GitHub repo's About
panel.

---

## 10. Tag when a milestone lands

```bash
git tag -a v0.5.0 -m "M3: evidence agents

- intake extraction with structured output
- PDS retrieval keyed to date of loss
- vision damage findings with severity bands"
git push origin v0.5.0
```

SemVer, staying on `v0.x` until the eval agreement rate clears its gate on real
determinations. `v1.0.0` when a design partner runs a live claim through it.

---

## If CI goes red on the first push

Expected, and it is the `Eval gate` job. It fails on purpose at 62.5%. Two
options: leave it red and say so in the README, which is honest, or comment the
job out until you have real fixtures. Do not lower the threshold. Moving a gate
to turn a build green is how you end up with a number that means nothing.

The `API`, `Web` and `Commit messages` jobs should all pass. If `Web` fails,
check that `apps/web/package-lock.json` was committed, since the workflow uses
`npm ci`.
