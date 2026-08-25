import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
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
  validateChildArtifacts,
  verifyApprovedInputs,
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
        adapter: "inkos-cli-v1",
        entrypoint: "packages/cli/dist/index.js",
        receiptContract: "run-receipt/v1",
        writeScopes: ["books/"],
        capabilities: [
          { name: "status", mode: "read-only", approval: "none" },
          { name: "interact", mode: "mutating", approval: "human" },
        ],
      },
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

test("stable work order hashing ignores object key order", () => {
  const first = statusWorkOrder();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(sha256Json(first), sha256Json(second));
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
        "if (process.argv.includes('interact')) fs.writeFileSync('outside.txt', 'scope violation\\n');",
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
