# Firefly Studio

Firefly Studio is the thin production HQ for personally owned long-form fiction.
It does not replace or fork production engines inside this repository. Instead,
it keeps explicit boundaries and routes work across independent edge repositories.

## Production flow

```text
Firefly Market Radar ─┐
  dated market signals │
                       ├─> InkOS
Firefly Reference Lab ─┘   planning, A/B Rails, drafting, review, revision
  structural references
```

## Repository model

- This root owns family boundaries, routing contracts, and repository status.
- Every `edge_repos/` entry is an independent Git repository.
- Child repository bodies are ignored by this root.
- The current four children are physical sibling checkouts under `edge_repos/`.
  Bootstrap can still link an existing checkout on another machine; it never
  copies, resets, or silently replaces a child.
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

## HQ dispatch boundary

The HQ may choose a child, issue a versioned work order, and aggregate the
result. It does not write a child's production files itself. Registered worker
adapters run with the child repository as their working directory and return a
local `RunReceipt` under ignored `.firefly/runs/`.

```bash
npm run dispatch -- --work-order /absolute/path/to/work-order.json --dry-run
npm run dispatch -- --work-order /absolute/path/to/work-order.json
```

The v1 contracts are [`contracts/work-order-v1.schema.json`](contracts/work-order-v1.schema.json)
and [`contracts/run-receipt-v1.schema.json`](contracts/run-receipt-v1.schema.json).
Only manifest-declared, adapter-implemented capabilities can run. Mutating
capabilities require a clean child checkout, a per-target lock, an idempotency
key, and human approval of the resulting creative state.

`reference-bind` is the Firefly longform bootstrap capability. HQ verifies the
tracked Reference Lab pack at an exact Git commit, verifies the local-only raw
source, 751-chapter story index, and style examples against hashes declared by
that pack, and then asks InkOS to bind them. Raw prose is never copied into the
WorkOrder or RunReceipt. InkOS owns the resulting reference binding,
source-to-target transformation map, and automatically completed Story Rail;
chapter replacement still requires a separate human HIL decision. A successful
`reference-bind` must report the Book config, binding, transformation, and Rail
plan as hashed child artifacts; HQ reads those exact files back and refuses a
complete receipt when any required role is absent.

`pitch-slate` is the Book-before-creation funnel. HQ sends a variable
`candidateCount` (1-20), a safe `slateId`, a commercial instruction, and a
commit-pinned `pitch-reference-pack`. InkOS generates candidates serially,
validates the shared survival-pitch shape, and publishes only a complete
non-canonical slate under `.inkos/pitch-slates/<slateId>/`. HQ reads the slate
back and independently verifies the exact paths, hashes, requested candidate
count, ordered candidate IDs, and pending human decisions. No Book, Rail, Arc,
or manuscript is created until a later selection work order.

`bootstrap:links` reads the ignored machine-local
`config/local-edge-paths.json`. A physical checkout already at its canonical path
is accepted as-is; the command refuses to overwrite any mismatched path.

## Current scope

Active:

- `inkos` — production engine
- `firefly_reference_lab` — derived reference compiler
- `firefly_market_radar` — dated public-metadata market signals
- `storyyard` — private mobile human-review projection

Explicitly out of scope: shortform repositories, V3 Command Center, V3 Sources,
and V3 Foundry. They remain in their original systems and are not silently
inherited.
