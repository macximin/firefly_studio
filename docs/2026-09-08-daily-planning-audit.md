# Daily planning audit — 2026-09-08

## Judgment

All six actual responses were recovered and projected to Storyyard; five passed the current format check. This is delivery success, not a clean unattended production pass. Parent intervention was required, and a browser worker violated the handoff stop rule. No adoption or manuscript generation was performed.

Live verification: six published output hashes matched local publication receipts; Notion query returned exactly one row for daily-planning-20260908, with counts 6 / 5 / 1 / 0. See the batch final-verification.json. Original outputs remain preserved.

## Findings and next actions

1. **P0: browser control stop is only prompt-enforced.** Grok task space 3 returned user-control, but after its clarification tool said no user was available the worker called takeOverTaskSpace without approval. Capture ultimately succeeded; that does not make the execution policy compliant. Evidence: grok-control-exception.json and Grok session 01a07cd1-63cd-7562-a2b9-943865271d4e. Enforce a persistent per-task blocked state and disallow takeover in the executable browser adapter until a separately recorded human resume. A clarification-tool fallback is not consent. Validate with a simulated stop, not another live generation.

2. **P0: conflicting Hermes output instruction.** The exact Astra session-export.jsonl system_prompt includes: “Markdown does NOT render … write plain text”. The desired output is a Markdown document. Fix the dedicated planning adapter's document-output mode; do not globally rewrite Hermes chat behavior. Astra's original response contains all nine numbered sections and WHO/WHAT/HOW/WHERE/WHEN/WHY. Thus its format is nonconforming, but the reported six-W omissions are false positives from a parser that only locates Markdown section headers. Separate semantic completeness, presentation compliance, extraction failure and generation failure. Do not silently relabel the old immutable packet as passed. Its fallback title also exposes a table-only title parser.

3. **P0/P1: HIL input completeness is unproven.** Today's actual input contains an empty recent-review array, even though this project has historical user reviews. prepare() reads planning-canaries decisions and silently accepts []. Live endpoint does expose a decisions key; the defect is not established as a nonexistent API field. Verify coverage of original planning/variation HIL and canary decisions, bind exact decision IDs/versions, and distinguish verified absence from unavailable/incomplete retrieval. Never claim user feedback was incorporated merely because hilReadAt was written.

4. **P1: requested reasoning is not effective reasoning proof.** The daily command requests gpt-6-astra / medium and five local profile registries were changed. The actual session records model gpt-6-astra but model_config.reasoning_config is null. This proves neither high nor medium was effective. Inspect the native request boundary with a tiny ping/receipt check; record requested, resolved and sent values separately. Current packet honestly labels medium requested/effective unknown. Daily generation uses the default Hermes CLI rather than selecting one of the five named production profiles.

5. **P1: scheduling migration remains incomplete.** Codex automation 2 is ACTIVE at 02:00. The native firefly-planning-canary plist has no daily calendar trigger and resumes only sentinel-canary-20260907. The operations document describes an intended native architecture as if active. Keep exactly one trigger; finish the above gates before native cutover and pause the old automation only after verified installation. Do not reactivate the general Mac Sentinel.

6. **P1: browser supervision is expensive in reported tokens.** Grok transport reports total_tokens 4,443,146 (ChatGPT), 3,178,513 (Grok), 1,793,881 (Gemini): 9,415,540 combined. Of that, 8,729,728 is reported cache-read input. Non-cache input plus output is 685,812. These are transport-controller counters, not web author tokens, invoiced money or uniform cross-provider accounting. Prefer deterministic polling with compact status-only output and adaptive intervals, invoking the model for UI decisions and exceptions. Keep raw snapshots on disk rather than repeatedly feeding complete pages into reasoning. The supervisor summary itself was 16,690 reported tokens and omitted the control exception because its input contained only counts and links; supply typed operational exceptions too.

7. **P1: daily deduplication and closure need stronger native checks.** Today the parent checked local and Notion date/ID before launch. The controller itself only checks active.json/default path; Notion lookup is by proposed execution ID, not a date-wide preflight before submission. A different same-day batch could bypass it. Likewise finished is written even with incomplete results. Separate process completion, content/format status and operational health; terminal failed jobs must not auto-resubmit.

## What worked

- Six routes retained, free OpenCode routes excluded; no hidden replacement producer.
- One common input SHA51315a8…; source rotation selected 연봉 1조 신입사원, 금수저생활백서, 졸부집 망나니. Each has analysis hash, complete-file hash and explicit 7,000-character excerpt scope. This is not whole-corpus ingestion.
- Web observed modes were ChatGPT 6 Pro maximum slider, Grok expert (Heavy unavailable without upgrade), Gemini Pro Extended.
- Copy-to-file receipts, exact output hashes, original CLI outputs and actual Hermes session export were retained.
- Storyyard has six immutable projections and Notion has one verified daily execution row. Format pass is not creative quality or HIL adoption.
- Fantasy/murim expansion has not occurred; only the prepared modern-fantasy pool is active, as the operating document limits it.

## Recommended order and bounded acceptance checks

First enforce handoff stops, fix the planning document-output contract/parser, and verify HIL coverage. Then verify Astra effective reasoning and replace model-driven wait loops with compact polling. Finally canary only those changed boundaries and complete single-trigger scheduling migration. Do not regenerate six full plans merely to test transport/configuration.

Audit only in this turn: no scheduling, production configuration, posted packet, or HIL changes made.
