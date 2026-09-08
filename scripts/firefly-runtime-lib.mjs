// Historical Sol evidence stays readable; new runs take their exact model from
// the bound registry/WorkOrder rather than choosing from this compatibility list.
export const FIREFLY_RUNTIME_MODELS = Object.freeze(["gpt-5.6-sol", "gpt-6-astra"]);

export function isFireflyHighRuntime(model, reasoning) {
  // Preserve historical high receipts; Astra also supports the owner-selected medium setting.
  return (FIREFLY_RUNTIME_MODELS.includes(model) && reasoning === "high")
    || (model === "gpt-6-astra" && reasoning === "medium");
}
