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
3. For v1 production HIL only, HQ may transport the pending receipt to InkOS;
   InkOS remains the sole process allowed to apply or replace a manuscript.
4. V2 blind-pair decisions are promotion evaluations only. InkOS acknowledges
   them with `canonEffect: none` and never applies either candidate to the Book.
5. Storyyard marks v1 as `applied` or v2 as `acknowledged` only after the exact
   matching InkOS receipt exists, then removes the item from the active queue.

`reverseSync` is always false. A Storyyard text edit is never a canon edit.

## Legacy preservation

The existing V3 Foundry restaurant projects, publications, snapshots, and
comments remain stored. They are hidden from the current default surfaces and
labelled read-only legacy. No row or public URL is deleted by this migration.

## Review actions

The legacy v1 production-HIL actions are:

- `approve`: apply the exact candidate hash in InkOS.
- `polish`: request a new InkOS candidate; do not edit the body in Storyyard.
- `hold`: close the pending transport decision with an InkOS `held` receipt,
  without changing the canonical manuscript or candidate state.
- `reject`: reject the selected candidate in InkOS.

The v2 blind-pair actions are `select`, `tie`, and `invalid`. They record owner
evaluation evidence only; `manuscriptApply` is always false.

Every decision is bound to the packet, artifact, candidate, and SHA-256 values
visible at decision time. A changed InkOS chapter requires a new packet.
V2 exposes only opaque `candidate-A/B` labels before the decision. The selected
label remains evaluation evidence and is never resolved into a manuscript-apply
candidate. `canon-leak` blocks selecting that candidate; other classifications
remain human review information and do not trigger automatic rewriting or
rejection.

## Operator path

```text
inkos review export-storyyard <book-id> --out .inkos/exports/storyyard/current.json --json
storyyard: npm run firefly:import-review -- ../inkos/.inkos/exports/storyyard/current.json
inkos review apply-storyyard <decision.json> --packet .inkos/exports/storyyard/current.json --json
storyyard: STORYYARD_APPLY_TOKEN=<runtime secret> npm run firefly:ack-review -- <InkOS applied receipt.json>
```

For v2, do not use the retired `export-storyyard-v2` command. The current path
uses two isolated InkOS generation lanes, a bodyless public input, a private
exact-read evaluator input, and explicit evidence transport:

```text
inkos: node packages/cli/dist/index.js production canary-context --pair <source-pair> --json
inkos: node packages/cli/dist/index.js review prepare-blind-pair --pair <source-pair> --book <book-id> --neutral-work-order <neutral-id> --soul-work-order <soul-id> --common-context .inkos/canaries/<source-pair>/review/common-context.json --round <1|2|3> --json
firefly HQ: npm run prepare:blind-review -- --pair <source-pair> --genre <genre> --reviewer-actor <distinct-id> --intensity-directive-sha256 <sha256>
Reference Lab: run the exact cwd/argv returned as runnerInvocation
firefly HQ: npm run import:blind-review -- --pair <source-pair> --genre <genre>
inkos: run the exact cwd/argv returned as materializeInvocation
firefly HQ: npm run import:review-v2 -- <InkOS packet.json>
storyyard: npm run firefly:import-review-v2-batch -- <one-or-more InkOS packet.json paths>
storyyard: npm test
Sites: rebuild and deploy the saved Storyyard project from the committed Storyyard root
live readback: open /review and verify the exact imported packet IDs and pending count
```

After the owner records one v2 decision, close the advisory loop with the two
identifier spaces kept explicit: InkOS reads its private mapping with the
`<source-pair>`, while the public packet and ACK path use the opaque `bp-...`
comparison ID.

```text
Storyyard: authenticated GET /api/firefly/review-decisions?packet_id=<packet-id>, save exactly one pending firefly_review_decision/v2 object
inkos: node packages/cli/dist/index.js review acknowledge-storyyard-evaluation <project-relative decision.json> --packet <project-relative packet.json> --pair <source-pair> --json
storyyard: STORYYARD_APPLY_TOKEN=<runtime secret> npm run firefly:ack-review -- <InkOS-project-root>/<acknowledgment.ackReceiptPath>
live readback: authenticated GET the same packet_id and verify the exact decision is acknowledged with the same public ACK path
```

The v2 ACK is status-only. It never resolves or applies a candidate manuscript.

The bridge preflights the exact private evaluator JSON against both the Hermès
4,500,000-byte reader boundary and the attested profile/project/plugin/prompt
context budget before publishing either Reference Lab input.
All v2 packet imports execute the published Draft 2020 schema and include
`generatedAt` in packet identity.

The batch importer changes a tracked static packet index. Import alone is not a
deployment: Storyyard must be rebuilt, the resulting revision deployed, and the
authenticated live `/review` surface read back before the queue is reported as
available to the owner.

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

InkOS also converts legacy story `sourceCharacterRange` UTF-16 offsets and
range-less style-example provenance into the packet's canonical UTF-8 byte
selectors. It verifies the full source SHA and prose SHA first; duplicate style
matches require an imported UTF-8 selector and all drift or boundary ambiguity
fails closed. One real Doksik reference-pack canary resolved the story and style
paths to the same source bytes `32..138` without persisting raw prose.

V2 materialization revalidates packet identity, candidate SHA-256, the current
canonical chapter projection, evaluator evidence, and isolation receipts. It
creates no Book mutation path. A selected v2 candidate can inform a later Soul
promotion decision, but cannot be promoted or applied by Storyyard or RefLab.

The acknowledgement endpoint accepts only a dedicated bearer token and the
full InkOS receipt. It matches the original decision UUID, packet and candidate
hashes, work, artifact, action, comment, timestamps, and canonical receipt path
before changing Storyyard from `pending` to v1 `applied` or v2 `acknowledged`.
An identical replay is idempotent; a conflicting replay fails closed. This is a
status projection only and grants Storyyard no write path into InkOS.

An applied `hold` is terminal too: it means InkOS acknowledged that no canon
change was requested. It must not remain in "today review" as if another human
decision were still required.
