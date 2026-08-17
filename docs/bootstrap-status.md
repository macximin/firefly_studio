# Physical child migration receipt — 2026-08-17

Firefly Studio now owns one physical sibling tree. No child is vendored into the
HQ Git history, and every child keeps its own remote, branch, and commit history.

```text
/Users/a2501/Desktop/firefly_studio/
└── edge_repos/
    ├── inkos/
    ├── firefly_reference_lab/
    └── firefly_market_radar/
```

| Repository | Migration base HEAD | Git root | HQ state |
|---|---|---|---|
| InkOS | `4875c28a` | `edge_repos/inkos` | active / physical child |
| Firefly Reference Lab | `4176212d` | `edge_repos/firefly_reference_lab` | active / physical child |
| Firefly Market Radar | `6d50cbee` | `edge_repos/firefly_market_radar` | active / physical child |

## Migration result

- InkOS moved from `/Users/a2501/Desktop/inkos` with its `.git` directory and
  working data intact.
- Reference Lab moved from the former nested InkOS checkout to the sibling path
  `edge_repos/firefly_reference_lab`, also with its `.git` directory intact.
- Market Radar was already a physical child at its canonical path and did not
  move.
- The two former HQ links were removed only after their exact targets and clean
  Git states were verified. The old `/Users/a2501/Desktop/inkos` path no longer
  exists.
- InkOS remains the production engine and retains its upstream fork relationship.
  Package names, file formats, and repository history were not renamed.

## Historical path mapping

Receipts, transcripts, checkpoints, and archived analysis created before this
migration remain immutable evidence. Read their old paths through this mapping:

| Historical path | Current path |
|---|---|
| `/Users/a2501/Desktop/inkos` | `/Users/a2501/Desktop/firefly_studio/edge_repos/inkos` |
| `/Users/a2501/Desktop/inkos/edge_repos/inkos_reverse_lab` | `/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab` |

Active scripts, current handoffs, local bootstrap configuration, and Reference
Core installation use the current paths. Historical `source_receipt.json`,
session logs, archived work, and completion receipts intentionally keep the path
that was true when they were produced.

## Production route

- Market Radar supplies dated public-metadata signals.
- Reference Lab supplies derived pitches, Arc/event/reward structures, character
  cores, and reviewed Reference Core cards.
- InkOS owns project planning, A/B Rails, drafting, review, revision, and
  continuation. Advisory repositories do not write production decisions directly.

The 2026-08-16 P9 pack for the working title 《부도난 회사만 삽니다》 remains
`READY_FOR_OWNER_LOCK`; this repository relocation does not promote it into an
InkOS project.
