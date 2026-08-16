# Edge repositories

This directory contains machine-local links or independent child Git checkouts.
The HQ repository does not track their bodies.

Run `npm run bootstrap:links` to create links from the ignored
`config/local-edge-paths.json`. The bootstrap refuses to overwrite an existing
file, directory, or mismatched link.
