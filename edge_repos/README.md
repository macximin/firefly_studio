# Edge repositories

This directory contains independent child Git checkouts. InkOS, Reference Lab,
Market Radar, Storyyard, and V3 Webnovel Foundry are physical sibling directories; the HQ
repository does not track their bodies.

On another machine, `npm run bootstrap:links` can create links from the ignored
`config/local-edge-paths.json`. It accepts a checkout already at the canonical
path and refuses to overwrite an existing file, directory, or mismatched link.

`v3_ff_foundry` contains the restored webnovel planning and A/B Rail workflow.
Its original Git history is preserved. Registration does not execute its old
producer or automation configuration.
