# Ego control handoff diagnosis — 2026-09-07

## Conclusion

The user reports using a phone and not interacting with local Ego. Do not attribute this interruption to a deliberate user action. The installed active browser version is 0.4.7.4. Upstream issue #314 reports the same misleading control message on that version. A project issue comment explains that permission prompts and some JavaScript dialogs cause automatic handoff without a user gesture.

The leading hypothesis for this incident is a clipboard permission prompt. This is not yet a reproduced root cause: the local failing command combined task selection, Copy click, clipboard read, and a CDP query. Its output contains only the handoff message, so the exact failing operation cannot be established from that output.

## Local evidence

- Batch: `edge_repos/v3_ff_foundry/20_model_runs/multi_provider/sentinel-canary-20260907`.
- Gemini task space 18; conversation `https://gemini.google.com/app/cfe77123d9ab276b?hl=ko`.
- Before interruption: assistant DOM contained 8,423 characters, sections 1–9 and six tables; completion controls were visible. Full final Markdown was not saved.
- Failing Grok command: `call-c4921c9b-5c5c-4311-8951-474d735542cb-30`; terminal result was retrieved by `call-9d0bc826-eab9-4c05-90d6-bf91277788b4-31`.
- That command included `navigator.clipboard.readText()` after a Copy-button click. It returned the control-handoff warning, with exit code zero. Process exit alone is not successful extraction.
- Reviewed current ChatGPT/Grok/Gemini transport histories did not contain an executed handoff or takeover command before this failure. Other routes used separate task IDs. This does not prove absence of a native concurrency defect.
- Upstream runtime `output-sink.ts` discards buffered output when a hard stop occurs. Therefore missing intermediate logs do not prove which preceding operations did or did not run.

## Proposed repair and verification

1. Remove clipboard reads and Copy-button clicks from extraction. Read the visible assistant DOM through Ego, retain headings/tables when converting to Markdown, save the original DOM/text evidence first, and never ask Grok to reconstruct missing prose.
2. Make extraction a fixed service-specific operation; keep Grok responsible for bounded decisions and summaries. Persist conversation URL, input hash, response evidence and each completed stage before optional UI actions.
3. Serialize browser interaction as an initial reliability baseline; generation may continue server-side while another service is being handled. Public issue #213 reports concurrent CDP target races, but it is not proof of this incident's cause.
4. After explicit resume confirmation, recover the existing task space through the documented control API and extract the already-generated response. Do not resubmit the original prompt. A remaining permission sheet may still require attention; do not promise phone-only recovery before verification.
5. Verify the revised path with actual collection and Storyyard/Notion readback. Do not mark an uncollected response complete or claim unattended operation is stable based solely on process exit.
6. Preserve the real user-control stop. Do not install automatic takeover loops or globally change browser permissions as a workaround. An update alone is insufficient evidence of a fix: upstream says permission-prompt handoff remains even with planned JavaScript-alert improvements.

This investigation did not resume browser control, alter browser permissions, or change the scheduled production job.

## Authorized follow-up: clipboard recovery

The user subsequently authorized an Ego retry and Chrome fallback if the retry fails.

- Resumed Ego task 18 using the documented takeover API. The original Gemini conversation remained available.
- Opened Gemini site settings in the same space. Clipboard was visibly `요청(기본값)`; the actual select offered `allow`.
- Attempted selecting `allow`, followed by settings readback and a permission query in the Gemini tab. The combined command again ended with the user-control hard stop. Because output was discarded, neither persistence of the setting nor the exact triggering sub-operation is proven. Do not claim clipboard support is fundamentally absent.
- Used the expressly authorized Chrome fallback. The same existing Gemini conversation opened with login intact. No prompt was submitted again.
- Chrome Copy showed `클립보드에 복사됨`. The connector's browser-session clipboard returned empty, but macOS `pbpaste` returned the actual copied Markdown: 9,121 characters, SHA-256 `c2a83d56666055d706d6cf7edb5193c4cf33763bbfc60a9f9e0db60ee478ad16`.
- Saved unchanged copied text under the batch's `gemini-web/chrome-recovery/clipboard.md`; the format validator returned no issues. No model reconstructed or rewrote the text.
- Published a new immutable recovery card, retaining the original failure card: https://storyyard-wjjo.macximin11123.chatgpt.site/review/canary/fcp-465f426b5e123f61c40f50e4 . API readback matched the output hash.
- Updated the existing Notion execution row with recovery evidence: five format-complete responses, one format-incomplete response, zero uncollected responses. Original cycle receipt remains a historical snapshot from before recovery.
- Chrome recovery is verified; unattended Chrome transport integration and native production schedule cutover remain incomplete. A successful Codex-connected Chrome UI operation does not prove an independent launchd/Grok worker can use that same connection.

## Sources checked

### Subsequent isolated tests and verified recovery

- Grok alone created fresh task space 19; parent Codex performed zero Ego operations. Actual Copy/Paste passed using CDP's editor `Paste` command. `pressKey('Meta+v')` alone did not paste. The separate `navigator.clipboard.readText()` stage reproduced the handoff, so concurrent parent access is not necessary for the warning. Evidence: `.firefly/grok-ego-isolated-clipboard-20260907/supervisor-receipt.json`.
- After the user's explicit resume, Grok used Ego Copy followed by macOS `/usr/bin/pbpaste`. Test text matched the DOM-observed source exactly (48 bytes).
- The same worker then copied the existing Gemini response in Ego and saved it through `pbpaste`: 20,622 UTF-8 bytes, 9,121 characters, all nine sections. SHA-256 exactly matched the independently recovered Chrome file: `c2a83d56666055d706d6cf7edb5193c4cf33763bbfc60a9f9e0db60ee478ad16`.
- Evidence: `.firefly/grok-ego-pbpaste-20260907/receipt.json`, `gemini-receipt.json`, and `gemini-copied.md`. No regenerated or reconstructed prose. No new clipboard permission grant was needed for this successful Copy-to-system-pasteboard path.
- Decision: Ego remains viable for response collection. Prefer page Copy plus OS clipboard capture, without page-side clipboard reads. A production integration must serialize the Copy-through-capture interval because the system clipboard is shared, and verify captured content against the intended response before marking success. Full daily integration remains a separate outstanding verification.

- https://github.com/citrolabs/ego-lite/issues/314
- https://github.com/citrolabs/ego-lite/issues/314#issuecomment-5488782791
- https://github.com/citrolabs/ego-lite/issues/302#issuecomment-5488814895
- https://github.com/citrolabs/ego-lite/issues/213
- https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText
- Runtime source inspected at commit `5ca3c36cba2240b8df2e22ba32127747029039d5`: `package/ego-browser/src/ego-errors.ts` and `output-sink.ts`. This is upstream source, not a claim that the installed binary matches that exact commit.
