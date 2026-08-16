# Bootstrap status — 2026-08-16

Firefly Studio began as a linked, non-destructive HQ. The clean V3 Market Intel
child was then renamed and moved with its Git history intact as Firefly Market
Radar.

| Repository | Bootstrap HEAD | Worktree | HQ state |
|---|---|---|---|
| InkOS | `029a787ea138163075fc1c16ad61b99f40eaf675` | clean | active / ready |
| Firefly Reference Lab | `ea3845e6b18cf4693a3b799c68fc1cff53db75f7` | clean | active / ready |
| Firefly Market Radar | `b0c2c34cc0b7db1bdf57ded7f61d10d7518eaa5a` | clean | active / ready |

## Decisions

- InkOS remains an intact fork and production engine.
- InkOS now has a local `upstream` remote for `Narcooo/inkos`. At bootstrap,
  `upstream/master...master` is `behind 9 / ahead 1`; no upstream merge was
  attempted as part of HQ creation.
- Firefly Reference Lab is a sibling role in the new HQ, even though its current
  physical checkout remains nested under the old InkOS path.
- V3 Market Intel becomes `firefly_market_radar`; the GitHub repository and local
  Git root use the new name while historical evidence paths remain compatible.
- V3 Sources, V3 Foundry, V3 Command Center, and all shortform repositories are
  excluded from this HQ and remain untouched in their original systems.

## Next migration gate

Physical relocation of another linked checkout is deferred. Before moving one:

1. close out or intentionally preserve its dirty worktree
2. inventory absolute path references
3. update handoffs and local configuration
4. rerun child tests and HQ status validation
5. move only the exact Git root, never a copied body
