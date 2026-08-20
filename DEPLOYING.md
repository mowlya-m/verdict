# Deploying

Two halves. The API must go first, because the console is useless pointing at
`localhost`.

Total cost on the free tiers below: nothing. A domain is optional and is the
last step, not the first.

---

## Choosing a host

| | Cost | Cold start | Card |
|---|---|---|---|
| **Render** | free | ~50s after 15 min idle | no |
| **Fly** | ~$5/month minimum | ~2s after idle | yes |

Render for a portfolio build. Fly if you are showing it to a design partner and
cannot afford the pause. Both use the same Dockerfile; only the config differs.

---

## 1a. API to Render (free, no card)

Sign up at <https://render.com> with GitHub, then:

1. **New** → **Blueprint**
2. Point it at `mowlya-m/verdict`
3. It reads `render.yaml` and offers a `verdict-api` service
4. Leave `ALLOWED_ORIGINS` blank for now; you will set it in step 3
5. **Apply**

First build takes a few minutes. When it finishes:

```bash
curl https://verdict-api.onrender.com/health
```

You want `{"status":"ok","engine":"0.7.0"}`. Docs at `/docs`.

`autoDeploy: true` means every push to `main` redeploys, so the GitHub Actions
workflow is only needed if you move to Fly.

---

## 1b. API to Fly (paid, faster)

```bash
brew install flyctl
flyctl auth signup     # or: flyctl auth login
```

From the repository root:

```bash
flyctl launch --config apps/api/fly.toml --dockerfile apps/api/Dockerfile --no-deploy
```

It will ask to overwrite `fly.toml`. **Say no.** The committed one already sets
the Sydney region, health checks, concurrency limits and machine size.

If `verdict-api` is taken, pick another name and update the `app` line.

```bash
flyctl deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
flyctl status
curl https://verdict-api.fly.dev/health
```

You want `{"status":"ok","engine":"0.7.0"}`.

Docs land at `https://verdict-api.fly.dev/docs`.

### Why the machine sleeps

`auto_stop_machines = "suspend"` with `min_machines_running = 0` means the
container suspends when idle and wakes on the next request. That keeps it inside
the free allowance. The first request after a quiet period takes a second or two;
everything after is immediate.

If you are demoing live and cannot afford that pause, set
`min_machines_running = 1` an hour beforehand and put it back after.

---

## 2. Console to Vercel

```bash
npm i -g vercel
vercel login
```

From the repository root, not `apps/web`:

```bash
vercel
```

Accept the detected settings. `vercel.json` already points the build at the right
workspace and sets the security headers.

**Then set the API origin, or every visitor sees the offline banner:**

```bash
vercel env add VITE_API_URL production
# paste: https://verdict-api.fly.dev

vercel --prod
```

---

## 3. Close the CORS loop

The API only accepts browser requests from origins you name. Point it at the
Vercel URL you just got:

```bash
# Render: Dashboard → verdict-api → Environment → add ALLOWED_ORIGINS
# Fly:
flyctl secrets set ALLOWED_ORIGINS="https://verdict-claims.vercel.app" \
  --config apps/api/fly.toml
```

Comma-separate to allow more than one:

```bash
flyctl secrets set ALLOWED_ORIGINS="https://verdict.example,https://www.verdict.example"
```

A wildcard is refused at boot. `test_wildcard_origin_is_refused` locks that down,
because `*` would let any site on the internet drive the decision engine from a
visitor's browser.

---

## 4. Verify end to end

Open the Vercel URL, go to the assessor console, open devtools → Network. You
should see POSTs to `/claims/motor/decide` and `/claims/health/decide` returning
200.

If they fail with a CORS error, step 3 has the wrong origin. Check the exact
string, including the scheme and no trailing slash:

```bash
flyctl secrets list --config apps/api/fly.toml
```

Then update the README:

```markdown
[Live demo](https://verdict-claims.vercel.app)
```

---

## 5. Continuous deployment

`.github/workflows/deploy.yml` redeploys the API when anything under `apps/api/`
lands on `main`. It runs the suite, builds the image, boots it and curls
`/health` before touching Fly, so a broken container never reaches production.

One secret is required:

```bash
flyctl tokens create deploy -x 8760h
gh secret set FLY_API_TOKEN --body "<paste the token>"
```

Vercel redeploys on push automatically once the GitHub integration is connected.

---

## 6. A domain, if you want one

Do this last. `verdict-claims.vercel.app` is a perfectly respectable URL for a
project repository, and nobody screening you will hold it against you. Buy a
domain when you are showing this to a design partner, where an underwriting
agency will judge the URL.

- `.com.au` requires an ABN or a registered trading name
- `.claims` and `.au` are open, roughly $20 to $60 a year
- Cloudflare Registrar sells at cost; Namecheap is fine too

Then:

```bash
vercel domains add verdict.example
```

Vercel prints the DNS records. Add them at your registrar and it issues the
certificate automatically. Remember to update `ALLOWED_ORIGINS` on Fly, or the
console will load on the new domain and every decision will fail.

---

## Costs, honestly

| | Free tier | When it stops being free |
|---|---|---|
| Fly | 3 shared-cpu-1x machines, suspends when idle | Sustained traffic, or `min_machines_running > 0` |
| Vercel | 100 GB bandwidth a month | Real traffic, which you do not have |
| Domain | — | $20 to $60 a year, renews forever |

---

## If it breaks

**`flyctl deploy` fails on the build.** Build locally first to see the real
error: `docker build -t verdict-api apps/api`.

**Health check never passes.** `flyctl logs --config apps/api/fly.toml`. Usually
the port: Fly injects `PORT`, and the `CMD` reads it.

**Console loads but every claim errors.** CORS. Step 3.

**Console loads with no network calls at all.** `VITE_API_URL` was not set at
build time. Vite inlines it during the build, so setting it afterwards does
nothing until you redeploy.
