# Bootstrap status — 2026-08-16

Firefly Studio was bootstrapped without moving, copying, resetting, or renaming
any existing repository.

| Repository | Bootstrap HEAD | Worktree | HQ state |
|---|---|---|---|
| InkOS | `029a787ea138163075fc1c16ad61b99f40eaf675` | clean | active / ready |
| Firefly Reference Lab | `ea3845e6b18cf4693a3b799c68fc1cff53db75f7` | clean | active / ready |
| V3 Sources | `b27d236bd0413a8086822c4262a0d4774615481f` | dirty: `.gitignore` | active / pending clean closeout |
| V3 Foundry | `f11c9025877e9f03d51e2ea8dbd2bb063832642d` | dirty: inherited tracked and untracked work | parked / legacy preserved |

## Decisions

- InkOS remains an intact fork and production engine.
- InkOS now has a local `upstream` remote for `Narcooo/inkos`. At bootstrap,
  `upstream/master...master` is `behind 9 / ahead 1`; no upstream merge was
  attempted as part of HQ creation.
- Firefly Reference Lab is a sibling role in the new HQ, even though its current
  physical checkout remains nested under the old InkOS path.
- V3 Sources is admitted by role but receives no HQ write or pull authorization
  until its inherited `.gitignore` change is intentionally closed out.
- Its existing child contract still routes material mining to V3 Foundry; this
  must be explicitly amended to route derived analysis to Reference Lab before
  Sources becomes write-enabled.
- V3 Foundry is visible for legacy migration only.
- V3 Command Center, V3 Market Intel, and all shortform repositories are excluded.

## Next migration gate

Physical relocation under this HQ is deferred. Before moving a checkout:

1. close out or intentionally preserve its dirty worktree
2. inventory absolute path references
3. update handoffs and local configuration
4. rerun child tests and HQ status validation
5. move only the exact Git root, never a copied body
