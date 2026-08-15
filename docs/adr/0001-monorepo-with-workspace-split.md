# ADR-0001: Monorepo with an api and web workspace split

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Mowlya Shree Manjunatha

## Context

The decision core is Python. The assessor console is React. Both change together
during early development: a new gate in the engine almost always needs a new row
in the trace view. Two repositories would mean two PRs, two reviews and a
versioned contract between them before either has stabilised.

Against that, a monorepo makes CI slower and the deploy story more complex,
since the web app goes to a static host and the api goes to a container host.

## Decision

We use a single repository with `apps/api` and `apps/web` workspaces. CI runs
the two jobs in parallel with path-scoped caching. Deploys are configured
per-workspace: `vercel.json` targets `apps/web`, and the api deploys from
`apps/api/Dockerfile`.

## Consequences

**Accepted**

- One PR can change a gate and its UI representation atomically.
- The eval harness imports the engine directly rather than over HTTP.
- Contributors clone once.

**Rejected alternatives**

- *Separate repositories.* Correct once the engine's public contract is stable.
  Premature now.
- *Python-only with server-rendered templates.* Removes the React dependency but
  the assessor console needs real interactivity, and a Vite build deploys to a
  free static host.
