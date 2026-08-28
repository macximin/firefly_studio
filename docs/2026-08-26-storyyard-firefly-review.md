# Storyyard Firefly review surface

## Decision

Storyyard is the private, mobile-first human review projection for Firefly.
InkOS remains the only long-form production and canon authority. Storyyard does
not draft, revise, approve, or publish an InkOS chapter by itself.

## Flow

1. InkOS exports an immutable `firefly_review_packet/v1` for the existing
   single-candidate flow or a blind-pair `firefly_review_packet/v2`.
2. Storyyard renders either packet for an authenticated administrator and
   stores the matching v1/v2 decision as `pending`. V2 requires a human
   classification for every surface match.
3. HQ reads the pending receipt and invokes the matching InkOS HIL action.
4. InkOS applies or replaces the candidate under its Book lock, resynchronizes
   derived state, and emits its own receipt.
5. Storyyard may mark the decision applied only after that InkOS receipt exists.
6. Once any decision for a packet is `applied`, Storyyard removes that packet
   from the active queue and rejects duplicate new decisions with HTTP 409.

`reverseSync` is always false. A Storyyard text edit is never a canon edit.

## Legacy preservation

The existing V3 Foundry restaurant projects, publications, snapshots, and
comments remain stored. They are hidden from the current default surfaces and
labelled read-only legacy. No row or public URL is deleted by this migration.

## Review actions

- `approve`: apply the exact candidate hash in InkOS.
- `polish`: request a new InkOS candidate; do not edit the body in Storyyard.
- `hold`: close the pending transport decision with an InkOS `held` receipt,
  without changing the canonical manuscript or candidate state.
- `reject`: reject the selected candidate in InkOS.

Every decision is bound to the packet, artifact, candidate, and SHA-256 values
visible at decision time. A changed InkOS chapter requires a new packet.
V2 exposes only opaque `candidate-A/B` labels before the decision. InkOS alone
resolves the chosen label to a live internal HIL candidate. `canon-leak` blocks
approval; other classifications remain human review information and do not
trigger automatic rewriting or rejection.

## Operator path

```text
inkos review export-storyyard <book-id> --out .inkos/exports/storyyard/current.json --json
storyyard: npm run firefly:import-review -- ../inkos/.inkos/exports/storyyard/current.json
inkos review apply-storyyard <decision.json> --packet .inkos/exports/storyyard/current.json --json
storyyard: STORYYARD_APPLY_TOKEN=<runtime secret> npm run firefly:ack-review -- <InkOS applied receipt.json>
```

For v2, InkOS first validates a host-prepared pointer-only body against the live
Book and HIL candidates:

```text
inkos review export-storyyard-v2 <draft-body.json> <book-id> --out .inkos/exports/storyyard/current-v2.json --json
firefly HQ: npm run import:review-v2 -- <InkOS current-v2.json>
storyyard: npm run firefly:import-review -- <InkOS current-v2.json>
```

The optional source comparison is admin-only and transient. Storyyard signs a
60-second Ed25519 grant from `STORYYARD_SOURCE_GRANT_PRIVATE_JWK` and sends it to
the fixed HTTPS `STORYYARD_SOURCE_GATEWAY_URL`. HQ keeps only the public JWK,
binds its plaintext listener to `127.0.0.1` or `::1`, consumes the JTI before
the child call, and invokes the Reference Lab resolver with raw bytes on fd3.
The browser keeps a slice in React memory for at most ten minutes. D1, packet,
logs, localStorage, IndexedDB and service-worker cache do not receive it.

The 2026-08-28 transport canary passed with one real 554-byte source slice and
zero raw persistence. This is transport evidence only; it is not a Soul,
commercial, Storyyard decision, or promotion receipt. A named TLS tunnel and a
real human review remain deployment work.

The last command revalidates packet identity, candidate SHA-256, current chapter
freshness, and the Book lock before invoking the existing InkOS HIL operation.
An approval still returns the chapter to drafted state and requires state sync,
audit, and normal chapter approval before continuation.

The acknowledgement endpoint accepts only a dedicated bearer token and the
full InkOS receipt. It matches the original decision UUID, packet and candidate
hashes, work, artifact, action, comment, timestamps, and canonical receipt path
before changing Storyyard from `pending` to `applied`. An identical replay is
idempotent; a conflicting replay fails closed. This is a status projection only
and grants Storyyard no write path into InkOS.

An applied `hold` is terminal too: it means InkOS acknowledged that no canon
change was requested. It must not remain in "today review" as if another human
decision were still required.
