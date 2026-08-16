# Bootstrap status — 2026-08-16

Firefly Studio began as a linked, non-destructive HQ. The clean V3 Market Intel
child was then renamed and moved with its Git history intact as Firefly Market
Radar.

| Repository | Current HEAD | Worktree | HQ state |
|---|---|---|---|
| InkOS | `6b4807b1` | clean | active / ready |
| Firefly Reference Lab | `4b97dbad` | clean | active / ready |
| Firefly Market Radar | `6d50cbee` | clean | active / ready |

## Decisions

- InkOS remains an intact fork and production engine.
- InkOS has a local `upstream` remote for `Narcooo/inkos`. The current master is
  synchronized with origin and reports `upstream/master...master` as
  `behind 0 / ahead 6` after the Korean execution-surface integration.
- Firefly Reference Lab is a sibling role in the new HQ, even though its current
  physical checkout remains nested under the old InkOS path.
- V3 Market Intel becomes `firefly_market_radar`; the GitHub repository and local
  Git root use the new name while historical evidence paths remain compatible.
- V3 Sources, V3 Foundry, V3 Command Center, and all shortform repositories are
  excluded from this HQ and remain untouched in their original systems.

## First production route receipt

- Market Radar captured one 2026-08-16 public-metadata baseline: 120 rows across
  Kakao, Munpia, Naver, and Novelpia. Its reviewed signal remains a bounded
  hypothesis, not a trend or an automatic production order.
- Reference Lab used that signal and the two approved Gold references to prepare
  the 11-file P9 pack for the working title 《부도난 회사만 삽니다》.
- The pack is `READY_FOR_OWNER_LOCK`. No InkOS project or manuscript was created;
  advisory inputs still have no automatic writeback path into production.

## Next migration gate

Physical relocation of another linked checkout is deferred. Before moving one:

1. close out or intentionally preserve its dirty worktree
2. inventory absolute path references
3. update handoffs and local configuration
4. rerun child tests and HQ status validation
5. move only the exact Git root, never a copied body
