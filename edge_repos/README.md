# Edge repositories

This directory contains independent child Git checkouts. The current InkOS,
Reference Lab, and Market Radar children are physical sibling directories; the HQ
repository does not track their bodies.

On another machine, `npm run bootstrap:links` can create links from the ignored
`config/local-edge-paths.json`. It accepts a checkout already at the canonical
path and refuses to overwrite an existing file, directory, or mismatched link.
