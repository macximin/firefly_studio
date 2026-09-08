# Hermes Astra reasoning update — 2026-09-07

Owner requested medium for the Firefly Hermes Astra routes listed in the conversation.

- Updated native Hermes configs for inkos_male_modern_fantasy, inkos_male_fantasy, inkos_male_murim, inkos_neutral_baseline and inkos_blind_evaluator from high to medium; model remains gpt-6-astra.
- Updated corresponding HQ registry values and config SHA256 bindings.
- Daily planning Astra command now requests medium explicitly.
- Runtime validation and WorkOrder/review/receipt schemas accept Astra medium while retaining historical high evidence. Legacy Sol medium remains rejected.
- Verified all five native profiles through the existing immutable config readback verifier. 48 related tests passed. Daily worker argv checked without invoking the model.
- No new generation or scheduler change. InkOS direct writer/reviewer model settings were not changed by this Hermes-only request. Existing immutable work orders/receipts retain their original settings and must not be relabeled.
