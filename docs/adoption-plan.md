# Edge adoption plan

## Current shape

- InkOS remains at its existing checkout and is linked into the HQ.
- Firefly Reference Lab remains at its existing checkout and is linked into the HQ.
- Firefly Market Radar is a physical independent Git root under `edge_repos/`.
- V3 Sources, V3 Foundry, V3 Command Center, and shortform repos remain outside
  this family.

## Market Radar adoption

The clean `v3_ff_marketintel` repository is adopted with full Git history as
`firefly_market_radar`. Existing `market-intel-evidence-*` artifact paths and
collector command names remain compatible; the repository identity and
human-facing contract use the new name.

Market Radar remains independent:

- no production writes
- no source-prose or paid/full-text collection
- no Reference Lab Gold or structural analysis
- no trend conclusion from a baseline-only snapshot

## Linked-checkout policy

Physical relocation of InkOS and Reference Lab remains optional. Linked
checkouts are sufficient for HQ status and routing. Move a Git root only after
its worktree is clean and all absolute path references have been inventoried.

## Upstream policy for InkOS

- `origin` remains the Firefly-maintained fork.
- `upstream` points to `Narcooo/inkos`.
- Fetching upstream is read-only; merging is an explicit, tested child-repo task.
- Preserve InkOS package identifiers and formats where possible to reduce merge
  conflicts.
