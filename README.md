# Firefly Studio

Firefly Studio is the thin production HQ for personally owned long-form fiction.
It does not replace or fork production engines inside this repository. Instead,
it keeps explicit boundaries and routes work across independent edge repositories.

## Production flow

```text
Firefly Sources
  raw-source custody, rights, provenance, observations
        ↓
Firefly Reference Lab
  pitches, character cores, Arc/event/reward reference cards
        ↓
InkOS
  planning, A/B Rails, drafting, review, revision, continuation
```

`v3_ff_foundry` is retained as a parked legacy authority for existing Firefly
works. It is not the default engine for new writing and is never written back to
automatically.

## Repository model

- This root owns family boundaries, routing contracts, and repository status.
- Every `edge_repos/` entry is an independent Git repository.
- Child repository bodies are ignored by this root.
- Existing checkouts are linked non-destructively during bootstrap; no child is
  copied, moved, reset, or renamed.
- InkOS keeps its existing package names, file formats, Git history, and upstream
  fork relationship.

The canonical child registry is [`config/edge-repos.json`](config/edge-repos.json).

## Local commands

```bash
npm run bootstrap:links
npm run validate
npm run status
npm test
```

`bootstrap:links` reads the ignored machine-local
`config/local-edge-paths.json`. It refuses to overwrite an existing path.

## Current scope

Active:

- `inkos` — production engine
- `firefly_reference_lab` — derived reference compiler
- `v3_ff_sources` — source custody, pending clean closeout before HQ writes

Parked:

- `v3_ff_foundry` — legacy canon and migration source

Explicitly out of scope: shortform repositories, V3 Command Center, and V3
Market Intel. They can be proposed later, but are not silently inherited.
