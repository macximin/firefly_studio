# Planning Entry HIL

## Decision

Firefly production now stops before Book creation until a human selects a planning candidate. The admission order is:

1. HQ dispatches `pitch-slate` to InkOS with verified Reference Lab inputs.
2. InkOS creates non-canonical candidates. Every candidate must define human desire, immediate situation, Series/Arc/Chapter purpose, repeatable reader fantasy, and first visible payment.
3. HQ dispatches `pitch-review`. A separate review pass reconstructs those fields and records an Entry Gate. A failed gate cannot receive `SURVIVE`.
4. HQ dispatches `pitch-export-storyyard`. InkOS emits an immutable `firefly_review_packet/v3` with `manuscriptApply: false`.
5. Storyyard shows the candidates and records only `select`, `hold`, or `reject` as a pending human decision.
6. Work stops here. Only a later, hash-bound InkOS decision/promotion may create a planning Book. Drafting remains blocked until the promoted Book carries a matching approved `story/entry-contract.json`.

Storyyard never writes InkOS canon directly. Reference Lab remains an evidence source, not a production decision maker.

## Current HIL checkpoint

- Slate: `chaebol-entry-hil-20260903-v1`
- Candidates: 2
- Independent result: `p01` SURVIVE (90), `p02` HOLD (82)
- Both Entry Gates: PASS
- Storyyard packet: `frp-984253c92d9b3bd1fb06c976`
- Human decision: pending
- Book, Arc, chapter manuscript: not created

## Resume after the owner decides

1. Read the pending Storyyard decision and verify packet, candidate, and decision hashes.
2. Dispatch InkOS `pitch-decision` with the exact selected candidate and owner comment.
3. If and only if the decision is `select`, dispatch `pitch-promote` with a new Book ID.
4. Confirm the Book has `writing.entryContractPolicy: auto-required` and an approved, hash-bound `story/entry-contract.json`.
5. Do not start `/write` until Arc/Rail planning is populated and separately accepted where required.

`hold` and `reject` do not authorize Book creation or manuscript generation.
