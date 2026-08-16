# Edge adoption plan

## Phase 0 — linked HQ (current)

- Keep every existing checkout at its current path.
- Use machine-local links under `edge_repos/`.
- Permit normal production in clean `inkos` and `firefly_reference_lab` only.
- Preserve dirty V3 worktrees without staging, stashing, resetting, or moving.

## Phase 1 — Sources closeout and contract amendment

`v3_ff_sources` currently routes QRP/ESM/block material mining to
`v3_ff_foundry/30_materials`. That is a V3 contract and cannot silently become a
Firefly Studio route.

Before `writeAllowed` may become true:

1. inspect and intentionally close out the inherited `.gitignore` change
2. update the Sources charter so raw-source custody and observations remain in
   Sources while derived reusable analysis routes to `firefly_reference_lab`
3. preserve rights/provenance fields and local ignored corpus rules
4. validate, commit, and push Sources independently
5. update the HQ manifest adoption receipt

## Phase 2 — legacy work migration

Keep `v3_ff_foundry` parked. Select one work at a time and use the migration gate
in `contracts/production-routing.md`. Do not bulk-copy `40_works/`, automatically
rewrite A/B Rails, or infer owner approval from file presence.

## Phase 3 — optional physical relocation

Physical relocation is optional. Linked checkouts are sufficient for HQ status
and routing. Move a Git root only after its worktree is clean and all absolute
path references have been inventoried and updated.

## Upstream policy for InkOS

- `origin` remains the Firefly-maintained fork.
- `upstream` points to `Narcooo/inkos`.
- Fetching upstream is read-only; merging is an explicit, tested child-repo task.
- Preserve InkOS package identifiers and formats where possible to reduce merge
  conflicts.
