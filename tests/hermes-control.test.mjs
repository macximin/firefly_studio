import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sealRunReceiptV2 } from "../scripts/dispatch-lib.mjs";
import {
  buildHermesInvocationReceipt,
  canonicalStringify,
  deriveAgentOperateSessionId,
  HERMES_CONTROL_QUERY,
  MAX_GUIDANCE_BYTES,
  parseHermesControlProposal,
  sha256Bytes,
  validateAgentOperateModeEvidence,
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

test("turns one strict Hermes proposal into a host-hashed canonical action", () => {
  const authority = authorityFixture();
  const workOrder = canaryWorkOrder(authority);
  const workOrderSha256 = "1".repeat(64);
  const proposal = {
    schemaVersion: "hermes-control-proposal/v1",
    action: "write-next",
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    guidance: "다음 회차의 지급과 훅을 강화해.",
  };
  const parsed = parseHermesControlProposal(JSON.stringify(proposal), workOrder, workOrderSha256);
  assert.equal(parsed.action.schemaVersion, "hermes-control-action/v1");
  assert.equal(parsed.action.guidanceSha256, digest(Buffer.from(proposal.guidance)));
  assert.equal(parsed.actionBytes.toString("utf8"), canonicalStringify(parsed.action));
  assert.throws(
    () => parseHermesControlProposal(JSON.stringify({ ...proposal, guidanceSha256: "0".repeat(64) }), workOrder, workOrderSha256),
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
});

test("cross-binds the exported one-turn session to exact query, system contract, and raw proposal", () => {
  const operationPromptText = "FIREFLY_WORK_ORDER_SHA256=" + "2".repeat(64);
  const actionText = '{"schemaVersion":"hermes-control-proposal/v1"}';
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
  const receipt = buildHermesInvocationReceipt({
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
  });
  const { receiptSelfHash, ...projection } = receipt;
  assert.equal(receiptSelfHash, sha256Bytes(Buffer.from(canonicalStringify(projection))));
  assert.notEqual(receipt.rawOutput.sha256, receipt.action.sha256);
});
