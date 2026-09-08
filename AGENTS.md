# Firefly Studio HQ operating rules

## Authority

- `config/edge-repos.json` is the only child-repository registry.
- This root owns boundaries, routing contracts, adoption state, and read-only
  status aggregation. It does not own child content.
- Each `edge_repos/` entry is an independent Git root and must be inspected,
  validated, committed, and pushed separately.

## Production boundaries

- `inkos` owns production execution: planning, Arc/Rail state, drafting, review,
  revision, and continuation.
- `firefly_reference_lab` owns derived work analysis, pitches, character cores,
  Arc/event/reward references, and Gold routing evidence.
- `firefly_market_radar` owns dated public-metadata evidence and reviewed market
  signals. It does not own pitches, reference analysis, or production decisions.
- `storyyard` owns private human-review projection, decision receipts, and
  explicitly approved publication snapshots. It never owns InkOS canon and may
  not write directly into an InkOS project.
- `v3_ff_foundry` is an owner-directed webnovel planning and A/B Rail design
  workspace, restored as an independent edge on 2026-09-06. Its historical
  works and charter remain scoped to that repository. This registration does
  not activate its old automation or transfer InkOS canon authority. Planning
  handoff to InkOS still requires an explicit, verified input mapping.

## Safety

- Never reset, stash, overwrite, or auto-commit a dirty child.
- Never stage across Git roots. Do not use `git add .` for family closeout.
- A child checkout is an independent Git root, whether it is a physical directory
  or a bootstrap-created link. Do not replace it with copied files.
- Do not move or rename existing child directories while handoff documents still
  contain absolute paths. Migration requires a path audit and validation receipt.
- Keep InkOS upstream compatibility: avoid mass package/path/identifier renames.
  Firefly-specific behavior should enter through contracts, adapters, or new
  modules unless a core change is genuinely required.
- Market Radar and Reference Lab are advisory inputs. Neither may write directly
  into an InkOS project or promote a production decision.
- Storyyard receives immutable review packets and emits pending human decisions.
  Only InkOS may apply an approved candidate or produce a polished replacement.

## Excluded families

Shortform repositories, V3 Command Center, and V3 Sources are not members of
this HQ unless the owner explicitly adds them to the manifest. V3 Foundry is
registered separately; the archived V3 HQ is not reactivated by that addition.
