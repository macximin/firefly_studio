import assert from "node:assert/strict";
import test from "node:test";

import { HERMES_CONTROL_TRANSPORT_POLICY } from "../scripts/hermes-control-lib.mjs";
import { validateHermesInvocationTransportPolicy } from "../scripts/inkos-agent-terminal-verifier.mjs";

function historicalRuntime() {
  return {
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    reasoning: "high",
    platform: "cli",
    openaiRuntime: "auto",
    transport: "codex_responses",
    toolsCount: 0,
    toolCallCount: 0,
  };
}

test("terminal verifier accepts historical absence and the exact current Hermes transport policy", () => {
  assert.deepEqual(validateHermesInvocationTransportPolicy(historicalRuntime()), []);
  assert.deepEqual(validateHermesInvocationTransportPolicy({
    ...historicalRuntime(),
    transportPolicy: { ...HERMES_CONTROL_TRANSPORT_POLICY },
  }), []);
});

test("terminal verifier rejects recomputed-receipt policy value and key tampering", () => {
  const valueTamper = validateHermesInvocationTransportPolicy({
    ...historicalRuntime(),
    transportPolicy: { ...HERMES_CONTROL_TRANSPORT_POLICY, codexTtfbTimeoutSeconds: 1 },
  });
  assert.ok(valueTamper.includes("Hermes invocation transport policy mismatch"));

  const keyTamper = validateHermesInvocationTransportPolicy({
    ...historicalRuntime(),
    transportPolicy: { ...HERMES_CONTROL_TRANSPORT_POLICY, retries: 99 },
  });
  assert.ok(keyTamper.includes("Hermes invocation transport policy fields are not exact"));
});
