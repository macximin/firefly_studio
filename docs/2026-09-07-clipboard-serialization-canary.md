# Clipboard capture serialization canary — 2026-09-07

Scope: only Ego Copy → macOS pbpaste → verified file. No new planning generation, publication, Notion updates, or scheduler activation.

Implementation: scripts/planning-clipboard.py holds a shared flock across the complete Copy shell script, success confirmation, pbpaste, identity validation and exclusive output creation. On timeout, the Copy process group is killed before releasing the lock. Existing output is not overwritten. Workers must supply an exact expected file or two distinctive observed response anchors. docs/web-planning-worker.md routes final-response capture through this helper.

Actual operator: Grok CLI grok-4.6, dedicated Ego task space 20. Parent only supervised local evidence. Initial worker stalled on foreground test-server execution; stopped and restarted with a separately detached local fixture. This setup failure is retained in raw logs.

Evidence directory: .firefly/grok-clipboard-lock-canary-20260907/

- Two helper processes requested concurrently at 1788737394.9822772 and 1788737394.982599.
- B held capture interval 1788737394.9826188–1788737395.252342.
- A held capture interval 1788737395.302573–1788737395.606553.
- Intervals did not overlap. Each captured 120 UTF-8 bytes (72 characters), matching its separate DOM-observed source exactly.
- A SHA256: b04f4894f199a5a7ccc6d0db7123f809815a1ab237b62945ab1e1a625d4901d7
- B SHA256: 31d48953c1178286ae69a9f5c15d977e2acb452dfb084faf773a05c3bb62ca67
- Negative Copy script exited 1: failed receipt emitted, no negative.txt created.
- Parent independently checked both byte comparisons, receipt times, and negative output absence.

Result: the serialized capture component passes. This is a local controlled fixture canary; daily six-route execution and scheduler cutover are not tested by this run. A cooperative lock does not prevent a human or unrelated application from changing the OS clipboard; response identity checks remain required.
