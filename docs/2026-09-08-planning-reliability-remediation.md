# Planning reliability remediation — 2026-09-08

Owner approved audit fixes and Kanban cleanup. No new six-route planning batch was generated.

Completed:
- Dedicated planning-astra.py uses the installed Hermes agent with document output and explicit medium; original -z path drops reasoning. Actual minimal ping preserved Markdown headers/tables and recorded ResponsesApiTransport request effort medium. Evidence: .firefly/astra-document-canary-20260908/.
- Scoped browser command guard rejects takeover helpers and persists browser-blocked.json. Fixed worker detects this marker and terminates the worker process group. Deterministic waiting emits compact status rather than repeated model-driven full snapshots. This is an operational guard, not an adversarial OS sandbox; workers are instructed not to bypass the scoped executable.
- HIL endpoint now reads original reviews and canary decisions with coverage/truncation flags. Live coverage is 14 rows; input preparation passed with 3 source references and exact HIL IDs/hashes.
- Format checks distinguish absent Markdown headers from absent six Ws. Two Astra responses were recovered by presentation-only transformation, preserving non-formatting character order. Both new packet hashes verified.
- Storyyard version 78 deployed successfully, commit 45d8d31acaabba6a209e46c09686ae76fa244887. Eight explicit historical failed/incomplete records archived; recovery links retained. Archive detail is read-only; old HIL/receipts retained. Live inventory reconciled to zero active failed/incomplete records. See .firefly/format-recovery-20260908/receipt.json and .firefly/daily-planning/cleanup-readback-20260908.json.
- Native LaunchAgent com.macximin.firefly-planning installed at 02:00. Exact --tick trigger tested: today's existing batch skipped without submission. Codex automation 2 verified PAUSED. General Hermes Sentinel remains unchanged.
- Existing Notion daily row received a recovery note; original execution counts and operational exception remain historical evidence.

Validation: 5 reliability tests (including actual worker termination on a simulated handoff), 4 daily-process tests, 13 Storyyard contract/archive tests, 5 native profile readbacks, successful site build/deployment, live API/HIL/input and native trigger checks.

Limits: Ego Storyyard is logged out; authenticated visual Kanban interaction was not verified. No new full six-route run after these changes; token savings and unattended end-to-end stability must be measured on the next scheduled run. Browser writer quotas/login remain external conditions. Recovery is not HIL adoption.
