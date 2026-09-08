import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sealRunReceiptV2, sha256Json } from "../scripts/dispatch-lib.mjs";
import { deriveAgentOperateSessionId } from "../scripts/hermes-control-lib.mjs";

const SHA = "a".repeat(64);
const sha = (value) => createHash("sha256").update(value).digest("hex");

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

function agentWorkOrder() {
  const instruction = "다음 회차를 집필해.";
  const args = { chapterCount: 1, targetLength: { count: 5500, unit: "ko-chars" } };
  const instructionSha256 = sha(instruction);
  const workOrder = {
    schemaVersion: 2,
    workOrderId: "wo-agent-schema",
    idempotencyKey: "agent-schema",
    repo: "inkos",
    capability: "agent-operate",
    bookId: "demo-book",
    instruction,
    args,
    expectedSoulBinding: { soulId: "male-fantasy-ko", soulVersion: "v1", bindingSha256: SHA },
    executionMode: "promotion-canary",
    modeEvidence: {
      lane: "genre-soul",
      profileId: "inkos_male_fantasy",
      profileConfigSha256: SHA,
      profileLifecycle: "candidate",
      productionEnabled: false,
      adoptionRegistrySha256: SHA,
      activeMatchingCount: 0,
      soulId: "male-fantasy-ko",
      soulVersion: "v1",
      soulSha256: SHA,
      promotionDecisionSha256: null,
      canaryIsolation: {
        pairId: "pair-schema",
        path: ".inkos/canaries/pair-schema/common-snapshot.json",
        sha256: SHA,
        byteLength: 1,
        receiptSelfHash: SHA,
        isolationScopeSha256: SHA,
        commonSnapshotSha256: SHA,
      },
    },
    runtime: { hermesProfile: "inkos_male_fantasy", model: "gpt-5.6-sol", reasoning: "high" },
    approvalMode: "human",
    approvedInputs: [],
    privateInputs: [],
    requestedAt: "2026-09-02T00:00:00.000Z",
  };
  workOrder.sessionId = deriveAgentOperateSessionId(workOrder);
  workOrder.ownerDecision = {
    receiptId: "owner-schema",
    status: "approved",
    instructionSha256,
    argsSha256: sha256Json({
      capability: workOrder.capability,
      bookId: workOrder.bookId,
      sessionId: workOrder.sessionId,
      args,
      expectedSoulBinding: workOrder.expectedSoulBinding,
      executionMode: workOrder.executionMode,
      modeEvidence: workOrder.modeEvidence,
      instructionSha256,
    }),
    decidedAt: "2026-09-02T00:00:00.000Z",
  };
  return workOrder;
}

const fileEvidence = (path) => ({ path, sha256: SHA, byteLength: 1 });
const canaryVerification = {
  schemaVersion: "inkos-canary-execution-root-verification/v1",
  scopeId: "canary-pair:pair-schema:demo-book",
  pairId: "pair-schema",
  bookId: "demo-book",
  lane: "soul",
  projectRoot: ".inkos/canaries/pair-schema/soul",
  sourceProjectRootFingerprint: SHA,
  sourceBookManifestSha256: SHA,
  laneManifestSha256: SHA,
  receipt: { path: ".inkos/canaries/pair-schema/common-snapshot.json", sha256: SHA, byteLength: 1, selfHash: SHA },
  isolationScopeSha256: SHA,
  commonSnapshotSha256: SHA,
  expectedSoulBinding: { soulId: "male-fantasy-ko", soulVersion: "v1", bindingSha256: SHA },
};

function agentReceipt() {
  return sealRunReceiptV2({
    schemaVersion: 2,
    receiptId: "rr-schema",
    workOrderId: "wo-agent-schema",
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
    child: { path: "edge_repos/inkos", branchBefore: "master", branchAfter: "master", headBefore: "b".repeat(40), headAfter: "b".repeat(40) },
    execution: { adapter: "inkos-cli-dual", exitCode: 0, signal: null, instructionTransport: "stdin-envelope", manifestCapabilitySha256: SHA, codeRepoPath: "edge_repos/inkos", executionRoot: "edge_repos/inkos/.inkos/canaries/pair-schema/soul" },
    boundaryChecks: {
      trackedWorktreeUnchanged: true, artifactReportsValid: true, observationComplete: true, writesWithinDeclaredScopes: true, privateBodyExcluded: true,
      isolationReceiptVerified: true, executionRootIsolated: true, sourceSnapshotUnchanged: true,
      sourceBookBeforeSha256: SHA, sourceBookAfterSha256: SHA, sourceSnapshotBeforeSha256: SHA, sourceSnapshotAfterSha256: SHA,
    },
    observedWrites: { count: 4, setSha256: SHA },
    productionRun: { commandId: "cmd", productionOperationId: "op", attemptId: "attempt", path: "books/demo/story/runtime/run.json", sha256: SHA, executionStatus: "succeeded", approvalStatus: "pending", completionHealth: "verified", projectionOrigin: "direct" },
    effectiveRuntime: {
      hermesE2E: true,
      orchestrator: { hermesProfile: "inkos_male_fantasy", model: "gpt-5.6-sol", reasoning: "high", invoked: true, evidence: "verified-hermes-invocation-receipt", sessionId: "session-1", toolsCount: 0, toolCallCount: 0 },
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
      receipt: { path: "books/demo/story/runtime/hermes-control/wo-agent-schema/terminal.json", sha256: SHA },
      importReceipt: { path: "books/demo/story/runtime/hermes-control/wo-agent-schema/import-receipt.json", sha256: SHA },
      action: { path: "books/demo/story/runtime/hermes-control/wo-agent-schema/action.json", sha256: SHA, textSha256: SHA },
      hermesReceipt: { path: "books/demo/story/runtime/hermes-control/wo-agent-schema/hermes-invocation.json", sha256: SHA },
      terminal: { path: "books/demo/story/runtime/hermes-control/wo-agent-schema/terminal.json", sha256: SHA, receiptSelfHash: SHA, status: "succeeded" },
      chapterCommit: { path: "books/demo/story/runtime/chapter-commits/op--receipt.json", sha256: SHA, receiptId: "receipt", receiptSelfHash: SHA, commitState: "verified" },
    },
    modelCalls: [{ invocationId: "inv-1", agentName: "Writer", stage: "draft", model: "gpt-5.6-sol", reasoningEffort: "high", receiptPath: "books/demo/receipt.json", receiptSha256: SHA, outcomePath: "books/demo/outcome.json", outcomeSha256: SHA, status: "completed" }],
    artifacts: ["hermes-control-action", "hermes-invocation-receipt", "agent-operation-receipt", "production-run"].map((role) => ({ repo: "inkos", path: `books/demo/${role}.json`, sha256: SHA, role })),
    error: null,
    replayed: false,
  });
}

test("WorkOrder v2 schema accepts the strict canary union and rejects mode drift", () => {
  const valid = agentWorkOrder();
  assert.deepEqual(validateWithSchema("work-order-v2.schema.json", valid), []);
  const wrongMode = structuredClone(valid);
  wrongMode.modeEvidence.profileLifecycle = "promoted";
  wrongMode.modeEvidence.productionEnabled = true;
  wrongMode.modeEvidence.activeMatchingCount = 1;
  wrongMode.modeEvidence.promotionDecisionSha256 = SHA;
  assert.notDeepEqual(validateWithSchema("work-order-v2.schema.json", wrongMode), []);
  const missingPrivate = structuredClone(valid);
  delete missingPrivate.privateInputs;
  assert.notDeepEqual(validateWithSchema("work-order-v2.schema.json", missingPrivate), []);
  for (const unsafeBookId of [
    " demo-book", "demo-book ", "\uFEFFdemo-book", "demo..book", "demo:book", "demo\nbook", 'demo"book', "a".repeat(121),
  ]) {
    const unsafe = structuredClone(valid);
    unsafe.bookId = unsafeBookId;
    assert.notDeepEqual(validateWithSchema("work-order-v2.schema.json", unsafe), [], JSON.stringify(unsafeBookId));
  }
});

test("RunReceipt v2 schema keeps agent success bodyless and runtime strict", () => {
  const valid = agentReceipt();
  assert.deepEqual(validateWithSchema("run-receipt-v2.schema.json", valid), []);
  assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", { ...valid, instruction: "private body" }), []);
  const drift = structuredClone(valid);
  drift.effectiveRuntime.inkos.model = "gpt-5.6-terra";
  drift.modelCalls[0].status = "failed";
  delete drift.hermesInvocation.evidence.action;
  assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", drift), []);
  const finalManifestMissing = structuredClone(valid);
  finalManifestMissing.agentOperation.finalLaneManifestSha256 = null;
  assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", finalManifestMissing), []);
  const isolationBoundaryFailed = structuredClone(valid);
  isolationBoundaryFailed.boundaryChecks.executionRootIsolated = false;
  assert.notDeepEqual(validateWithSchema("run-receipt-v2.schema.json", isolationBoundaryFailed), []);
});


test("WorkOrder and RunReceipt schemas preserve Sol and admit Astra high/medium evidence", () => {
  const workOrder = agentWorkOrder();
  workOrder.runtime.model = "gpt-6-astra";
  assert.deepEqual(validateWithSchema("work-order-v2.schema.json", workOrder), []);
  const receipt = agentReceipt();
  receipt.effectiveRuntime.orchestrator.model = "gpt-6-astra";
  receipt.effectiveRuntime.inkos.model = "gpt-6-astra";
  receipt.modelCalls[0].model = "gpt-6-astra";
  assert.deepEqual(validateWithSchema("run-receipt-v2.schema.json", receipt), []);
  workOrder.runtime.reasoning = "medium";
  assert.deepEqual(validateWithSchema("work-order-v2.schema.json", workOrder), []);
  receipt.effectiveRuntime.orchestrator.reasoning = "medium";
  receipt.effectiveRuntime.inkos.reasoning = "medium";
  receipt.modelCalls[0].reasoningEffort = "medium";
  assert.deepEqual(validateWithSchema("run-receipt-v2.schema.json", receipt), []);
  workOrder.runtime.model = "gpt-5.6-sol";
  assert.notDeepEqual(validateWithSchema("work-order-v2.schema.json", workOrder), []);
});
