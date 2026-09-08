# Planning Entry HIL

> 2026-09-04 감사 결과: 아래 `chaebol-entry-hil-20260903-v1`의 구조적
> PASS는 창작 품질 PASS로 사용할 수 없다. 피치 런에 Reference Transformation
> Pack·원문 story index·문체 예문·장르 Soul이 결속되지 않았고, Entry Gate가
> 필드 존재와 복원 가능성만 검사해 `권리·계약·지분` 중심 후보를 통과시켰다.
> 두 후보는 승격 금지 상태로 보존하며, 후속 구현은
> [Pitch Human-Grounding P0 Recovery Plan](2026-09-04-pitch-human-grounding-p0-plan.md)을
> 따른다.

## Decision

Firefly production now stops before Book creation until a human selects a planning candidate. The admission order is:

Source-bound Human Premise 운영에서는 이 앞에
`premise-slate → premise-review → premise-export-storyyard → premise-decision → premise-expand`
가 온다. `premise-expand`는 선택 전제와 `firefly_spine_retention/v1`을 결속한
schema-v2 피치 슬레이트를 만들며, 이후 단계는 아래 기존 기획 HIL 경로를 그대로
재사용한다.

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
