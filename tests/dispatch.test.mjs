import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildDispatchPlan,
  executeWorkOrder,
  publicDispatchPlan,
  sha256Json,
  validateCapabilityArtifacts,
  validateChildArtifacts,
  validatePitchSlateData,
  validatePitchSurvivalReviewData,
  verifyApprovedInputs,
  verifyPrivateInputs,
  validateWorkOrder,
} from "../scripts/dispatch-lib.mjs";

function manifestFixture(remoteUrl = "git@example.invalid:owner/inkos.git") {
  return {
    schemaVersion: 2,
    family: "firefly-studio",
    policy: {
      routingInputs: ["inkos"],
      defaultProductionEngine: "inkos",
    },
    repos: [{
      name: "inkos",
      path: "edge_repos/inkos",
      remoteUrl,
      branch: "master",
      managementState: "active",
      adoptionState: "ready",
      pullAllowed: true,
      writeAllowed: true,
      role: "writer",
      execution: {
        kind: "worker",
        adapter: "inkos-cli-dual",
        entrypoint: "packages/cli/dist/index.js",
        receiptContract: "run-receipt/dual",
        writeScopes: ["books/", ".inkos/"],
        observationScopes: ["books/", ".inkos/", "worlds/", "interactive-films/", "inkos.json"],
        capabilities: [
          { name: "status", mode: "read-only", approval: "none" },
          { name: "interact", mode: "mutating", approval: "human" },
          { name: "write-next", mode: "mutating", approval: "human" },
          { name: "reference-bind", mode: "mutating", approval: "human" },
          { name: "pitch-slate", mode: "mutating", approval: "human" },
          { name: "pitch-review", mode: "mutating", approval: "human" },
          { name: "pitch-decision", mode: "mutating", approval: "human" },
          { name: "pitch-promote", mode: "mutating", approval: "human" },
        ],
      },
    }, {
      name: "firefly_reference_lab",
      path: "edge_repos/firefly_reference_lab",
      remoteUrl: "git@example.invalid:owner/firefly_reference_lab.git",
      branch: "main",
      managementState: "active",
      adoptionState: "ready",
      pullAllowed: true,
      writeAllowed: true,
      role: "reference library",
      execution: { kind: "library", capabilities: [] },
    }],
  };
}

function statusWorkOrder(overrides = {}) {
  return {
    schemaVersion: 1,
    workOrderId: "wo-status-1",
    idempotencyKey: "status-1",
    repo: "inkos",
    capability: "status",
    bookId: "demo-book",
    approvalMode: "none",
    approvedInputs: [],
    requestedAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

function writeNextV2WorkOrder(overrides = {}) {
  const instruction = overrides.instruction ?? "상업성 우선으로 다음 회차를 집필해.";
  const args = overrides.args ?? { chapterCount: 1, targetLength: { count: 5500, unit: "ko-chars" } };
  const instructionSha256 = createHash("sha256").update(Buffer.from(instruction, "utf8")).digest("hex");
  const base = {
    schemaVersion: 2,
    workOrderId: "wo-write-next-v2-1",
    idempotencyKey: "write-next-v2-1",
    repo: "inkos",
    capability: "write-next",
    bookId: "demo-book",
    sessionId: "hq-demo-book",
    instruction,
    args,
    expectedSoulBinding: null,
    ownerDecision: {
      receiptId: "owner-decision-1",
      status: "approved",
      instructionSha256,
      argsSha256: sha256Json({ capability: "write-next", bookId: "demo-book", sessionId: "hq-demo-book", args, expectedSoulBinding: null, instructionSha256 }),
      decidedAt: "2026-08-28T00:00:00.000Z",
    },
    runtime: { hermesProfile: "male-modern-fantasy-ko", model: "gpt-5.6-sol", reasoning: "high" },
    approvalMode: "human",
    approvedInputs: [],
    privateInputs: [],
    requestedAt: "2026-08-28T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function pitchSlateWorkOrder(overrides = {}) {
  return statusWorkOrder({
    workOrderId: "wo-pitch-slate-1",
    idempotencyKey: "pitch-slate-1",
    capability: "pitch-slate",
    bookId: undefined,
    slateId: "chaebol-canary",
    candidateCount: 10,
    instruction: "현대판타지 재벌물 후보를 상업성 최우선으로 설계해.",
    approvalMode: "human",
    approvedInputs: [{
      repo: "firefly_reference_lab",
      commit: "b".repeat(40),
      path: "analyses/doksik-chaebol3/gold_reference_card.md",
      sha256: "c".repeat(64),
      role: "pitch-reference-pack",
    }],
    ...overrides,
  });
}

function pitchReviewWorkOrder(overrides = {}) {
  return statusWorkOrder({
    workOrderId: "wo-pitch-review-1",
    idempotencyKey: "pitch-review-1",
    capability: "pitch-review",
    bookId: undefined,
    slateId: "chaebol-canary",
    approvalMode: "human",
    approvedInputs: [],
    ...overrides,
  });
}

function pitchDecisionWorkOrder(overrides = {}) {
  return statusWorkOrder({
    workOrderId: "wo-pitch-decision-1",
    idempotencyKey: "pitch-decision-1",
    capability: "pitch-decision",
    bookId: undefined,
    slateId: "chaebol-canary",
    candidateId: "p02",
    humanDecision: "select",
    approvalMode: "human",
    approvedInputs: [],
    ...overrides,
  });
}

function pitchPromoteWorkOrder(overrides = {}) {
  return statusWorkOrder({
    workOrderId: "wo-pitch-promote-1",
    idempotencyKey: "pitch-promote-1",
    capability: "pitch-promote",
    bookId: "selected-chaebol",
    slateId: "chaebol-canary",
    approvalMode: "human",
    approvedInputs: [],
    ...overrides,
  });
}

test("preserves the Phase 0 v1 WorkOrder through the dual adapter", async () => {
  const fixture = JSON.parse(await readFile(join(
    process.cwd(),
    "tests/fixtures/production-kernel-phase0-hq-v1.json",
  ), "utf8"));
  const { expected, ...workOrder } = fixture;
  const manifest = JSON.parse(await readFile(join(process.cwd(), "config/edge-repos.json"), "utf8"));
  const inkos = manifest.repos.find((repo) => repo.name === "inkos");

  assert.ok(inkos, "InkOS must remain registered in the canonical HQ manifest");
  assert.equal(inkos.branch, expected.branch);
  assert.equal(inkos.execution.adapter, expected.adapter);
  assert.equal(inkos.execution.receiptContract, expected.receiptContract);
  assert.deepEqual(validateWorkOrder(workOrder, manifest), []);

  const capability = inkos.execution.capabilities.find((entry) => entry.name === workOrder.capability);
  assert.deepEqual(capability, {
    name: workOrder.capability,
    mode: expected.capabilityMode,
    approval: expected.capabilityApproval,
  });
  const plan = buildDispatchPlan({ root: process.cwd(), manifest, workOrder });
  assert.equal(plan.repo.execution.adapter, expected.adapter);
  assert.equal(plan.repo.execution.receiptContract, expected.receiptContract);
  assert.deepEqual(plan.invocation.args.slice(1, 2), ["status"]);
});

test("routes strict WorkOrder v2 to the bodyless ProductionCommand adapter", () => {
  const workOrder = writeNextV2WorkOrder();
  const manifest = manifestFixture();
  assert.deepEqual(validateWorkOrder(workOrder, manifest), []);
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest, workOrder });
  assert.deepEqual(plan.invocation.args.slice(1, 3), ["production", "write-next"]);
  assert.equal(plan.invocation.args.filter((arg) => arg === "--work-order-sha").length, 1);
  assert.equal(plan.invocation.args[plan.invocation.args.indexOf("--work-order-sha") + 1], plan.invocation.workOrderSha256);
  assert.equal(plan.invocation.args.includes(workOrder.instruction), false);
  assert.equal(plan.invocation.stdin.includes(workOrder.instruction), true);
  assert.equal(createHash("sha256").update(plan.invocation.stdin).digest("hex"), plan.invocation.workOrderSha256);
});

test("rejects WorkOrder v2 owner-decision or batch drift before dispatch", () => {
  const manifest = manifestFixture();
  const hashDrift = writeNextV2WorkOrder({
    ownerDecision: {
      receiptId: "owner-decision-1",
      status: "approved",
      instructionSha256: "a".repeat(64),
      argsSha256: "b".repeat(64),
      decidedAt: "2026-08-28T00:00:00.000Z",
    },
  });
  assert.ok(validateWorkOrder(hashDrift, manifest).some((error) => error.includes("hash mismatch")));
  const batch = writeNextV2WorkOrder({ args: { chapterCount: 2 } });
  assert.ok(validateWorkOrder(batch, manifest).some((error) => error.includes("chapterCount=1")));
  assert.ok(validateWorkOrder(writeNextV2WorkOrder({ bookId: "../escape" }), manifest)
    .some((error) => error.includes("safe path segment")));
  assert.ok(validateWorkOrder(writeNextV2WorkOrder({ approvedInputs: [{ role: "unused" }] }), manifest)
    .some((error) => error.includes("unbound approvedInputs")));
  assert.ok(validateWorkOrder(writeNextV2WorkOrder({ expectedSoulBinding: undefined }), manifest)
    .some((error) => error.includes("expectedSoulBinding is required")));
});

test("executes WorkOrder v2 with verified child evidence and persists a bodyless receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-dispatch-v2-"));
  const repoPath = join(root, "edge_repos", "inkos");
  const cliPath = join(repoPath, "packages", "cli", "dist", "index.js");
  const remoteUrl = "git@example.invalid:owner/inkos.git";
  try {
    await mkdir(join(repoPath, "packages", "cli", "dist"), { recursive: true });
    await writeFile(cliPath, "// fixture entrypoint\n", "utf8");
    await writeFile(join(repoPath, ".gitignore"), "books/\n", "utf8");
    execFileSync("git", ["init", "-b", "master"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "dispatch@example.invalid"], { cwd: repoPath });
    execFileSync("git", ["config", "user.name", "Dispatch Test"], { cwd: repoPath });
    execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: repoPath });
    execFileSync("git", ["add", "packages/cli/dist/index.js", ".gitignore"], { cwd: repoPath });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: repoPath, stdio: "ignore" });

    const workOrder = writeNextV2WorkOrder();
    const manifest = manifestFixture(remoteUrl);
    const plan = buildDispatchPlan({ root, manifest, workOrder });
    const runPath = "books/demo-book/story/runtime/production-runs/terminals/cmd-1.json";
    const receiptPath = "books/demo-book/story/runtime/fiction-content-neutral/receipts/inv-1.json";
    const outcomePath = "books/demo-book/story/runtime/fiction-content-neutral/outcomes/inv-1.json";
    const run = {
      schemaVersion: "production-run/v1",
      command: { commandId: "cmd-1" },
      productionAttempt: { productionOperationId: "prod-1", attemptId: "attempt-1" },
      executionStatus: "succeeded",
      approvalStatus: "pending",
      completionHealth: "verified",
      projectionOrigin: "direct",
    };
    const modelReceipt = {
      invocationId: "inv-1",
      agentName: "writer",
      stage: "chapter-draft",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      productionOperationId: "prod-1",
      attemptId: "attempt-1",
    };
    const modelOutcome = {
      invocationId: "inv-1",
      status: "completed",
      productionOperationId: "prod-1",
      attemptId: "attempt-1",
    };
    for (const [path, value] of [[runPath, run], [receiptPath, modelReceipt], [outcomePath, modelOutcome]]) {
      await mkdir(join(repoPath, path, ".."), { recursive: true });
      await writeFile(join(repoPath, path), `${JSON.stringify(value)}\n`, "utf8");
    }
    const fileSha = async (path) => createHash("sha256").update(await readFile(join(repoPath, path))).digest("hex");
    const result = {
      schemaVersion: "inkos-production-result/v2",
      workOrder: { id: workOrder.workOrderId, sha256: plan.invocation.workOrderSha256 },
      productionRun: {
        commandId: "cmd-1",
        productionOperationId: "prod-1",
        attemptId: "attempt-1",
        path: runPath,
        sha256: await fileSha(runPath),
        executionStatus: "succeeded",
        approvalStatus: "pending",
        completionHealth: "verified",
        projectionOrigin: "direct",
      },
      effectiveRuntime: {
        orchestrator: workOrder.runtime,
        inkos: { configMode: "project", model: "gpt-5.6-sol", reasoning: "high" },
      },
      modelCalls: [{
        invocationId: "inv-1",
        agentName: "writer",
        stage: "chapter-draft",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        status: "completed",
        receiptPath,
        receiptSha256: await fileSha(receiptPath),
        outcomePath,
        outcomeSha256: await fileSha(outcomePath),
      }],
      artifacts: [{ repo: "inkos", path: runPath, sha256: await fileSha(runPath), role: "production-run" }],
    };
    const spawn = (_executable, _args, options) => {
      assert.equal(options.input, plan.invocation.stdin);
      return { status: 0, signal: null, stdout: `${JSON.stringify(result)}\n`, stderr: "" };
    };
    const receipt = await executeWorkOrder({ root, manifest, workOrder, spawn });
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.boundaryChecks.artifactReportsValid, true);
    assert.equal(receipt.boundaryChecks.privateBodyExcluded, true);
    assert.equal(receipt.productionRun.sha256, result.productionRun.sha256);
    assert.equal(receipt.modelCalls[0].receiptSha256, result.modelCalls[0].receiptSha256);
    assert.equal("childResult" in receipt, false);
    assert.equal("args" in receipt.execution, false);
    assert.equal("stderr" in (receipt.error ?? {}), false);
    assert.equal(JSON.stringify(receipt).includes(workOrder.instruction), false);

    const persisted = JSON.parse(await readFile(join(root, ".firefly", "runs", `${createHash("sha256").update(workOrder.idempotencyKey).digest("hex").slice(0, 32)}.json`), "utf8"));
    assert.equal(JSON.stringify(persisted).includes(workOrder.instruction), false);

    const tamperedOrder = writeNextV2WorkOrder({
      workOrderId: "wo-write-next-v2-tampered",
      idempotencyKey: "write-next-v2-tampered",
    });
    const tamperedPlan = buildDispatchPlan({ root, manifest, workOrder: tamperedOrder });
    const tamperedResult = {
      ...result,
      workOrder: { id: tamperedOrder.workOrderId, sha256: tamperedPlan.invocation.workOrderSha256 },
      effectiveRuntime: { ...result.effectiveRuntime, orchestrator: tamperedOrder.runtime },
      modelCalls: [{ ...result.modelCalls[0], receiptSha256: "0".repeat(64) }],
    };
    const tamperedReceipt = await executeWorkOrder({
      root,
      manifest,
      workOrder: tamperedOrder,
      spawn: () => ({ status: 0, signal: null, stdout: `${JSON.stringify(tamperedResult)}\n`, stderr: "" }),
    });
    assert.equal(tamperedReceipt.status, "needs-attention");
    assert.equal(tamperedReceipt.boundaryChecks.artifactReportsValid, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validates a bounded status work order", () => {
  assert.deepEqual(validateWorkOrder(statusWorkOrder(), manifestFixture()), []);
});

test("rejects capability and approval drift", () => {
  const errors = validateWorkOrder(statusWorkOrder({
    capability: "interact",
    approvalMode: "none",
  }), manifestFixture());
  assert.ok(errors.some((error) => error.includes("approvalMode must be human")));
  assert.ok(errors.some((error) => error.includes("instruction is required")));
});

test("keeps InkOS instructions on stdin and out of process arguments", () => {
  const instruction = "4~6화를 기획하되 승인 전에는 캐논으로 승격하지 마.";
  const workOrder = statusWorkOrder({
    workOrderId: "wo-interact-1",
    idempotencyKey: "interact-1",
    capability: "interact",
    approvalMode: "human",
    instruction,
    sessionId: "hq-canary",
  });
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder });
  const publicPlan = publicDispatchPlan(plan, workOrder);
  assert.equal(plan.invocation.stdin, `${instruction}\n`);
  assert.equal(plan.invocation.args.includes(instruction), false);
  assert.equal(publicPlan.instructionExcludedFromArgs, true);
  assert.equal(publicPlan.approvalRequired, true);
});

test("reuses one deterministic HQ session per Book unless a safe explicit fork is requested", () => {
  const base = statusWorkOrder({
    workOrderId: "wo-interact-session-1",
    idempotencyKey: "interact-session-1",
    capability: "interact",
    approvalMode: "human",
    instruction: "기획을 이어서 진행해.",
    bookId: "처가에서-쫓겨난-날-재벌가가-나를-찾았다",
  });
  const first = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder: base });
  const second = buildDispatchPlan({
    root: "/tmp/firefly",
    manifest: manifestFixture(),
    workOrder: { ...base, workOrderId: "wo-interact-session-2", idempotencyKey: "interact-session-2" },
  });
  assert.equal(first.invocation.sessionId, second.invocation.sessionId);
  assert.match(first.invocation.sessionId, /^hq-/);

  const forked = buildDispatchPlan({
    root: "/tmp/firefly",
    manifest: manifestFixture(),
    workOrder: { ...base, sessionId: "hq-arc-2-fork" },
  });
  assert.equal(forked.invocation.sessionId, "hq-arc-2-fork");
  assert.ok(validateWorkOrder({ ...base, sessionId: "../escape" }, manifestFixture())
    .some((error) => error.includes("safe filename")));
});

test("stable work order hashing ignores object key order", () => {
  const first = statusWorkOrder();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(sha256Json(first), sha256Json(second));
});

test("validates a bounded bookless N-candidate pitch slate", () => {
  assert.deepEqual(validateWorkOrder(pitchSlateWorkOrder(), manifestFixture()), []);
  assert.ok(validateWorkOrder(pitchSlateWorkOrder({ candidateCount: 21 }), manifestFixture())
    .some((error) => error.includes("between 1 and 20")));
  assert.ok(validateWorkOrder(pitchSlateWorkOrder({ bookId: "must-not-exist" }), manifestFixture())
    .some((error) => error.includes("must not bind a bookId")));
  assert.ok(validateWorkOrder(pitchSlateWorkOrder({ approvedInputs: [] }), manifestFixture())
    .some((error) => error.includes("pitch-reference-pack")));
  assert.ok(validateWorkOrder(statusWorkOrder({ slateId: "drift", candidateCount: 2 }), manifestFixture())
    .some((error) => error.includes("only valid for pitch-slate")));
});

test("routes pitch slate instructions on stdin and references as verified file paths", () => {
  const workOrder = pitchSlateWorkOrder({ sessionId: "hq-pitch-canary" });
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder });
  const publicPlan = publicDispatchPlan(plan, workOrder);
  assert.deepEqual(plan.invocation.args.slice(1, 3), ["pitch", "slate"]);
  assert.ok(plan.invocation.args.includes("--count"));
  assert.ok(plan.invocation.args.includes("10"));
  assert.ok(plan.invocation.args.includes("/tmp/firefly/edge_repos/firefly_reference_lab/analyses/doksik-chaebol3/gold_reference_card.md"));
  assert.equal(plan.invocation.args.includes(workOrder.instruction), false);
  assert.equal(plan.invocation.stdin, `${workOrder.instruction}\n`);
  assert.equal(plan.invocation.sessionId, "hq-pitch-canary");
  assert.equal(publicPlan.instructionExcludedFromArgs, true);
});

test("routes independent pitch review without generation instructions or candidate counts", () => {
  const workOrder = pitchReviewWorkOrder({ sessionId: "hq-pitch-review-canary" });
  assert.deepEqual(validateWorkOrder(workOrder, manifestFixture()), []);
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder });
  assert.deepEqual(plan.invocation.args.slice(1, 3), ["pitch", "review"]);
  assert.ok(plan.invocation.args.includes("chaebol-canary"));
  assert.equal(plan.invocation.stdin, null);
  assert.equal(plan.invocation.sessionId, "hq-pitch-review-canary");
  assert.ok(validateWorkOrder(pitchReviewWorkOrder({ instruction: "점수를 높여" }), manifestFixture())
    .some((error) => error.includes("does not accept instruction")));
  assert.ok(validateWorkOrder(pitchReviewWorkOrder({ candidateCount: 2 }), manifestFixture())
    .some((error) => error.includes("does not accept candidateCount")));
});

test("routes a human pitch decision with the comment on stdin", () => {
  const workOrder = pitchDecisionWorkOrder({ comment: "p02를 상업성 우선으로 선택" });
  assert.deepEqual(validateWorkOrder(workOrder, manifestFixture()), []);
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder });
  assert.deepEqual(plan.invocation.args.slice(1, 3), ["pitch", "decision"]);
  assert.ok(plan.invocation.args.includes("p02"));
  assert.ok(plan.invocation.args.includes("select"));
  assert.equal(plan.invocation.args.includes(workOrder.comment), false);
  assert.equal(plan.invocation.stdin, `${workOrder.comment}\n`);
  assert.ok(validateWorkOrder(pitchDecisionWorkOrder({ humanDecision: "hold", comment: undefined }), manifestFixture())
    .some((error) => error.includes("requires comment")));
});

test("routes selected pitch promotion only into the requested Book", () => {
  const workOrder = pitchPromoteWorkOrder();
  assert.deepEqual(validateWorkOrder(workOrder, manifestFixture()), []);
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder });
  assert.deepEqual(plan.invocation.args.slice(1, 3), ["pitch", "promote"]);
  assert.ok(plan.invocation.args.includes("chaebol-canary"));
  assert.ok(plan.invocation.args.includes("selected-chaebol"));
  assert.equal(plan.invocation.stdin, null);
  assert.ok(validateWorkOrder(pitchPromoteWorkOrder({ candidateId: "p02" }), manifestFixture())
    .some((error) => error.includes("only valid for pitch-decision")));
});

test("validates reference-bind roles and keeps private bytes out of process arguments", () => {
  const digest = "a".repeat(64);
  const workOrder = statusWorkOrder({
    capability: "reference-bind",
    approvalMode: "human",
    approvedInputs: [{
      repo: "firefly_reference_lab",
      commit: "b".repeat(40),
      path: "inkos_handoffs/reference-pack.json",
      sha256: "c".repeat(64),
      role: "reference-pack",
    }],
    privateInputs: [
      { repo: "firefly_reference_lab", path: "private/source.txt", sha256: digest, role: "raw-source", declaredByRole: "reference-pack" },
      { repo: "firefly_reference_lab", path: "exports/story.jsonl", sha256: digest, role: "story-index", declaredByRole: "reference-pack" },
      { repo: "firefly_reference_lab", path: "exports/style.jsonl", sha256: digest, role: "style-examples", declaredByRole: "reference-pack" },
    ],
  });
  assert.deepEqual(validateWorkOrder(workOrder, manifestFixture()), []);
  const plan = buildDispatchPlan({ root: "/tmp/firefly", manifest: manifestFixture(), workOrder });
  assert.ok(plan.invocation.args.includes("reference"));
  assert.ok(plan.invocation.args.includes("bind"));
  assert.equal(plan.invocation.args.some((arg) => arg === digest), false);
  assert.equal(publicDispatchPlan(plan, workOrder).privateInputCount, 3);
});

test("rejects duplicate private roles and declaration-repository drift", () => {
  const base = statusWorkOrder({
    capability: "reference-bind",
    approvalMode: "human",
    approvedInputs: [{
      repo: "firefly_reference_lab",
      commit: "b".repeat(40),
      path: "inkos_handoffs/reference-pack.json",
      sha256: "c".repeat(64),
      role: "reference-pack",
    }],
    privateInputs: [
      { repo: "firefly_reference_lab", path: "private/source.txt", sha256: "a".repeat(64), role: "raw-source", declaredByRole: "reference-pack" },
      { repo: "firefly_reference_lab", path: "exports/story.jsonl", sha256: "d".repeat(64), role: "story-index", declaredByRole: "reference-pack" },
      { repo: "firefly_reference_lab", path: "exports/style.jsonl", sha256: "e".repeat(64), role: "style-examples", declaredByRole: "reference-pack" },
    ],
  });
  const duplicateErrors = validateWorkOrder({
    ...base,
    privateInputs: [...base.privateInputs, { ...base.privateInputs[0], path: "private/other.txt" }],
  }, manifestFixture());
  assert.ok(duplicateErrors.some((error) => error.includes("role must be unique")));

  const repoDriftErrors = validateWorkOrder({
    ...base,
    privateInputs: [{ ...base.privateInputs[0], repo: "inkos" }, ...base.privateInputs.slice(1)],
  }, manifestFixture());
  assert.ok(repoDriftErrors.some((error) => error.includes("approved declaration repository")));
});

test("verifies private inputs against a tracked declaration and rejects symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-private-input-"));
  const repoPath = join(root, "edge_repos", "firefly_reference_lab");
  try {
    await mkdir(join(repoPath, "inkos_handoffs"), { recursive: true });
    await mkdir(join(repoPath, "private"), { recursive: true });
    await mkdir(join(repoPath, "exports"), { recursive: true });
    const privateFiles = {
      "private/source.txt": "raw source\n",
      "exports/story.jsonl": "story index\n",
      "exports/style.jsonl": "style examples\n",
    };
    const digests = {};
    for (const [path, body] of Object.entries(privateFiles)) {
      await writeFile(join(repoPath, path), body, "utf8");
      digests[path] = createHash("sha256").update(body).digest("hex");
    }
    const declaration = {
      sourceSha256: digests["private/source.txt"],
      privateInputs: {
        storyIndexSha256: digests["exports/story.jsonl"],
        styleExamplesSha256: digests["exports/style.jsonl"],
      },
    };
    const declarationPath = join(repoPath, "inkos_handoffs", "reference-pack.json");
    await writeFile(declarationPath, `${JSON.stringify(declaration)}\n`, "utf8");
    execFileSync("git", ["init", "-b", "main"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "dispatch@example.invalid"], { cwd: repoPath });
    execFileSync("git", ["config", "user.name", "Dispatch Test"], { cwd: repoPath });
    execFileSync("git", ["add", "inkos_handoffs/reference-pack.json"], { cwd: repoPath });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: repoPath, stdio: "ignore" });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();
    const approvedSha = createHash("sha256").update(await readFile(declarationPath)).digest("hex");
    const workOrder = statusWorkOrder({
      capability: "reference-bind",
      approvalMode: "human",
      approvedInputs: [{
        repo: "firefly_reference_lab",
        commit,
        path: "inkos_handoffs/reference-pack.json",
        sha256: approvedSha,
        role: "reference-pack",
      }],
      privateInputs: [
        { repo: "firefly_reference_lab", path: "private/source.txt", sha256: digests["private/source.txt"], role: "raw-source", declaredByRole: "reference-pack" },
        { repo: "firefly_reference_lab", path: "exports/story.jsonl", sha256: digests["exports/story.jsonl"], role: "story-index", declaredByRole: "reference-pack" },
        { repo: "firefly_reference_lab", path: "exports/style.jsonl", sha256: digests["exports/style.jsonl"], role: "style-examples", declaredByRole: "reference-pack" },
      ],
    });
    const verified = await verifyPrivateInputs({ root, manifest: manifestFixture(), workOrder });
    assert.equal(verified.length, 3);
    assert.ok(verified.every((input) => input.status === "verified"));

    await symlink(join(repoPath, "private", "source.txt"), join(repoPath, "private", "source-link.txt"));
    await assert.rejects(
      verifyPrivateInputs({
        root,
        manifest: manifestFixture(),
        workOrder: {
          ...workOrder,
          privateInputs: [{
            ...workOrder.privateInputs[0],
            path: "private/source-link.txt",
          }],
        },
      }),
      /must not use symlinks/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unbounded or unverifiable child artifact reports", () => {
  const report = validateChildArtifacts([
    {
      repo: "inkos",
      path: "../outside.md",
      sha256: "not-a-digest",
      role: "chapter",
    },
  ], "inkos");
  assert.equal(report.artifacts.length, 0);
  assert.ok(report.errors.some((error) => error.includes("must stay inside")));
  assert.ok(report.errors.some((error) => error.includes("SHA-256")));
});

test("requires a complete Book artifact set for reference-bind receipts", () => {
  const digest = "a".repeat(64);
  const partial = validateCapabilityArtifacts("reference-bind", validateChildArtifacts([
    { repo: "inkos", path: "books/demo/book.json", sha256: digest, role: "book-config" },
  ], "inkos"));
  assert.ok(partial.errors.some((error) => error.includes("reference-binding")));
  assert.ok(partial.errors.some((error) => error.includes("reference-transformation")));
  assert.ok(partial.errors.some((error) => error.includes("story-rail-plan")));

  const complete = validateCapabilityArtifacts("reference-bind", validateChildArtifacts([
    { repo: "inkos", path: "books/demo/book.json", sha256: digest, role: "book-config" },
    { repo: "inkos", path: "books/demo/story/reference_binding.json", sha256: digest, role: "reference-binding" },
    { repo: "inkos", path: "books/demo/story/reference_transformation.json", sha256: digest, role: "reference-transformation" },
    { repo: "inkos", path: "books/demo/story/rails/plan.json", sha256: digest, role: "story-rail-plan" },
  ], "inkos"));
  assert.deepEqual(complete.errors, []);
});

test("requires both machine and review artifacts for pitch-slate receipts", () => {
  const digest = "a".repeat(64);
  const partial = validateCapabilityArtifacts("pitch-slate", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/slate.json", sha256: digest, role: "pitch-slate-data" },
  ], "inkos"));
  assert.ok(partial.errors.some((error) => error.includes("pitch-slate-review")));

  const workOrder = pitchSlateWorkOrder({ slateId: "demo", candidateCount: 2 });
  const complete = validateCapabilityArtifacts("pitch-slate", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/slate.json", sha256: digest, role: "pitch-slate-data" },
    { repo: "inkos", path: ".inkos/pitch-slates/demo/review.md", sha256: digest, role: "pitch-slate-review" },
  ], "inkos"), workOrder);
  assert.deepEqual(complete.errors, []);

  const wrongPath = validateCapabilityArtifacts("pitch-slate", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/old/slate.json", sha256: digest, role: "pitch-slate-data" },
    { repo: "inkos", path: ".inkos/pitch-slates/demo/review.md", sha256: digest, role: "pitch-slate-review" },
  ], "inkos"), workOrder);
  assert.ok(wrongPath.errors.some((error) => error.includes("exact path")));
});

test("requires exact independent review artifacts and validates one survivor", () => {
  const digest = "a".repeat(64);
  const partial = validateCapabilityArtifacts("pitch-review", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/survival-review/review.json", sha256: digest, role: "pitch-survival-review-data" },
  ], "inkos"), { slateId: "demo" });
  assert.ok(partial.errors.some((error) => error.includes("pitch-survival-review-readable")));

  const complete = validateCapabilityArtifacts("pitch-review", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/survival-review/review.json", sha256: digest, role: "pitch-survival-review-data" },
    { repo: "inkos", path: ".inkos/pitch-slates/demo/survival-review/review.md", sha256: digest, role: "pitch-survival-review-readable" },
  ], "inkos"), { slateId: "demo" });
  assert.deepEqual(complete.errors, []);

  const sourceSlate = { candidates: [{ candidateId: "p01" }, { candidateId: "p02" }] };
  const review = {
    schemaVersion: 1,
    reviewKind: "independent-blind-comparison",
    slateId: "demo",
    sourceSlateSha256: digest,
    humanDecision: "pending",
    winnerCandidateId: "p01",
    ranking: ["p01", "p02"],
    verdicts: [{ candidateId: "p01", verdict: "SURVIVE" }, { candidateId: "p02", verdict: "HOLD" }],
  };
  assert.deepEqual(validatePitchSurvivalReviewData(review, { slateId: "demo" }, sourceSlate), []);
  const invalid = structuredClone(review);
  invalid.verdicts[1].verdict = "SURVIVE";
  assert.ok(validatePitchSurvivalReviewData(invalid, { slateId: "demo" }, sourceSlate)
    .some((error) => error.includes("at most one SURVIVE")));
});

test("requires exact decision and planning-promotion artifact sets", () => {
  const digest = "a".repeat(64);
  const decision = validateCapabilityArtifacts("pitch-decision", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/human-decision/decision.json", sha256: digest, role: "pitch-human-decision-data" },
    { repo: "inkos", path: ".inkos/pitch-slates/demo/human-decision/decision.md", sha256: digest, role: "pitch-human-decision-readable" },
  ], "inkos"), { slateId: "demo" });
  assert.deepEqual(decision.errors, []);

  const promotion = validateCapabilityArtifacts("pitch-promote", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/promotion.json", sha256: digest, role: "pitch-promotion-receipt" },
    { repo: "inkos", path: "books/selected/book.json", sha256: digest, role: "book-config" },
    { repo: "inkos", path: "books/selected/story/pitch-selection.json", sha256: digest, role: "book-pitch-selection-data" },
    { repo: "inkos", path: "books/selected/story/pitch-selection.md", sha256: digest, role: "book-pitch-selection-readable" },
  ], "inkos"), { slateId: "demo", bookId: "selected" });
  assert.deepEqual(promotion.errors, []);

  const partial = validateCapabilityArtifacts("pitch-promote", validateChildArtifacts([
    { repo: "inkos", path: ".inkos/pitch-slates/demo/promotion.json", sha256: digest, role: "pitch-promotion-receipt" },
  ], "inkos"), { slateId: "demo", bookId: "selected" });
  assert.ok(partial.errors.some((error) => error.includes("book-config")));
  assert.ok(partial.errors.some((error) => error.includes("book-pitch-selection")));
});

test("revalidates N non-canonical pending candidates from pitch-slate data", () => {
  const workOrder = pitchSlateWorkOrder({ slateId: "demo", candidateCount: 2 });
  const valid = {
    schemaVersion: 1,
    slateId: "demo",
    canonStatus: "non-canonical",
    reviewStatus: "pending",
    candidateCount: 2,
    candidates: [
      { candidateId: "p01", decision: "pending" },
      { candidateId: "p02", decision: "pending" },
    ],
  };
  assert.deepEqual(validatePitchSlateData(valid, workOrder), []);
  assert.ok(validatePitchSlateData({
    ...valid,
    candidates: [{ candidateId: "p01", decision: "selected" }],
  }, workOrder).some((error) => error.includes("length")));
});

test("executes a read-only child, persists a receipt, and replays idempotently", async () => {
  const root = await mkdtemp(join(tmpdir(), "firefly-dispatch-"));
  const repoPath = join(root, "edge_repos", "inkos");
  const cliPath = join(repoPath, "packages", "cli", "dist", "index.js");
  const artifactPath = join(repoPath, "books", "demo.txt");
  const remoteUrl = "git@example.invalid:owner/inkos.git";
  try {
    await mkdir(join(repoPath, "packages", "cli", "dist"), { recursive: true });
    await mkdir(join(repoPath, "books"), { recursive: true });
    await writeFile(artifactPath, "verified artifact\n", "utf8");
    const artifactSha256 = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
    await writeFile(
      cliPath,
      [
        "const fs = require('node:fs');",
        "if (process.argv.includes('interact')) { fs.writeFileSync('outside.txt', 'scope violation\\n'); fs.writeFileSync('books/runtime.txt', 'observed runtime write\\n'); }",
        `process.stdout.write(JSON.stringify({ project: process.cwd(), books: [], artifacts: [{ repo: "inkos", path: "books/demo.txt", sha256: "${artifactSha256}", role: "canary" }] }) + '\\n');`,
        "",
      ].join("\n"),
      "utf8",
    );
    execFileSync("git", ["init", "-b", "master"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "dispatch@example.invalid"], { cwd: repoPath });
    execFileSync("git", ["config", "user.name", "Dispatch Test"], { cwd: repoPath });
    execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: repoPath });
    execFileSync("git", ["add", "packages/cli/dist/index.js", "books/demo.txt"], { cwd: repoPath });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: repoPath, stdio: "ignore" });

    const manifest = manifestFixture(remoteUrl);
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();
    const cliBytes = await readFile(cliPath);
    const workOrder = statusWorkOrder({
      approvedInputs: [{
        repo: "inkos",
        commit,
        path: "packages/cli/dist/index.js",
        sha256: createHash("sha256").update(cliBytes).digest("hex"),
        role: "worker-entrypoint-canary",
      }],
    });
    const inputVerification = verifyApprovedInputs({ root, manifest, workOrder });
    assert.equal(inputVerification[0].status, "verified");
    assert.throws(
      () => verifyApprovedInputs({
        root,
        manifest,
        workOrder: {
          ...workOrder,
          approvedInputs: [{ ...workOrder.approvedInputs[0], sha256: "0".repeat(64) }],
        },
      }),
      /approved input hash mismatch/,
    );
    const receipt = await executeWorkOrder({ root, manifest, workOrder });
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.mutating, false);
    assert.equal(receipt.approval.status, "not-required");
    assert.equal(receipt.childResult.books.length, 0);
    assert.equal(receipt.boundaryChecks.trackedWorktreeUnchanged, true);
    assert.equal(receipt.boundaryChecks.writesWithinDeclaredScopes, true);
    assert.equal(receipt.inputVerification[0].status, "verified");
    assert.equal(receipt.artifacts[0].sha256, artifactSha256);

    const replay = await executeWorkOrder({ root, manifest, workOrder });
    assert.equal(replay.receiptId, receipt.receiptId);
    assert.equal(replay.replayed, true);

    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder: { ...workOrder, workOrderId: "different-order" } }),
      /idempotencyKey is already bound/,
    );

    const interactOrder = statusWorkOrder({
      workOrderId: "wo-interact-1",
      idempotencyKey: "interact-1",
      capability: "interact",
      approvalMode: "human",
      instruction: "Plan only; do not approve canon.",
    });
    const interactReceipt = await executeWorkOrder({ root, manifest, workOrder: interactOrder });
    assert.equal(interactReceipt.status, "needs-attention");
    assert.equal(interactReceipt.mutating, true);
    assert.equal(interactReceipt.approval.status, "pending");
    assert.equal(interactReceipt.execution.instructionTransport, "stdin");
    assert.equal(interactReceipt.boundaryChecks.writesWithinDeclaredScopes, false);
    assert.deepEqual(interactReceipt.writeScopeViolations, ["outside.txt"]);
    assert.deepEqual(interactReceipt.observedWrites, [expectObservedWrite("books/runtime.txt", "created")]);

    const lockedOrder = statusWorkOrder({
      workOrderId: "wo-locked-1",
      idempotencyKey: "locked-1",
    });
    const lockDigest = createHash("sha256").update(lockedOrder.idempotencyKey).digest("hex").slice(0, 32);
    const lockPath = join(root, ".firefly", "locks", `idempotency-${lockDigest}.lock`);
    await writeFile(lockPath, "held\n", "utf8");
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder: lockedOrder }),
      /already in progress/,
    );
    await rm(lockPath);

    await writeFile(join(repoPath, "tracked.txt"), "dirty\n", "utf8");
    const dirtyOrder = { ...interactOrder, workOrderId: "wo-interact-dirty", idempotencyKey: "interact-dirty" };
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder: dirtyOrder }),
      /refusing mutating dispatch to dirty child/,
    );

    const receiptFiles = await readdir(join(root, ".firefly", "runs"));
    assert.equal(receiptFiles.length, 2);
    const persistedReceipts = await Promise.all(receiptFiles.map(async (file) => (
      JSON.parse(await readFile(join(root, ".firefly", "runs", file), "utf8"))
    )));
    assert.ok(persistedReceipts.some((persisted) => persisted.receiptId === receipt.receiptId));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function expectObservedWrite(path, change) {
  return {
    path,
    change,
    beforeSha256: null,
    afterSha256: createHash("sha256").update("observed runtime write\n").digest("hex"),
  };
}
