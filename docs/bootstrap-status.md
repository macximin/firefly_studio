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
  Git states were verified. At migration close,
  `/Users/a2501/Desktop/inkos` no longer existed. A later workflow recreated
  that location as a file-empty, non-Git directory skeleton. As verified on
  2026-08-23, it is neither a managed repository nor production authority.
  The actual InkOS engine and book data remain under `edge_repos/inkos`.
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

## Current P9 authority

The historical 2026-08-16 P9 pack for 《부도난 회사만 삽니다》 is no
longer `READY_FOR_OWNER_LOCK`. On 2026-08-17, the owner explicitly rejected
the externally originated preproduction concept and ordered the InkOS project
deleted.

Reference Lab preserves the pack only as historical evidence. A recoverable
local Trash copy was verified on 2026-08-23, but repository closeout, a generic
continuation instruction, or automation resumption does not authorize its
restoration, review, or further drafting. Those actions require a fresh,
explicit owner approval naming this work.

Current authority:
`firefly_reference_lab@34f21f5d4b5e2ee22e2321d703ba208567c0cfa3:docs/2026-08-23-p9-owner-deletion-receipt.md`
