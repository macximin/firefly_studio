# Storyyard Firefly review surface

## Decision

Storyyard is the private, mobile-first human review projection for Firefly.
InkOS remains the only long-form production and canon authority. Storyyard does
not draft, revise, approve, or publish an InkOS chapter by itself.

## Flow

1. InkOS exports an immutable `firefly_review_packet/v1` for one chapter and
   its prepared candidates.
2. Storyyard renders the packet for an authenticated administrator and stores
   one `firefly_review_decision/v1` as `pending`.
3. HQ reads the pending receipt and invokes the matching InkOS HIL action.
4. InkOS applies or replaces the candidate under its Book lock, resynchronizes
   derived state, and emits its own receipt.
5. Storyyard may mark the decision applied only after that InkOS receipt exists.

`reverseSync` is always false. A Storyyard text edit is never a canon edit.

## Legacy preservation

The existing V3 Foundry restaurant projects, publications, snapshots, and
comments remain stored. They are hidden from the current default surfaces and
labelled read-only legacy. No row or public URL is deleted by this migration.

## Review actions

- `approve`: apply the exact candidate hash in InkOS.
- `polish`: request a new InkOS candidate; do not edit the body in Storyyard.
- `hold`: keep the packet pending without changing InkOS.
- `reject`: reject the selected candidate in InkOS.

Every decision is bound to the packet, artifact, candidate, and SHA-256 values
visible at decision time. A changed InkOS chapter requires a new packet.

## Operator path

```text
inkos review export-storyyard <book-id> --out .inkos/exports/storyyard/current.json --json
storyyard: npm run firefly:import-review -- ../inkos/.inkos/exports/storyyard/current.json
inkos review apply-storyyard <decision.json> --packet .inkos/exports/storyyard/current.json --json
```

The last command revalidates packet identity, candidate SHA-256, current chapter
freshness, and the Book lock before invoking the existing InkOS HIL operation.
An approval still returns the chapter to drafted state and requires state sync,
audit, and normal chapter approval before continuation.
