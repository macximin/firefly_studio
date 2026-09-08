import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sealRunReceiptV2 } from "../scripts/dispatch-lib.mjs";
import {
  buildHermesInvocationReceipt,
  buildHermesControlPrompt,
  buildHistoricalHermesControlPromptV1,
  canonicalStringify,
  deriveAgentOperateSessionId,
  HERMES_CONTROL_QUERY,
  HERMES_CONTROL_TRANSPORT_POLICY,
  MAX_GUIDANCE_BYTES,
  parseHermesControlProposal,
  parseHermesControlSessionExport,
  resolveHermesControlRecoveryPrompt,
  sha256Bytes,
  validateAgentOperateModeEvidence,
  validateHermesInvocationReceipt,
  validateHermesRenderedControlStdout,
  validateHermesSessionExport,
} from "../scripts/hermes-control-lib.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const SHA = "a".repeat(64);

function validateWithSchema(schemaName, instance) {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "contracts", schemaName), "utf8"));
  const result = spawnSync("python3", ["-c", [
    "import json,sys",
    "from jsonschema import Draft202012Validator",
    "p=json.load(sys.stdin)",
    "Draft202012Validator.check_schema(p['schema'])",
    "print(json.dumps([e.message for e in Draft202012Validator(p['schema']).iter_errors(p['instance'])]))",
  ].join(";")], {
    input: JSON.stringify({ schema, instance }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function authorityFixture() {
  const profile = {
    profileId: "inkos_male_fantasy",
    soulId: "male-fantasy-ko",
    soulVersion: "v1",
    lifecycle: "candidate",
    productionEnabled: false,
    promotionDecisionSha256: null,
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    reasoning: "high",
    skillsPolicy: "none",
    configSha256: "a".repeat(64),
    soulSha256: "b".repeat(64),
  };
  const adoptionRegistryBytes = Buffer.from('{"schemaVersion":"genre-soul-adoption-registry/v1","active":[]}\n');
  return {
    profileRegistry: { schemaVersion: "hermes-production-profile-registry/v1", profiles: [profile] },
    profileRegistryBytes: Buffer.from("profile-registry"),
    adoptionRegistry: { schemaVersion: "genre-soul-adoption-registry/v1", active: [] },
    adoptionRegistryBytes,
    neutralRegistry: null,
    neutralRegistryBytes: null,
    profile,
  };
}

function canaryWorkOrder(authority, overrides = {}) {
  const workOrder = {
    schemaVersion: 2,
    workOrderId: "wo-agent-1",
    repo: "inkos",
    capability: "agent-operate",
    bookId: "demo-book",
    expectedSoulBinding: { soulId: authority.profile.soulId, soulVersion: authority.profile.soulVersion, bindingSha256: "d".repeat(64) },
    executionMode: "promotion-canary",
    modeEvidence: {
      lane: "genre-soul",
      profileId: authority.profile.profileId,
      profileConfigSha256: authority.profile.configSha256,
      profileLifecycle: "candidate",
      productionEnabled: false,
      adoptionRegistrySha256: digest(authority.adoptionRegistryBytes),
      activeMatchingCount: 0,
      soulId: authority.profile.soulId,
      soulVersion: authority.profile.soulVersion,
      soulSha256: authority.profile.soulSha256,
      promotionDecisionSha256: null,
      canaryIsolation: {
        pairId: "pair-hermes",
        path: ".inkos/canaries/pair-hermes/common-snapshot.json",
        sha256: "c".repeat(64),
        byteLength: 123,
        receiptSelfHash: "d".repeat(64),
        isolationScopeSha256: "e".repeat(64),
        commonSnapshotSha256: "f".repeat(64),
      },
    },
    runtime: { hermesProfile: authority.profile.profileId, model: "gpt-5.6-sol", reasoning: "high" },
    approvedInputs: [],
    ...overrides,
  };
  workOrder.sessionId = deriveAgentOperateSessionId(workOrder);
  return workOrder;
}

function schemaWorkOrder(authority = authorityFixture()) {
  const workOrder = canaryWorkOrder(authority, {
    idempotencyKey: "agent-schema",
    instruction: "다음 회차를 집필해.",
    args: { chapterCount: 1, targetLength: { count: 5500, unit: "ko-chars" } },
    approvalMode: "human",
    privateInputs: [],
    requestedAt: "2026-09-02T00:00:00.000Z",
  });
  workOrder.ownerDecision = {
    receiptId: "owner-schema",
    status: "approved",
    instructionSha256: SHA,
    argsSha256: SHA,
    decidedAt: "2026-09-02T00:00:00.000Z",
  };
  return workOrder;
}

const fileEvidence = (path) => ({ path, sha256: SHA, byteLength: 1 });
const canaryVerification = {
  schemaVersion: "inkos-canary-execution-root-verification/v1",
  scopeId: "canary-pair:pair-hermes:demo-book",
  pairId: "pair-hermes",
  bookId: "demo-book",
  lane: "soul",
  projectRoot: ".inkos/canaries/pair-hermes/soul",
  sourceProjectRootFingerprint: SHA,
  sourceBookManifestSha256: SHA,
  laneManifestSha256: SHA,
  receipt: { path: ".inkos/canaries/pair-hermes/common-snapshot.json", sha256: SHA, byteLength: 123, selfHash: SHA },
  isolationScopeSha256: SHA,
  commonSnapshotSha256: SHA,
  expectedSoulBinding: { soulId: "male-fantasy-ko", soulVersion: "v1", bindingSha256: SHA },
};

function succeededAgentReceipt() {
  return sealRunReceiptV2({
    schemaVersion: 2,
    receiptId: "rr-schema",
    workOrderId: "wo-agent-1",
    workOrderSha256: SHA,
    idempotencyKey: "agent-schema",
    repo: "inkos",
    capability: "agent-operate",
    status: "succeeded",
    mutating: true,
    startedAt: "2026-09-02T00:00:00.000Z",
    finishedAt: "2026-09-02T00:00:01.000Z",
    durationMs: 1000,
    control: { executionMode: "promotion-canary", lane: "genre-soul", modeEvidenceSha256: SHA, canaryIsolation: canaryVerification },
    approval: { required: true, status: "pending", ownerDecisionReceiptSha256: SHA },
    inputVerification: { approvedCount: 0, privateCount: 0, setSha256: SHA },
    child: {
      path: "edge_repos/inkos",
      branchBefore: "master",
      branchAfter: "master",
      headBefore: "b".repeat(40),
      headAfter: "b".repeat(40),
    },
    execution: {
      adapter: "inkos-cli-dual",
      exitCode: 0,
      signal: null,
      instructionTransport: "stdin-envelope",
      manifestCapabilitySha256: SHA,
      codeRepoPath: "edge_repos/inkos",
      executionRoot: "edge_repos/inkos/.inkos/canaries/pair-hermes/soul",
    },
    boundaryChecks: {
      trackedWorktreeUnchanged: true,
      artifactReportsValid: true,
      observationComplete: true,
      writesWithinDeclaredScopes: true,
      privateBodyExcluded: true,
      isolationReceiptVerified: true,
      executionRootIsolated: true,
      sourceSnapshotUnchanged: true,
      sourceBookBeforeSha256: SHA,
      sourceBookAfterSha256: SHA,
      sourceSnapshotBeforeSha256: SHA,
      sourceSnapshotAfterSha256: SHA,
    },
    observedWrites: { count: 4, setSha256: SHA },
    productionRun: {
      commandId: "cmd",
      productionOperationId: "op",
      attemptId: "attempt",
      path: "books/demo/story/runtime/run.json",
      sha256: SHA,
      executionStatus: "succeeded",
      approvalStatus: "pending",
      completionHealth: "verified",
      projectionOrigin: "direct",
    },
    effectiveRuntime: {
      hermesE2E: true,
      orchestrator: {
        hermesProfile: "inkos_male_fantasy",
        model: "gpt-5.6-sol",
        reasoning: "high",
        invoked: true,
        evidence: "verified-hermes-invocation-receipt",
        sessionId: "session-1",
        toolsCount: 0,
        toolCallCount: 0,
      },
      inkos: { configMode: "project", model: "gpt-5.6-sol", reasoning: "high" },
    },
    hermesInvocation: {
      schemaVersion: "hermes-invocation-receipt/v1",
      receiptSelfHash: SHA,
      sessionId: "session-1",
      evidence: {
        operationContract: fileEvidence(".firefly/hermes-requests/contract/AGENTS.md"),
        prepared: fileEvidence(".firefly/runs/run.hermes/prepared.json"),
        stdout: fileEvidence(".firefly/runs/run.hermes/stdout.txt"),
        stderr: fileEvidence(".firefly/runs/run.hermes/stderr.txt"),
        action: fileEvidence(".firefly/runs/run.hermes/action.json"),
        sessionExport: fileEvidence(".firefly/runs/run.hermes/session.jsonl"),
        sessionExportStderr: fileEvidence(".firefly/runs/run.hermes/session-export.stderr.txt"),
        receipt: fileEvidence(".firefly/runs/run.hermes/hermes-receipt.json"),
      },
    },
    agentOperation: {
      status: "succeeded",
      executionMode: "promotion-canary",
      canaryIsolation: canaryVerification,
      finalLaneManifestSha256: SHA,
      receipt: { path: "books/demo/story/runtime/hermes-control/wo-agent-1/terminal.json", sha256: SHA },
      importReceipt: { path: "books/demo/story/runtime/hermes-control/wo-agent-1/import-receipt.json", sha256: SHA },
      action: { path: "books/demo/story/runtime/hermes-control/wo-agent-1/action.json", sha256: SHA, textSha256: SHA },
      hermesReceipt: { path: "books/demo/story/runtime/hermes-control/wo-agent-1/hermes-invocation.json", sha256: SHA },
      terminal: { path: "books/demo/story/runtime/hermes-control/wo-agent-1/terminal.json", sha256: SHA, receiptSelfHash: SHA, status: "succeeded" },
      chapterCommit: { path: "books/demo/story/runtime/chapter-commits/op--receipt.json", sha256: SHA, receiptId: "receipt", receiptSelfHash: SHA, commitState: "verified" },
    },
    modelCalls: [{
      invocationId: "inv-1",
      agentName: "Writer",
      stage: "draft",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      receiptPath: "books/demo/receipt.json",
      receiptSha256: SHA,
      outcomePath: "books/demo/outcome.json",
      outcomeSha256: SHA,
      status: "completed",
    }],
    artifacts: [
      "hermes-control-action",
      "hermes-invocation-receipt",
      "agent-operation-receipt",
      "production-run",
    ].map((role) => ({ repo: "inkos", path: `books/demo/${role}.json`, sha256: SHA, role })),
    error: null,
    replayed: false,
  });
}

test("binds promotion-canary mode and deterministic session to exact registries", () => {
  const authority = authorityFixture();
  const workOrder = canaryWorkOrder(authority);
  assert.deepEqual(validateAgentOperateModeEvidence(workOrder, authority), []);
  assert.match(workOrder.sessionId, /^hq-agent-[0-9a-f]{40}$/);
  assert.equal(deriveAgentOperateSessionId(workOrder), workOrder.sessionId);
  const drift = structuredClone(workOrder);
  drift.modeEvidence.adoptionRegistrySha256 = "0".repeat(64);
  assert.ok(validateAgentOperateModeEvidence(drift, authority).some((error) => error.includes("registry hash mismatch")));
  const arbitrarySession = { ...workOrder, sessionId: "hq-agent-arbitrary" };
  assert.ok(validateAgentOperateModeEvidence(arbitrarySession, authority).some((error) => error.includes("deterministic")));
});

test("fails closed when a genre lane omits or mismatches the exact Soul binding", () => {
  const authority = authorityFixture();
  const valid = canaryWorkOrder(authority);
  assert.deepEqual(validateAgentOperateModeEvidence(valid, authority), []);

  const missing = { ...valid, expectedSoulBinding: null };
  missing.sessionId = deriveAgentOperateSessionId(missing);
  assert.ok(validateAgentOperateModeEvidence(missing, authority)
    .some((error) => error.includes("non-null expectedSoulBinding")));

  for (const [field, value] of [["soulId", "wrong-soul"], ["soulVersion", "wrong-version"]]) {
    const mismatch = structuredClone(valid);
    mismatch.expectedSoulBinding[field] = value;
    mismatch.sessionId = deriveAgentOperateSessionId(mismatch);
    assert.ok(validateAgentOperateModeEvidence(mismatch, authority)
      .some((error) => error.includes("must match modeEvidence Soul identity")));
  }
});

test("keeps the neutral executor Soul real while the Book binding remains null", () => {
  const authority = authorityFixture();
  const neutralProfile = {
    ...authority.profile,
    profileId: "inkos_neutral_baseline",
    soulId: "neutral-baseline-ko",
    lifecycle: "baseline",
    soulSha256: "f".repeat(64),
  };
  authority.neutralRegistry = { schemaVersion: "hermes-neutral-production-profile/v1", profile: neutralProfile };
  const workOrder = canaryWorkOrder(authority, {
    expectedSoulBinding: null,
    modeEvidence: {
      ...canaryWorkOrder(authority).modeEvidence,
      lane: "neutral-baseline",
      profileId: neutralProfile.profileId,
      profileLifecycle: "baseline",
      soulId: neutralProfile.soulId,
      soulVersion: neutralProfile.soulVersion,
      soulSha256: neutralProfile.soulSha256,
    },
    runtime: { hermesProfile: neutralProfile.profileId, model: "gpt-5.6-sol", reasoning: "high" },
  });
  workOrder.sessionId = deriveAgentOperateSessionId(workOrder);
  assert.deepEqual(validateAgentOperateModeEvidence(workOrder, authority), []);

  const boundNeutral = structuredClone(workOrder);
  boundNeutral.expectedSoulBinding = {
    soulId: neutralProfile.soulId,
    soulVersion: neutralProfile.soulVersion,
    bindingSha256: "9".repeat(64),
  };
  boundNeutral.sessionId = deriveAgentOperateSessionId(boundNeutral);
  assert.ok(validateAgentOperateModeEvidence(boundNeutral, authority)
    .some((error) => error.includes("expectedSoulBinding=null")));
});

test("WorkOrder schema requires a non-null genre binding and keeps neutral unbound", () => {
  const genre = schemaWorkOrder();
  assert.deepEqual(validateWithSchema("work-order-v2.schema.json", genre), []);

  const unboundGenre = structuredClone(genre);
  unboundGenre.expectedSoulBinding = null;
  unboundGenre.sessionId = deriveAgentOperateSessionId(unboundGenre);
  assert.notDeepEqual(validateWithSchema("work-order-v2.schema.json", unboundGenre), []);

  const neutral = structuredClone(genre);
  neutral.expectedSoulBinding = null;
  neutral.modeEvidence = {
    ...neutral.modeEvidence,
    lane: "neutral-baseline",
    profileId: "inkos_neutral_baseline",
    profileLifecycle: "baseline",
    soulId: "neutral-baseline-ko",
  };
  neutral.runtime.hermesProfile = neutral.modeEvidence.profileId;
  neutral.sessionId = deriveAgentOperateSessionId(neutral);
  assert.deepEqual(validateWithSchema("work-order-v2.schema.json", neutral), []);
});

test("RunReceipt schema accepts only semantically successful agent operation evidence", () => {
  const valid = succeededAgentReceipt();
  assert.deepEqual(validateWithSchema("run-receipt-v2.schema.json", valid), []);

  const mutations = [
    (receipt) => { receipt.hermesInvocation = { status: "needs-attention", evidence: { needsAttention: fileEvidence("needs-attention.json") } }; },
    (receipt) => { receipt.execution.exitCode = 1; },
    (receipt) => { receipt.execution.signal = "SIGTERM"; },
    (receipt) => { receipt.productionRun = null; },
    (receipt) => { receipt.productionRun.executionStatus = "failed"; },
    (receipt) => { receipt.productionRun.completionHealth = "needs-recovery"; },
    (receipt) => { receipt.modelCalls[0].agentName = "Auditor"; },
    (receipt) => { receipt.artifacts = receipt.artifacts.filter((artifact) => artifact.role !== "production-run"); },
    (receipt) => { receipt.error = { category: "unexpected", messageSha256: SHA }; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", invalid), []);
  }

  for (const field of ["finishedAt", "durationMs", "child", "execution", "boundaryChecks", "observedWrites"]) {
    const missing = structuredClone(valid);
    delete missing[field];
    assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", missing), [], field);
  }
  for (const field of ["trackedWorktreeUnchanged", "artifactReportsValid", "observationComplete", "writesWithinDeclaredScopes"]) {
    const failedBoundary = structuredClone(valid);
    failedBoundary.boundaryChecks[field] = false;
    assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", failedBoundary), [], field);
  }
  for (const role of valid.artifacts.map((artifact) => artifact.role)) {
    const missingRole = structuredClone(valid);
    missingRole.artifacts = missingRole.artifacts.filter((artifact) => artifact.role !== role);
    assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", missingRole), [], role);
  }
});

test("turns one identity-free v2 Hermes proposal into an exact host-owned canonical action", () => {
  const authority = authorityFixture();
  const workOrder = canaryWorkOrder(authority);
  const workOrderSha256 = "1".repeat(64);
  const proposal = {
    schemaVersion: "hermes-control-proposal/v2",
    action: "write-next",
    guidance: "다음 회차의 지급과 훅을 강화해.",
  };
  const parsed = parseHermesControlProposal(JSON.stringify(proposal), workOrder, workOrderSha256);
  assert.deepEqual(parsed.proposal, proposal);
  assert.deepEqual(parsed.action, {
    schemaVersion: "hermes-control-action/v1",
    action: "write-next",
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    guidance: proposal.guidance,
    guidanceSha256: digest(Buffer.from(proposal.guidance)),
  });
  assert.equal(parsed.action.schemaVersion, "hermes-control-action/v1");
  assert.equal(parsed.action.guidanceSha256, digest(Buffer.from(proposal.guidance)));
  assert.equal(parsed.actionBytes.toString("utf8"), canonicalStringify(parsed.action));
  assert.doesNotMatch(parsed.proposalBytes.toString("utf8"), /workOrderId|workOrderSha256|bookId|sessionId/u);
  for (const [key, value] of [
    ["workOrderId", workOrder.workOrderId],
    ["workOrderSha256", workOrderSha256],
    ["bookId", workOrder.bookId],
    ["sessionId", workOrder.sessionId],
    ["guidanceSha256", "0".repeat(64)],
  ]) assert.throws(
    () => parseHermesControlProposal(JSON.stringify({ ...proposal, [key]: value }), workOrder, workOrderSha256),
    /unknown field/,
  );
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify({ ...proposal, guidance: "x".repeat(MAX_GUIDANCE_BYTES + 1) }), workOrder, workOrderSha256),
    /32 KiB/,
  );
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify({ ...proposal, guidance: "bad\u0007guidance" }), workOrder, workOrderSha256),
    /control characters/,
  );
  assert.throws(
    () => parseHermesControlProposal(`${JSON.stringify(proposal)}${JSON.stringify(proposal)}`, workOrder, workOrderSha256),
    /not exactly one JSON object/,
  );
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify(proposal, null, 2), workOrder, workOrderSha256),
    /exactly one minified JSON object/u,
  );
  assert.throws(
    () => parseHermesControlProposal(` ${JSON.stringify(proposal)}\n`, workOrder, workOrderSha256),
    /leading or trailing whitespace/u,
  );
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify(proposal), { ...workOrder, workOrderId: "bad/id" }, workOrderSha256),
    /host action identity is invalid/u,
  );
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify(proposal), { ...workOrder, bookId: "../escape" }, workOrderSha256),
    /host action identity is invalid/u,
  );
});

test("keeps exact historical v1 proposal parsing only behind the recovery flag", () => {
  const authority = authorityFixture();
  const workOrder = canaryWorkOrder(authority);
  const workOrderSha256 = "9".repeat(64);
  const historical = {
    schemaVersion: "hermes-control-proposal/v1",
    action: "write-next",
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    guidance: "기존 완결 artifact를 정확히 복구해.",
  };
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify(historical), workOrder, workOrderSha256),
    /not accepted for a current invocation/u,
  );
  const parsed = parseHermesControlProposal(
    JSON.stringify(historical),
    workOrder,
    workOrderSha256,
    { allowHistoricalV1: true },
  );
  assert.equal(parsed.action.bookId, workOrder.bookId);
  assert.equal(parsed.action.sessionId, workOrder.sessionId);
  const operationPromptText = buildHistoricalHermesControlPromptV1(
    Buffer.from(JSON.stringify(workOrder), "utf8"),
    workOrderSha256,
  );
  const session = {
    id: "20260902_120000_historical_fixture",
    source: "tool",
    profile_name: authority.profile.profileId,
    model: "gpt-5.6-sol",
    model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }),
    system_prompt: operationPromptText,
    end_reason: "agent_close",
    ended_at: 1,
    message_count: 2,
    api_call_count: 1,
    tool_call_count: 0,
    messages: [
      { role: "user", content: HERMES_CONTROL_QUERY, tool_calls: [] },
      { role: "assistant", content: JSON.stringify(historical), finish_reason: "stop", tool_calls: [] },
    ],
  };
  const recovered = parseHermesControlSessionExport(Buffer.from(`${JSON.stringify(session)}\n`), {
    sessionId: session.id,
    profileId: session.profile_name,
    queryText: HERMES_CONTROL_QUERY,
    operationPromptText,
    promptSha256: digest(operationPromptText),
    processExitCode: 0,
    workOrder,
    workOrderSha256,
    allowHistoricalProposalV1: true,
  });
  assert.equal(recovered.parsedAction.action.workOrderId, workOrder.workOrderId);
  assert.throws(
    () => parseHermesControlProposal(
      JSON.stringify({ ...historical, bookId: "drifted-book" }),
      workOrder,
      workOrderSha256,
      { allowHistoricalV1: true },
    ),
    /Historical Hermes proposal Book\/session binding mismatch/u,
  );
});

test("prompts only for the minified identity-free v2 proposal", () => {
  const workOrderBytes = Buffer.from(JSON.stringify({ bookId: "한글-Book", sessionId: "host-session" }), "utf8");
  const prompt = buildHermesControlPrompt(workOrderBytes, "7".repeat(64));
  assert.match(prompt, /hermes-control-proposal\/v2/u);
  assert.match(prompt, /host injects authoritative identity/u);
  assert.doesNotMatch(prompt, /hermes-control-proposal\/v1/u);
  assert.doesNotMatch(prompt, /"workOrderId":string|"bookId":string|"sessionId":string/u);
});

test("recognizes only the exact current or historical operation contract during recovery", () => {
  const workOrderBytes = Buffer.from(JSON.stringify({ bookId: "한글-Book", sessionId: "host-session" }), "utf8");
  const workOrderSha256 = "7".repeat(64);
  const currentBytes = Buffer.from(buildHermesControlPrompt(workOrderBytes, workOrderSha256), "utf8");
  const historicalBytes = Buffer.from(buildHistoricalHermesControlPromptV1(workOrderBytes, workOrderSha256), "utf8");
  const current = resolveHermesControlRecoveryPrompt(currentBytes, workOrderBytes, workOrderSha256);
  const historical = resolveHermesControlRecoveryPrompt(historicalBytes, workOrderBytes, workOrderSha256);
  assert.equal(current.allowHistoricalProposalV1, false);
  assert.equal(current.promptBytes.equals(currentBytes), true);
  assert.equal(historical.allowHistoricalProposalV1, true);
  assert.equal(historical.promptBytes.equals(historicalBytes), true);
  assert.match(historical.promptBytes.toString("utf8"), /hermes-control-proposal\/v1/u);
  assert.throws(
    () => resolveHermesControlRecoveryPrompt(Buffer.from(`${historicalBytes.toString("utf8")}\n`), workOrderBytes, workOrderSha256),
    /does not match the WorkOrder/u,
  );
});

test("cross-binds the exported one-turn session to exact query, system contract, and raw proposal", () => {
  const operationPromptText = "FIREFLY_WORK_ORDER_SHA256=" + "2".repeat(64);
  const actionText = '{"schemaVersion":"hermes-control-proposal/v2"}';
  const session = {
    id: "20260902_120000_abcdef",
    source: "tool",
    profile_name: "inkos_male_fantasy",
    model: "gpt-5.6-sol",
    model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }),
    system_prompt: `prefix\n${operationPromptText}\nsuffix`,
    end_reason: "agent_close",
    ended_at: 1,
    message_count: 2,
    api_call_count: 1,
    tool_call_count: 0,
    messages: [
      { role: "user", content: HERMES_CONTROL_QUERY, tool_calls: [] },
      { role: "assistant", content: actionText, finish_reason: "stop", tool_calls: [] },
    ],
  };
  const bytes = Buffer.from(`${JSON.stringify(session)}\n`);
  const expected = {
    sessionId: session.id,
    profileId: session.profile_name,
    queryText: HERMES_CONTROL_QUERY,
    operationPromptText,
    promptSha256: digest(operationPromptText),
    actionText,
    actionSha256: digest(actionText),
  };
  assert.equal(validateHermesSessionExport(bytes, expected).id, session.id);
  const tampered = structuredClone(session);
  tampered.messages[1].content = "{}";
  assert.throws(() => validateHermesSessionExport(Buffer.from(`${JSON.stringify(tampered)}\n`), expected), /action mismatch/);
});

test("uses the exact exported assistant action when quiet Hermes leaks only its bound Reasoning UI", () => {
  const authority = authorityFixture();
  const workOrder = canaryWorkOrder(authority);
  const workOrderSha256 = "4".repeat(64);
  const operationPromptText = "FIREFLY_WORK_ORDER_SHA256=" + workOrderSha256;
  const proposalText = JSON.stringify({
    schemaVersion: "hermes-control-proposal/v2",
    action: "write-next",
    guidance: "다음 회차의 보상과 훅을 강화해.",
  });
  const reasoningText = [
    "**Decoding base64 bookId manually**",
    "**Planning next Book Arc Rail chapter review**",
    "**Finalizing precise chapter production guidance**",
  ].join("\n");
  const session = {
    id: "20260902_174445_05714b",
    source: "tool",
    profile_name: authority.profile.profileId,
    model: "gpt-5.6-sol",
    model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }),
    system_prompt: `prefix\n${operationPromptText}\nsuffix`,
    end_reason: null,
    ended_at: null,
    message_count: 2,
    api_call_count: 1,
    tool_call_count: 0,
    messages: [
      { role: "user", content: HERMES_CONTROL_QUERY, tool_calls: [] },
      { role: "assistant", content: proposalText, reasoning: reasoningText, finish_reason: "stop", tool_calls: [] },
    ],
  };
  const sessionBytes = Buffer.from(`${JSON.stringify(session)}\n`);
  const expected = {
    sessionId: session.id,
    profileId: session.profile_name,
    queryText: HERMES_CONTROL_QUERY,
    operationPromptText,
    promptSha256: digest(operationPromptText),
    processExitCode: 0,
    workOrder,
    workOrderSha256,
  };
  const parsed = parseHermesControlSessionExport(sessionBytes, expected);
  assert.equal(parsed.parsedAction.proposalBytes.toString("utf8"), proposalText);
  const noisyStdout = [
    "",
    "┌─ Reasoning ─────────────────────────────────────────────┐",
    "**Decoding base64 bookId manually****Planning next Book Arc Rail chapter review**",
    "**Finalizing precise chapter production guidance****Decoding base64 bookId manually**",
    proposalText,
    "",
  ].join("\r\n");
  assert.equal(validateHermesRenderedControlStdout(noisyStdout, {
    actionText: proposalText,
    reasoningText: parsed.reasoningText,
  }), true);

  const tirithDiagnostic = "⚠ tirith security scanner enabled but not available — command scanning will use pattern matching only";
  const tirithStdout = `\r\n\t \r\n  ${tirithDiagnostic}\r\n\r\n${noisyStdout}`;
  assert.equal(validateHermesRenderedControlStdout(tirithStdout, {
    actionText: proposalText,
    reasoningText: parsed.reasoningText,
  }), true);
  assert.equal(validateHermesRenderedControlStdout(`\t${tirithDiagnostic}\r\n${proposalText}\r\n`, {
    actionText: proposalText,
    reasoningText: "",
  }), true);
  for (const nonRendererWhitespace of ["\v", "\f", "\u00a0"]) {
    assert.throws(
      () => validateHermesRenderedControlStdout(`${nonRendererWhitespace}${proposalText}\n`, { actionText: proposalText, reasoningText: "" }),
      /unrecognized prefix/,
    );
    assert.throws(
      () => validateHermesRenderedControlStdout(`${proposalText}${nonRendererWhitespace}`, { actionText: proposalText, reasoningText: "" }),
      /does not end with/,
    );
  }

  // The v6 Hermes CLI output rendered the Reasoning panel header while
  // omitting its exported summary body. The exact session action is authoritative.
  const v6ReasoningHeader = `┌─ Reasoning ${"─".repeat(66)}┐`;
  const v6EmptyReasoningStdout = [
    "",
    v6ReasoningHeader,
    proposalText,
    "",
  ].join("\r\n");
  assert.equal(validateHermesRenderedControlStdout(v6EmptyReasoningStdout, {
    actionText: proposalText,
    reasoningText: "**Drafting chapter writing guidance**",
  }), true);
  assert.equal(validateHermesRenderedControlStdout(`┌─ Reasoning ───┐\n\t \n${proposalText}\n`, {
    actionText: proposalText,
    reasoningText: "",
  }), true);
  assert.equal(validateHermesRenderedControlStdout(`${tirithDiagnostic}\n┌─ Reasoning ───┐\n${proposalText}\n`, {
    actionText: proposalText,
    reasoningText: "**Drafting chapter writing guidance**",
  }), true);

  assert.throws(
    () => parseHermesControlSessionExport(sessionBytes, { ...expected, processExitCode: 1 }),
    /not bound to a successful CLI process/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`${noisyStdout.trimEnd()}\ntrailing text\n`, { actionText: proposalText, reasoningText }),
    /does not end with/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`┌─ Reasoning ───┐\n{"decoy":true}\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /JSON delimiters/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`┌─ Reasoning ───┐\n\u001b[2K\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /differs from exported reasoning/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`┌─ Reasoning ───┐\n**Different reasoning**\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /differs from exported reasoning/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`┌─ Reasoning ───┐\n┌─ Reasoning ───┐\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /differs from exported reasoning/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`\v┌─ Reasoning ───┐\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /unrecognized prefix/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`arbitrary prefix\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /unrecognized prefix/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`${tirithDiagnostic}\n${tirithDiagnostic}\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /multiple Tirith diagnostics/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout([
      tirithDiagnostic,
      "┌─ Reasoning ───┐",
      tirithDiagnostic,
      proposalText,
      "",
    ].join("\n"), { actionText: proposalText, reasoningText: tirithDiagnostic }),
    /multiple Tirith diagnostics/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout([
      "┌─ Reasoning ───┐",
      tirithDiagnostic,
      proposalText,
      "",
    ].join("\n"), { actionText: proposalText, reasoningText: tirithDiagnostic }),
    /not the first nonblank line/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`${tirithDiagnostic}!\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /unrecognized prefix/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`${tirithDiagnostic}\n┌─ Reasoning ───┐\n{"decoy":true}\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /JSON delimiters/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`${tirithDiagnostic}\n${proposalText}\ntrailing text\n`, { actionText: proposalText, reasoningText }),
    /does not end with/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`${tirithDiagnostic}\n${proposalText}\n${proposalText}\n`, { actionText: proposalText, reasoningText }),
    /multiple authoritative actions/,
  );
  assert.throws(
    () => validateHermesRenderedControlStdout(`┌─ Reasoning ───┐\n${proposalText.replace("write-next", "write-later")}\n`, { actionText: proposalText, reasoningText }),
    /does not end with/,
  );

  const multiJsonSession = structuredClone(session);
  multiJsonSession.messages[1].content = `${proposalText}\n{}`;
  assert.throws(
    () => parseHermesControlSessionExport(Buffer.from(`${JSON.stringify(multiJsonSession)}\n`), expected),
    /not exactly one JSON object/,
  );
});

test("self-hashes the bodyless Hermes receipt projection and binds raw output separately", () => {
  const authority = authorityFixture();
  const workOrder = canaryWorkOrder(authority);
  const guidance = "지급을 강화해.";
  const action = {
    schemaVersion: "hermes-control-action/v1",
    action: "write-next",
    workOrderId: workOrder.workOrderId,
    workOrderSha256: "3".repeat(64),
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    guidance,
    guidanceSha256: digest(guidance),
  };
  const receiptInput = {
    workOrder,
    workOrderSha256: action.workOrderSha256,
    profile: authority.profile,
    promptBytes: Buffer.from("operation contract"),
    systemPromptBytes: Buffer.from("system prompt"),
    rawOutputBytes: Buffer.from("raw proposal\n"),
    actionBytes: Buffer.from(canonicalStringify(action)),
    action,
    sessionId: "20260902_120000_abcdef",
    startedAt: "2026-09-02T03:00:00.000Z",
    completedAt: "2026-09-02T03:00:01.000Z",
    sessionExportBytes: Buffer.from("session export"),
  };
  const receipt = buildHermesInvocationReceipt(receiptInput);
  const { receiptSelfHash, ...projection } = receipt;
  assert.equal(receiptSelfHash, sha256Bytes(Buffer.from(canonicalStringify(projection))));
  assert.notEqual(receipt.rawOutput.sha256, receipt.action.sha256);
  assert.deepEqual(receipt.runtime.transportPolicy, HERMES_CONTROL_TRANSPORT_POLICY);

  const validationInput = {
    workOrder: receiptInput.workOrder,
    workOrderSha256: receiptInput.workOrderSha256,
    profile: receiptInput.profile,
    promptBytes: receiptInput.promptBytes,
    systemPromptBytes: receiptInput.systemPromptBytes,
    rawOutputBytes: receiptInput.rawOutputBytes,
    actionBytes: receiptInput.actionBytes,
    action: receiptInput.action,
    sessionId: receiptInput.sessionId,
    sessionExportBytes: receiptInput.sessionExportBytes,
  };
  const receiptBytes = Buffer.from(canonicalStringify(receipt), "utf8");
  assert.deepEqual(validateHermesInvocationReceipt(receiptBytes, validationInput), receipt);

  const historical = structuredClone(receipt);
  delete historical.runtime.transportPolicy;
  const { receiptSelfHash: _historicalSelf, ...historicalProjection } = historical;
  historical.receiptSelfHash = sha256Bytes(Buffer.from(canonicalStringify(historicalProjection), "utf8"));
  assert.deepEqual(
    validateHermesInvocationReceipt(Buffer.from(canonicalStringify(historical), "utf8"), validationInput),
    historical,
  );

  const opaqueBlindWorkOrder = structuredClone(receiptInput.workOrder);
  opaqueBlindWorkOrder.modeEvidence.canaryIsolation.pairId = "bp-0123456789abcdef01234567";
  assert.throws(
    () => validateHermesInvocationReceipt(
      Buffer.from(canonicalStringify(historical), "utf8"),
      { ...validationInput, workOrder: opaqueBlindWorkOrder },
    ),
    /requires transport policy attestation/u,
  );

  const tampered = structuredClone(receipt);
  tampered.runtime.transportPolicy.codexTtfbTimeoutSeconds = 1;
  const { receiptSelfHash: _tamperedSelf, ...tamperedProjection } = tampered;
  tampered.receiptSelfHash = sha256Bytes(Buffer.from(canonicalStringify(tamperedProjection), "utf8"));
  assert.throws(
    () => validateHermesInvocationReceipt(Buffer.from(canonicalStringify(tampered), "utf8"), validationInput),
    /does not match the exact invocation artifacts/u,
  );
});


test("Astra binds profile, WorkOrder, session export and receipt without reusing Sol session IDs", () => {
  const authority = authorityFixture();
  const solWorkOrder = canaryWorkOrder(authority);
  const historicalIdentity = { v: 1, bookId: solWorkOrder.bookId, lane: solWorkOrder.modeEvidence.lane, profileId: solWorkOrder.modeEvidence.profileId, soulId: solWorkOrder.modeEvidence.soulId, soulVersion: solWorkOrder.modeEvidence.soulVersion, bindingSha256: solWorkOrder.expectedSoulBinding.bindingSha256, isolationScopeSha256: solWorkOrder.modeEvidence.canaryIsolation.isolationScopeSha256 };
  assert.equal(solWorkOrder.sessionId, `hq-agent-${digest(canonicalStringify(historicalIdentity)).slice(0, 40)}`);
  authority.profile.model = "gpt-6-astra";
  const workOrder = canaryWorkOrder(authority, { runtime: { ...solWorkOrder.runtime, model: "gpt-6-astra" } });
  assert.notEqual(workOrder.sessionId, solWorkOrder.sessionId);
  assert.notEqual(deriveAgentOperateSessionId({ ...workOrder, modeEvidence: { ...workOrder.modeEvidence, profileConfigSha256: "f".repeat(64) } }), workOrder.sessionId);
  assert.deepEqual(validateAgentOperateModeEvidence(workOrder, authority), []);
  const mixed = structuredClone(workOrder);
  mixed.runtime.model = "gpt-5.6-sol";
  mixed.sessionId = deriveAgentOperateSessionId(mixed);
  assert.ok(validateAgentOperateModeEvidence(mixed, authority).some((error) => error.includes("bound profile model")));

  const session = { id: "astra-fixture", profile_name: authority.profile.profileId, source: "tool", model: "gpt-6-astra", model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }), system_prompt: "exact contract", end_reason: "agent_close", ended_at: 1, message_count: 2, api_call_count: 1, tool_call_count: 0, messages: [{ role: "user", content: "query" }, { role: "assistant", content: "action", finish_reason: "stop" }] };
  const expected = { workOrder, sessionId: session.id, profileId: authority.profile.profileId, queryText: "query", operationPromptText: "exact contract", promptSha256: digest("exact contract"), actionText: "action", actionSha256: digest("action") };
  const exportBytes = Buffer.from(JSON.stringify(session));
  assert.equal(validateHermesSessionExport(exportBytes, expected).model, "gpt-6-astra");
  assert.throws(() => validateHermesSessionExport(Buffer.from(JSON.stringify({ ...session, model: "gpt-5.6-sol" })), expected), /runtime identity mismatch/);
  const input = { workOrder, workOrderSha256: SHA, profile: authority.profile, promptBytes: Buffer.from("exact contract"), systemPromptBytes: Buffer.from("exact contract"), rawOutputBytes: Buffer.from("action"), actionBytes: Buffer.from("action"), action: { guidanceSha256: digest("action") }, sessionId: session.id, startedAt: "2026-09-05T00:00:00.000Z", completedAt: "2026-09-05T00:00:01.000Z", sessionExportBytes: exportBytes };
  const receipt = buildHermesInvocationReceipt(input);
  assert.equal(validateHermesInvocationReceipt(Buffer.from(canonicalStringify(receipt)), input).runtime.model, "gpt-6-astra");
  assert.throws(() => buildHermesInvocationReceipt({ ...input, workOrder: mixed }), /bound profile and WorkOrder exactly/);
  const wrong = { ...receipt, runtime: { ...receipt.runtime, model: "gpt-5.6-sol" } };
  const { receiptSelfHash: _hash, ...projection } = wrong;
  wrong.receiptSelfHash = digest(canonicalStringify(projection));
  assert.throws(() => validateHermesInvocationReceipt(Buffer.from(canonicalStringify(wrong)), input), /exact invocation artifacts/);
});
