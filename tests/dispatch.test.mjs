import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
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
  sealRunReceiptV2,
  sha256Json,
  validateCapabilityArtifacts,
  validateChildArtifacts,
  validatePitchSlateData,
  validatePitchSurvivalReviewData,
  verifyApprovedInputs,
  verifyPrivateInputs,
  validateWorkOrder,
} from "../scripts/dispatch-lib.mjs";
import { deriveAgentOperateSessionId } from "../scripts/hermes-control-lib.mjs";
import { hashInkosCanonicalJson } from "../scripts/inkos-agent-terminal-verifier.mjs";

function validateWithContract(schemaName, instance) {
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
          { name: "agent-operate", mode: "mutating", approval: "human" },
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

function agentCanaryWorkOrder(root = process.cwd(), overrides = {}) {
  const profileRegistry = JSON.parse(readFileSync(join(root, "config", "hermes-production-profiles.json"), "utf8"));
  const adoptionBytes = readFileSync(join(root, "config", "genre-soul-adoptions.json"));
  const profile = profileRegistry.profiles.find((entry) => entry.profileId === "inkos_male_fantasy");
  const instruction = overrides.instruction ?? "상업성 우선으로 다음 회차를 집필해.";
  const args = overrides.args ?? { chapterCount: 1, targetLength: { count: 5500, unit: "ko-chars" } };
  const instructionSha256 = createHash("sha256").update(Buffer.from(instruction, "utf8")).digest("hex");
  const modeEvidence = overrides.modeEvidence ?? {
    lane: "genre-soul",
    profileId: profile.profileId,
    profileConfigSha256: profile.configSha256,
    profileLifecycle: "candidate",
    productionEnabled: false,
    adoptionRegistrySha256: createHash("sha256").update(adoptionBytes).digest("hex"),
    activeMatchingCount: 0,
    soulId: profile.soulId,
    soulVersion: profile.soulVersion,
    soulSha256: profile.soulSha256,
    promotionDecisionSha256: null,
    canaryIsolation: {
      pairId: "pair-fixture",
      path: ".inkos/canaries/pair-fixture/common-snapshot.json",
      sha256: "c".repeat(64),
      byteLength: 1,
      receiptSelfHash: "d".repeat(64),
      isolationScopeSha256: "e".repeat(64),
      commonSnapshotSha256: "f".repeat(64),
    },
  };
  const base = {
    schemaVersion: 2,
    workOrderId: "wo-agent-canary-1",
    idempotencyKey: "agent-canary-1",
    repo: "inkos",
    capability: "agent-operate",
    bookId: "demo-book",
    instruction,
    args,
    expectedSoulBinding: { soulId: profile.soulId, soulVersion: profile.soulVersion, bindingSha256: "d".repeat(64) },
    executionMode: "promotion-canary",
    modeEvidence,
    runtime: { hermesProfile: profile.profileId, model: "gpt-5.6-sol", reasoning: "high" },
    approvalMode: "human",
    approvedInputs: [],
    privateInputs: [],
    requestedAt: "2026-09-02T00:00:00.000Z",
  };
  const workOrder = { ...base, ...overrides, modeEvidence };
  workOrder.sessionId = overrides.sessionId ?? deriveAgentOperateSessionId(workOrder);
  workOrder.ownerDecision = overrides.ownerDecision ?? {
    receiptId: "owner-agent-canary-1",
    status: "approved",
    instructionSha256,
    argsSha256: sha256Json({
      capability: workOrder.capability,
      bookId: workOrder.bookId,
      sessionId: workOrder.sessionId,
      args: workOrder.args,
      expectedSoulBinding: workOrder.expectedSoulBinding,
      executionMode: workOrder.executionMode,
      modeEvidence: workOrder.modeEvidence,
      instructionSha256,
    }),
    decidedAt: "2026-09-02T00:00:00.000Z",
  };
  return workOrder;
}

function fixtureFileRef(root, path) {
  const bytes = readFileSync(join(root, path));
  return { path, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength };
}

function fixtureManifest(root, prefix = "", excluded = new Set()) {
  const files = [];
  const walk = (directory, nested = "") => {
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const relativePath = nested ? `${nested}/${name}` : name;
      if (excluded.has(relativePath)) continue;
      const absolutePath = join(directory, name);
      const metadata = lstatSync(absolutePath);
      if (metadata.isDirectory()) walk(absolutePath, relativePath);
      else if (metadata.isFile()) {
        const receiptPath = prefix ? `${prefix}/${relativePath}` : relativePath;
        const bytes = readFileSync(absolutePath);
        files.push({ path: receiptPath, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength });
      }
    }
  };
  walk(root);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, manifestSha256: sha256Json(files) };
}

async function createAgentDispatchFixture({ lane = "genre-soul" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "firefly-agent-dispatch-"));
  const configDir = join(root, "config");
  const repoPath = join(root, "edge_repos", "inkos");
  const remoteUrl = "git@example.invalid:owner/inkos.git";
  await mkdir(configDir, { recursive: true });
  const sourceProfiles = JSON.parse(readFileSync(join(process.cwd(), "config", "hermes-production-profiles.json"), "utf8"));
  const genreProfile = sourceProfiles.profiles.find((entry) => entry.profileId === "inkos_male_fantasy");
  const neutralRegistry = JSON.parse(readFileSync(join(process.cwd(), "config", "hermes-neutral-production-profile.json"), "utf8"));
  const profile = lane === "neutral-baseline" ? neutralRegistry.profile : genreProfile;
  await writeFile(join(configDir, "hermes-production-profiles.json"), `${JSON.stringify({ schemaVersion: sourceProfiles.schemaVersion, profiles: [genreProfile] }, null, 2)}\n`);
  await writeFile(join(configDir, "hermes-neutral-production-profile.json"), `${JSON.stringify(neutralRegistry, null, 2)}\n`);
  await writeFile(join(configDir, "genre-soul-adoptions.json"), `${JSON.stringify({ schemaVersion: "genre-soul-adoption-registry/v1", active: [] }, null, 2)}\n`);

  await mkdir(join(repoPath, "packages", "cli", "dist"), { recursive: true });
  await writeFile(join(repoPath, "packages", "cli", "dist", "index.js"), "// fixture entrypoint\n");
  await writeFile(join(repoPath, ".gitignore"), "books/\n.inkos/\n");
  await writeFile(join(repoPath, "inkos.json"), `${JSON.stringify({ schemaVersion: 1, project: "fixture" }, null, 2)}\n`);
  await mkdir(join(repoPath, "books", "demo-book"), { recursive: true });
  await writeFile(join(repoPath, "books", "demo-book", "book.json"), `${JSON.stringify({ id: "demo-book", title: "Fixture" }, null, 2)}\n`);
  execFileSync("git", ["init", "-b", "master"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "dispatch@example.invalid"], { cwd: repoPath });
  execFileSync("git", ["config", "user.name", "Dispatch Test"], { cwd: repoPath });
  execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: repoPath });
  execFileSync("git", ["add", "packages/cli/dist/index.js", ".gitignore", "inkos.json"], { cwd: repoPath });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: repoPath, stdio: "ignore" });

  const pairId = "pair-fixture";
  const pairRoot = join(repoPath, ".inkos", "canaries", pairId);
  const neutralRoot = join(pairRoot, "neutral");
  const soulRoot = join(pairRoot, "soul");
  for (const laneRoot of [neutralRoot, soulRoot]) {
    await mkdir(join(laneRoot, "books", "demo-book"), { recursive: true });
    await writeFile(join(laneRoot, "inkos.json"), await readFile(join(repoPath, "inkos.json")));
    await writeFile(join(laneRoot, "books", "demo-book", "book.json"), await readFile(join(repoPath, "books", "demo-book", "book.json")));
  }
  const neutralManifest = fixtureManifest(neutralRoot);
  const bindingUnsigned = {
    schemaVersion: "book-soul-binding/v2",
    bookId: "demo-book",
    soulId: genreProfile.soulId,
    version: genreProfile.soulVersion,
    status: "candidate",
    bindingVersion: 1,
  };
  const binding = { ...bindingUnsigned, bindingSha256: hashInkosCanonicalJson(bindingUnsigned) };
  const bindingPath = "books/demo-book/story/soul-bindings/0001.json";
  const pointerPath = "books/demo-book/story/soul-bindings/current.json";
  const objectPath = `.inkos/production/souls/objects/${genreProfile.soulSha256}.json`;
  await mkdir(join(soulRoot, bindingPath, ".."), { recursive: true });
  await mkdir(join(soulRoot, objectPath, ".."), { recursive: true });
  await writeFile(join(soulRoot, bindingPath), `${JSON.stringify(binding, null, 2)}\n`);
  await writeFile(join(soulRoot, pointerPath), `${JSON.stringify({ bookId: "demo-book", bindingPath: "story/soul-bindings/0001.json", bindingSha256: binding.bindingSha256 }, null, 2)}\n`);
  await writeFile(join(soulRoot, objectPath), `${JSON.stringify({ soulId: genreProfile.soulId, version: genreProfile.soulVersion })}\n`);
  const soulManifest = fixtureManifest(soulRoot);
  const allowedDeltaPaths = soulManifest.files
    .map((entry) => entry.path)
    .filter((path) => !neutralManifest.files.some((entry) => entry.path === path))
    .sort((left, right) => left.localeCompare(right));
  const sourceConfig = fixtureFileRef(repoPath, "inkos.json");
  const sourceGenres = { state: "absent", files: [], manifestSha256: sha256Json({ state: "absent", files: [] }) };
  const sourceBook = fixtureManifest(join(repoPath, "books", "demo-book"), "books/demo-book", new Set([".soul-turn.lock", ".write.lock"]));
  const commonSnapshotSha256 = sha256Json({
    schemaVersion: "inkos-canary-source-snapshot/v1",
    config: sourceConfig,
    genres: sourceGenres,
    book: sourceBook,
  });
  const sourceProjectRootFingerprint = sha256Json({ schemaVersion: "inkos-canary-source-project-fingerprint/v1", commonSnapshotSha256 });
  const scopeId = `canary-pair:${pairId}:demo-book`;
  const receiptPath = `.inkos/canaries/${pairId}/common-snapshot.json`;
  const neutralProjectRoot = `.inkos/canaries/${pairId}/neutral`;
  const soulProjectRoot = `.inkos/canaries/${pairId}/soul`;
  const isolationScopeSha256 = sha256Json({
    schemaVersion: "inkos-canary-isolation-scope/v1",
    scopeId,
    pairId,
    bookId: "demo-book",
    sourceProjectRootFingerprint,
    receiptPath,
    laneProjectRoots: [neutralProjectRoot, soulProjectRoot],
    allowedDeltaPaths,
  });
  const artifactRef = (path, role) => ({ path, sha256: "a".repeat(64), byteLength: 1, role });
  const receiptUnsigned = {
    schemaVersion: "inkos-canary-common-snapshot/v1",
    pairId,
    bookId: "demo-book",
    scopeId,
    sourceProjectRootFingerprint,
    sourceConfig,
    sourceGenres,
    sourceBook,
    commonSnapshotSha256,
    isolationScopeSha256,
    soulBindingInputs: {
      soulId: genreProfile.soulId,
      soulVersion: genreProfile.soulVersion,
      artifacts: [
        artifactRef("decisions/soul.json", "soul-binding-decision"),
        artifactRef("souls/manifest.json", "soul-package-manifest"),
        artifactRef("receipts/source.json", "source-registry-receipt"),
      ].sort((left, right) => left.role.localeCompare(right.role)),
    },
    lanes: {
      neutral: {
        projectRoot: neutralProjectRoot,
        preBindManifestSha256: neutralManifest.manifestSha256,
        postBindManifestSha256: neutralManifest.manifestSha256,
        allowedDeltaPaths: [],
        allowedDeltaManifestSha256: sha256Json([]),
        expectedSoulBinding: null,
      },
      genreSoul: {
        projectRoot: soulProjectRoot,
        preBindManifestSha256: neutralManifest.manifestSha256,
        postBindManifestSha256: soulManifest.manifestSha256,
        allowedDeltaPaths,
        allowedDeltaManifestSha256: sha256Json(allowedDeltaPaths),
        expectedSoulBinding: { soulId: genreProfile.soulId, soulVersion: genreProfile.soulVersion, bindingSha256: binding.bindingSha256 },
      },
    },
    productionBookFingerprint: { before: sourceBook.manifestSha256, after: sourceBook.manifestSha256, unchanged: true },
    excludedTransientBookPaths: [".soul-turn.lock", ".write.lock"],
    createdAt: "2026-09-02T00:00:00.000Z",
  };
  const receipt = { ...receiptUnsigned, receiptSelfHash: hashInkosCanonicalJson(receiptUnsigned) };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(join(repoPath, receiptPath), receiptBytes);

  const laneReceipt = lane === "neutral-baseline" ? receipt.lanes.neutral : receipt.lanes.genreSoul;
  const baseModeEvidence = agentCanaryWorkOrder(root).modeEvidence;
  const workOrder = agentCanaryWorkOrder(root, {
    workOrderId: lane === "neutral-baseline" ? "wo-agent-neutral-canary-1" : "wo-agent-canary-1",
    idempotencyKey: lane === "neutral-baseline" ? "agent-neutral-canary-1" : "agent-canary-1",
    expectedSoulBinding: laneReceipt.expectedSoulBinding,
    modeEvidence: {
      ...baseModeEvidence,
      lane,
      profileId: profile.profileId,
      profileConfigSha256: profile.configSha256,
      profileLifecycle: profile.lifecycle,
      productionEnabled: profile.productionEnabled,
      activeMatchingCount: 0,
      soulId: profile.soulId,
      soulVersion: profile.soulVersion,
      soulSha256: profile.soulSha256,
      promotionDecisionSha256: profile.promotionDecisionSha256,
      canaryIsolation: {
        pairId,
        path: receiptPath,
        sha256: createHash("sha256").update(receiptBytes).digest("hex"),
        byteLength: receiptBytes.byteLength,
        receiptSelfHash: receipt.receiptSelfHash,
        isolationScopeSha256,
        commonSnapshotSha256,
      },
    },
    runtime: { hermesProfile: profile.profileId, model: "gpt-5.6-sol", reasoning: "high" },
    approvedInputs: [],
  });
  workOrder.ownerDecision.argsSha256 = sha256Json({
    capability: workOrder.capability,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    args: workOrder.args,
    expectedSoulBinding: workOrder.expectedSoulBinding,
    executionMode: workOrder.executionMode,
    modeEvidence: workOrder.modeEvidence,
    instructionSha256: workOrder.ownerDecision.instructionSha256,
  });
  const canaryProjection = {
    schemaVersion: "inkos-canary-execution-root-verification/v1",
    scopeId,
    pairId,
    bookId: workOrder.bookId,
    lane: lane === "neutral-baseline" ? "neutral" : "soul",
    projectRoot: lane === "neutral-baseline" ? neutralProjectRoot : soulProjectRoot,
    sourceProjectRootFingerprint,
    sourceBookManifestSha256: sourceBook.manifestSha256,
    laneManifestSha256: laneReceipt.postBindManifestSha256,
    receipt: {
      path: receiptPath,
      sha256: workOrder.modeEvidence.canaryIsolation.sha256,
      byteLength: receiptBytes.byteLength,
      selfHash: receipt.receiptSelfHash,
    },
    isolationScopeSha256,
    commonSnapshotSha256,
    expectedSoulBinding: workOrder.expectedSoulBinding,
  };
  const executionRoot = lane === "neutral-baseline" ? neutralRoot : soulRoot;
  return { root, repoPath, executionRoot: await realpath(executionRoot), canaryProjection, workOrder, manifest: manifestFixture(remoteUrl), profile };
}

const hermesReadbackOptions = {
  getConfigValue: (_profileId, key) => ({
    "model.provider": "openai-codex",
    "model.default": "gpt-5.6-sol",
    "agent.reasoning_effort": "high",
    "agent.coding_context": "off",
    "model.openai_runtime": "auto",
    "platform_toolsets.cli": "[]",
  })[key],
  getPromptSize: () => ({ model: "gpt-5.6-sol", tools: { count: 0 } }),
};

function writeStrictAgentChildResult({ repoPath, workOrder, plan, envelope, profile, hermesSessionId, canaryProjection }) {
  const commandId = "11111111-1111-4111-8111-111111111111";
  const productionOperationId = "22222222-2222-4222-8222-222222222222";
  const attemptId = "33333333-3333-4333-8333-333333333333";
  const operationId = "44444444-4444-4444-8444-444444444444";
  const receiptId = operationId;
  const bookRoot = `books/${workOrder.bookId}`;
  const operationRoot = `story/runtime/hermes-control/${workOrder.workOrderId}`;
  const internal = {
    request: `${operationRoot}/request.json`,
    action: `${operationRoot}/action.json`,
    hermesReceipt: `${operationRoot}/hermes-invocation.json`,
    importReceipt: `${operationRoot}/import-receipt.json`,
    terminal: `${operationRoot}/terminal.json`,
    run: `story/runtime/production-runs/terminals/${commandId}.json`,
    chapterCommit: `story/runtime/chapter-commits/${productionOperationId}--${receiptId}.json`,
    operationManifest: `story/runtime/fiction-content-neutral/operations/${operationId}.json`,
    chapter: "chapters/0001.md",
    index: "chapters/index.json",
    modelReceipt: "story/runtime/fiction-content-neutral/receipts/writer-inv-1.json",
    modelOutcome: "story/runtime/fiction-content-neutral/outcomes/writer-inv-1.json",
  };
  const external = (path) => `${bookRoot}/${path}`;
  const writeBytes = (path, bytes) => {
    mkdirSync(join(repoPath, path, ".."), { recursive: true });
    writeFileSync(join(repoPath, path), bytes);
    return { path: path.slice(bookRoot.length + 1), sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength };
  };
  const writeJson = (path, value) => writeBytes(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
  const seal = (unsigned, field) => ({ ...unsigned, [field]: hashInkosCanonicalJson(unsigned) });
  const workOrderBytes = Buffer.from(envelope.workOrder.bytes, "base64");
  const actionBytes = Buffer.from(envelope.hermesAction.bytes, "base64");
  const hermesReceiptBytes = Buffer.from(envelope.hermesReceipt.bytes, "base64");
  const requestRef = writeBytes(external(internal.request), workOrderBytes);
  const actionRef = writeBytes(external(internal.action), actionBytes);
  const hermesReceiptRef = writeBytes(external(internal.hermesReceipt), hermesReceiptBytes);
  const taskGuidance = {
    source: "hermes-control-action",
    bookId: workOrder.bookId,
    workOrderId: workOrder.workOrderId,
    actionRef,
    textSha256: envelope.hermesAction.textSha256,
  };
  const importUnsigned = {
    schemaVersion: "hermes-control-import/v2",
    workOrderId: workOrder.workOrderId,
    workOrderSha256: plan.invocation.workOrderSha256,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    request: requestRef,
    action: actionRef,
    hermesReceipt: hermesReceiptRef,
    taskGuidance,
    canaryIsolation: canaryProjection,
    importedAt: "2026-09-02T12:00:01.000Z",
  };
  const importRef = writeJson(external(internal.importReceipt), seal(importUnsigned, "receiptSelfHash"));

  const chapterBytes = Buffer.from("# 1화\n\n상업적 보상이 폭발했다.\n", "utf8");
  const chapterRef = writeBytes(external(internal.chapter), chapterBytes);
  const indexRef = writeJson(external(internal.index), [{ number: 1, title: "1화", status: "draft", wordCount: 18 }]);
  const operationManifestRef = writeJson(external(internal.operationManifest), {
    schemaVersion: "fiction-content-operation/v1",
    operationId,
    bookId: workOrder.bookId,
    chapterNumber: 1,
    operationKind: "write-next-chapter",
    productionOperationId,
    attemptId,
  });
  const chapterUnsigned = {
    schemaVersion: "chapter-commit-receipt/v1",
    receiptId,
    bookId: workOrder.bookId,
    chapterNumber: 1,
    capability: "write-next-chapter",
    productionOperationId,
    attemptId,
    fictionOperationIds: [operationId],
    operationManifests: [{ operationId, artifact: { path: operationManifestRef.path, sha256: operationManifestRef.sha256 } }],
    chapterArtifact: { path: chapterRef.path, sha256: chapterRef.sha256 },
    indexArtifact: { path: indexRef.path, sha256: indexRef.sha256 },
    currentStateArtifact: null,
    railTruth: { applicability: "not-applicable", reason: "no-active-rail" },
    commitState: "verified",
    committedAt: "2026-09-02T12:00:02.000Z",
  };
  const chapter = seal(chapterUnsigned, "receiptSelfHash");
  const chapterCommitRef = writeJson(external(internal.chapterCommit), chapter);

  const instructionSha256 = createHash("sha256").update(Buffer.from(workOrder.instruction, "utf8")).digest("hex");
  const commandUnsigned = {
    schemaVersion: "production-command/v2",
    commandId,
    idempotencyKey: workOrder.idempotencyKey,
    intentDigest: "5".repeat(64),
    capability: "write-next-chapter",
    source: "hq",
    binding: {
      bookId: workOrder.bookId,
      sessionId: workOrder.sessionId,
      requestId: workOrder.workOrderId,
      workOrderId: workOrder.workOrderId,
      soulBinding: workOrder.expectedSoulBinding,
    },
    authorization: {
      kind: "authenticated-orchestrator",
      requestedIntent: "write_next",
      actionSource: "authenticated-orchestrator",
      ownerDirection: {
        source: "owner-confirmed",
        receiptId: workOrder.ownerDecision.receiptId,
        sourceRef: {
          kind: "detached-payload-lease",
          leaseId: "55555555-5555-4555-8555-555555555555",
          payloadSha256: instructionSha256,
          byteLength: Buffer.byteLength(workOrder.instruction, "utf8"),
          expiresAt: "2026-09-03T12:00:00.000Z",
          leaseReceiptSha256: "6".repeat(64),
        },
        textSha256: instructionSha256,
      },
      argsSha256: "0".repeat(64),
      workOrderId: workOrder.workOrderId,
      workOrderSha256: plan.invocation.workOrderSha256,
      manifestCapabilitySha256: plan.invocation.manifestCapabilitySha256,
      ownerDecisionReceiptSha256: sha256Json(workOrder.ownerDecision),
    },
    args: {
      chapterCount: 1,
      targetLength: workOrder.args.targetLength,
      ownerDirectionTextSha256: instructionSha256,
      taskGuidance,
    },
    activatedSkills: [],
    issuedAt: "2026-09-02T12:00:01.000Z",
  };
  commandUnsigned.authorization.argsSha256 = hashInkosCanonicalJson(commandUnsigned.args);
  const command = seal(commandUnsigned, "commandSelfHash");
  const context = {
    schemaVersion: "production-execution-context/v1",
    commandId,
    commandSha256: command.commandSelfHash,
    productionOperationId,
    attemptId,
    intentDigest: command.intentDigest,
    capability: "write-next-chapter",
    mode: "enforce",
    source: "hq",
    actionSource: "authenticated-orchestrator",
    binding: command.binding,
    activatedSkills: [],
    startedAt: "2026-09-02T12:00:01.000Z",
  };
  const runUnsigned = {
    schemaVersion: "production-run/v1",
    command,
    commandSha256: command.commandSelfHash,
    productionAttempt: { productionOperationId, attemptId },
    context,
    executionStatus: "succeeded",
    approvalStatus: "pending",
    completionHealth: "verified",
    projectionHealth: "verified",
    projectionOrigin: "direct",
    evidence: {
      kind: "verified-commit",
      receiptFile: { path: chapterCommitRef.path, sha256: chapterCommitRef.sha256 },
      receiptId,
      commitState: "verified",
      chapterArtifact: { path: chapterRef.path, sha256: chapterRef.sha256 },
      indexArtifact: { path: indexRef.path, sha256: indexRef.sha256 },
      currentStateArtifact: null,
      railTruth: { applicability: "not-applicable", reason: "no-active-rail" },
      verifiedAt: "2026-09-02T12:00:02.000Z",
    },
    chapter: { chapterNumber: 1, title: "1화", wordCount: 18, status: "draft" },
    startedAt: "2026-09-02T12:00:01.000Z",
    completedAt: "2026-09-02T12:00:02.000Z",
  };
  const runRef = writeJson(external(internal.run), seal(runUnsigned, "runSelfHash"));
  const modelReceiptRef = writeJson(external(internal.modelReceipt), {
    invocationId: "writer-inv-1", agentName: "Writer", stage: "chapter-draft", model: "gpt-5.6-sol", reasoningEffort: "high", productionOperationId, attemptId,
  });
  const modelOutcomeRef = writeJson(external(internal.modelOutcome), {
    invocationId: "writer-inv-1", status: "completed", productionOperationId, attemptId,
  });
  const finalLaneManifestSha256 = fixtureManifest(repoPath, "", new Set([
    `books/${workOrder.bookId}/.soul-turn.lock`,
    `books/${workOrder.bookId}/.write.lock`,
    external(internal.terminal),
  ])).manifestSha256;
  const terminalUnsigned = {
    schemaVersion: "inkos-agent-operation-terminal/v2",
    workOrderId: workOrder.workOrderId,
    workOrderSha256: plan.invocation.workOrderSha256,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    executionMode: workOrder.executionMode,
    canaryIsolation: canaryProjection,
    finalLaneManifestSha256,
    importReceipt: importRef,
    productionRun: { ...runRef, commandId, productionOperationId, attemptId },
    completedAt: "2026-09-02T12:00:03.000Z",
    status: "succeeded",
    chapterCommit: { ...chapterCommitRef, receiptId, receiptSelfHash: chapter.receiptSelfHash },
  };
  const terminalRef = writeJson(external(internal.terminal), seal(terminalUnsigned, "receiptSelfHash"));
  return {
    schemaVersion: "inkos-agent-operation-result/v1",
    workOrder: { id: workOrder.workOrderId, sha256: plan.invocation.workOrderSha256 },
    agentOperation: {
      status: "succeeded",
      executionMode: workOrder.executionMode,
      canaryIsolation: canaryProjection,
      finalLaneManifestSha256,
      receipt: { path: external(internal.terminal), sha256: terminalRef.sha256 },
      importReceipt: { path: external(internal.importReceipt), sha256: importRef.sha256 },
      action: { path: external(internal.action), sha256: actionRef.sha256, textSha256: envelope.hermesAction.textSha256 },
      hermesReceipt: { path: external(internal.hermesReceipt), sha256: hermesReceiptRef.sha256 },
    },
    productionRun: {
      commandId, productionOperationId, attemptId, path: external(internal.run), sha256: runRef.sha256,
      executionStatus: "succeeded", approvalStatus: "pending", completionHealth: "verified", projectionOrigin: "direct",
    },
    effectiveRuntime: {
      hermesE2E: true,
      orchestrator: { hermesProfile: profile.profileId, model: "gpt-5.6-sol", reasoning: "high", invoked: true, evidence: "verified-hermes-invocation-receipt", sessionId: hermesSessionId, toolsCount: 0, toolCallCount: 0 },
      inkos: { configMode: "project", model: "gpt-5.6-sol", reasoning: "high" },
    },
    modelCalls: [{
      invocationId: "writer-inv-1", agentName: "Writer", stage: "chapter-draft", model: "gpt-5.6-sol", reasoningEffort: "high", status: "completed",
      receiptPath: external(internal.modelReceipt), receiptSha256: modelReceiptRef.sha256,
      outcomePath: external(internal.modelOutcome), outcomeSha256: modelOutcomeRef.sha256,
    }],
    artifacts: [
      { repo: "inkos", path: external(internal.action), sha256: actionRef.sha256, role: "hermes-control-action" },
      { repo: "inkos", path: external(internal.hermesReceipt), sha256: hermesReceiptRef.sha256, role: "hermes-invocation-receipt" },
      { repo: "inkos", path: external(internal.terminal), sha256: terminalRef.sha256, role: "agent-operation-receipt" },
      { repo: "inkos", path: external(internal.run), sha256: runRef.sha256, role: "production-run" },
    ],
  };
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

test("routes agent-operate through the exact sol/codex global InkOS override", () => {
  const workOrder = agentCanaryWorkOrder();
  const manifest = manifestFixture();
  assert.deepEqual(validateWorkOrder(workOrder, manifest), []);
  const plan = buildDispatchPlan({ root: process.cwd(), manifest, workOrder });
  assert.deepEqual(plan.invocation.args.slice(1, 6), ["--service", "codex", "--model", "gpt-5.6-sol", "production"]);
  assert.deepEqual(plan.invocation.args.slice(6, 8), ["agent-operate", "--work-order-sha"]);
  assert.equal(plan.invocation.stdin, null);
});

test("fails closed before production agent-operate when no active promoted adoption exists", () => {
  const workOrder = agentCanaryWorkOrder();
  workOrder.workOrderId = "wo-agent-production-without-adoption";
  workOrder.idempotencyKey = "agent-production-without-adoption";
  workOrder.executionMode = "production";
  workOrder.modeEvidence = { ...workOrder.modeEvidence };
  delete workOrder.modeEvidence.canaryIsolation;
  workOrder.sessionId = deriveAgentOperateSessionId(workOrder);
  workOrder.ownerDecision = {
    ...workOrder.ownerDecision,
    argsSha256: sha256Json({
      capability: workOrder.capability,
      bookId: workOrder.bookId,
      sessionId: workOrder.sessionId,
      args: workOrder.args,
      expectedSoulBinding: workOrder.expectedSoulBinding,
      executionMode: workOrder.executionMode,
      modeEvidence: workOrder.modeEvidence,
      instructionSha256: workOrder.ownerDecision.instructionSha256,
    }),
  };
  assert.throws(
    () => buildDispatchPlan({ root: process.cwd(), manifest: manifestFixture(), workOrder }),
    /production requires one promoted, enabled, decision-bound genre Soul adoption/,
  );
});

test("executes agent-operate once and resumes only the child from complete Hermes artifacts and dead locks", { concurrency: false }, async () => {
  const fixture = await createAgentDispatchFixture();
  const { root, repoPath, executionRoot, canaryProjection, workOrder, manifest, profile } = fixture;
  let hermesCalls = 0;
  let exportCalls = 0;
  let childCalls = 0;
  let childFailure = null;
  let corruptReportedTerminalHash = false;
  let operationPromptText = "";
  let proposalText = "";
  const hermesSessionId = "20260902_120000_agent_fixture";
  const hostileTimeoutEnvironment = {
    HERMES_API_CALL_STALE_TIMEOUT: "1",
    HERMES_CODEX_EVENT_STALE_TIMEOUT_SECONDS: "1",
    HERMES_CODEX_HARD_TIMEOUT_SECONDS: "1",
    HERMES_CODEX_TTFB_TIMEOUT_SECONDS: "1",
    HERMES_STREAM_RETRIES: "99",
  };
  const previousTimeoutEnvironment = Object.fromEntries(
    Object.keys(hostileTimeoutEnvironment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, hostileTimeoutEnvironment);
  try {
    const plan = buildDispatchPlan({ root, manifest, workOrder });
    const hermesSpawn = (_executable, args, options) => {
      hermesCalls += 1;
      assert.deepEqual(args.slice(-2), ["--source", "tool"]);
      assert.ok(args.includes("gpt-5.6-sol"));
      assert.equal(args.includes(workOrder.instruction), false);
      assert.equal(options.env.HERMES_CODEX_EVENT_STALE_TIMEOUT_SECONDS, "120");
      assert.equal(options.env.HERMES_CODEX_TTFB_TIMEOUT_SECONDS, "120");
      assert.equal(options.env.HERMES_API_CALL_STALE_TIMEOUT, "600");
      assert.equal(options.env.HERMES_CODEX_HARD_TIMEOUT_SECONDS, undefined);
      assert.equal(options.env.HERMES_STREAM_RETRIES, undefined);
      assert.equal(options.timeout, 2_100_000);
      operationPromptText = readFileSync(join(options.cwd, "AGENTS.md"), "utf8");
      const proposal = {
        schemaVersion: "hermes-control-proposal/v1",
        action: "write-next",
        workOrderId: workOrder.workOrderId,
        workOrderSha256: plan.invocation.workOrderSha256,
        bookId: workOrder.bookId,
        sessionId: workOrder.sessionId,
        guidance: "상업적 보상과 다음 화 훅을 강화해.",
      };
      proposalText = JSON.stringify(proposal);
      return { status: 0, signal: null, stdout: `${proposalText}\n`, stderr: `session_id: ${hermesSessionId}\n` };
    };
    const sessionExportSpawn = () => {
      exportCalls += 1;
      const session = {
        id: hermesSessionId,
        source: "tool",
        profile_name: profile.profileId,
        model: "gpt-5.6-sol",
        model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }),
        system_prompt: `Hermes prelude\n${operationPromptText}\nHermes suffix`,
        end_reason: "agent_close",
        ended_at: 1,
        message_count: 2,
        api_call_count: 1,
        tool_call_count: 0,
        messages: [
          { role: "user", content: "Emit the single Firefly control proposal defined by the injected operation contract.", tool_calls: [] },
          { role: "assistant", content: proposalText, finish_reason: "stop", tool_calls: [] },
        ],
      };
      return { status: 0, signal: null, stdout: Buffer.from(`${JSON.stringify(session)}\n`), stderr: Buffer.alloc(0) };
    };
    const childSpawn = (_executable, args, options) => {
      try {
        childCalls += 1;
        assert.deepEqual(args.slice(1, 6), ["--service", "codex", "--model", "gpt-5.6-sol", "production"]);
        const envelope = JSON.parse(options.input);
        assert.equal(envelope.schemaVersion, "inkos-agent-operation-request/v1");
        assert.equal(options.cwd, executionRoot);
        assert.equal(envelope.canaryIsolationReceipt.sha256, workOrder.modeEvidence.canaryIsolation.sha256);
        assert.equal(createHash("sha256").update(Buffer.from(envelope.canaryIsolationReceipt.bytes, "base64")).digest("hex"), envelope.canaryIsolationReceipt.sha256);
        const actionBytes = Buffer.from(envelope.hermesAction.bytes, "base64");
        const hermesReceiptBytes = Buffer.from(envelope.hermesReceipt.bytes, "base64");
        assert.equal(createHash("sha256").update(actionBytes).digest("hex"), envelope.hermesAction.sha256);
        assert.equal(createHash("sha256").update(hermesReceiptBytes).digest("hex"), envelope.hermesReceipt.sha256);
        const result = writeStrictAgentChildResult({ repoPath: executionRoot, workOrder, plan, envelope, profile, hermesSessionId, canaryProjection });
        if (corruptReportedTerminalHash) result.agentOperation.receipt.sha256 = "0".repeat(64);
        return { status: 0, signal: null, stdout: `${JSON.stringify(result)}\n`, stderr: "" };
      } catch (error) {
        childFailure = error;
        throw error;
      }
    };

    const first = await executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions });
    assert.equal(first.status, "succeeded", childFailure?.stack ?? JSON.stringify(first.diagnostics ?? {}));
    assert.equal(first.effectiveRuntime.inkos.model, "gpt-5.6-sol");
    assert.equal(first.execution.codeRepoPath, "edge_repos/inkos");
    assert.equal(first.execution.executionRoot, "edge_repos/inkos/.inkos/canaries/pair-fixture/soul");
    assert.deepEqual(first.control.canaryIsolation, canaryProjection);
    assert.equal(JSON.stringify(first).includes(workOrder.instruction), false);
    assert.equal(hermesCalls, 1);
    assert.equal(exportCalls, 1);
    assert.equal(childCalls, 1);

    const terminalReplay = await executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions });
    assert.equal(terminalReplay.replayed, true);
    assert.equal(hermesCalls, 1);
    assert.equal(childCalls, 1);

    const receiptName = `${createHash("sha256").update(workOrder.idempotencyKey).digest("hex").slice(0, 32)}.json`;
    const receiptPath = join(root, ".firefly", "runs", receiptName);
    const originalReceiptBytes = await readFile(receiptPath);
    const terminalPath = join(executionRoot, first.agentOperation.receipt.path);
    const runPath = join(executionRoot, first.productionRun.path);
    const chapterPath = join(executionRoot, first.agentOperation.chapterCommit.path);
    const [originalTerminalBytes, originalRunBytes, originalChapterBytes] = await Promise.all([
      readFile(terminalPath), readFile(runPath), readFile(chapterPath),
    ]);

    await writeFile(receiptPath, `${JSON.stringify({ ...first, control: { ...first.control, lane: "neutral-baseline" } }, null, 2)}\n`);
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /RunReceipt v2 self hash mismatch/,
    );
    await writeFile(receiptPath, originalReceiptBytes);

    const wrongPathReceipt = sealRunReceiptV2({
      ...first,
      agentOperation: {
        ...first.agentOperation,
        receipt: { ...first.agentOperation.receipt, path: `books/${workOrder.bookId}/story/runtime/hermes-control/wrong/terminal.json` },
      },
    });
    await writeFile(receiptPath, `${JSON.stringify(wrongPathReceipt, null, 2)}\n`);
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /stored Agent terminal evidence is invalid/,
    );
    await writeFile(receiptPath, originalReceiptBytes);

    const legacyCanaryTerminal = JSON.parse(originalTerminalBytes.toString("utf8"));
    delete legacyCanaryTerminal.receiptSelfHash;
    legacyCanaryTerminal.schemaVersion = "inkos-agent-operation-terminal/v1";
    legacyCanaryTerminal.receiptSelfHash = hashInkosCanonicalJson(legacyCanaryTerminal);
    const legacyCanaryTerminalBytes = Buffer.from(`${JSON.stringify(legacyCanaryTerminal, null, 2)}\n`);
    const legacyCanaryTerminalSha256 = createHash("sha256").update(legacyCanaryTerminalBytes).digest("hex");
    await writeFile(terminalPath, legacyCanaryTerminalBytes);
    const legacyCanaryRunReceipt = structuredClone(first);
    legacyCanaryRunReceipt.agentOperation.receipt.sha256 = legacyCanaryTerminalSha256;
    legacyCanaryRunReceipt.agentOperation.terminal.sha256 = legacyCanaryTerminalSha256;
    legacyCanaryRunReceipt.artifacts.find((artifact) => artifact.role === "agent-operation-receipt").sha256 = legacyCanaryTerminalSha256;
    await writeFile(receiptPath, `${JSON.stringify(sealRunReceiptV2(legacyCanaryRunReceipt), null, 2)}\n`);
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /stored Agent terminal evidence is invalid: Agent terminal schemaVersion is invalid/,
    );
    await writeFile(terminalPath, originalTerminalBytes);
    await writeFile(receiptPath, originalReceiptBytes);

    const replayDriftPath = join(executionRoot, "books", workOrder.bookId, "rogue-after-terminal.txt");
    await writeFile(replayDriftPath, "drift\n");
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /final lane manifest/,
    );
    await rm(replayDriftPath);

    const duplicateChapterPath = join(chapterPath, "..", "duplicate.json");
    await writeFile(duplicateChapterPath, originalChapterBytes);
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /exactly one matching ChapterCommit/,
    );
    await rm(duplicateChapterPath);

    await rm(chapterPath);
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /ChapterCommit is unavailable/,
    );
    await writeFile(chapterPath, originalChapterBytes);

    const tamperedRun = JSON.parse(originalRunBytes.toString("utf8"));
    tamperedRun.executionStatus = "failed";
    await writeFile(runPath, `${JSON.stringify(tamperedRun, null, 2)}\n`);
    await assert.rejects(
      executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions }),
      /ProductionRun (?:hash|byte length) mismatch/,
    );
    await writeFile(runPath, originalRunBytes);
    assert.equal(hermesCalls, 1, "negative replay probes must not call Hermes");
    assert.equal(childCalls, 1, "negative replay probes must not call InkOS");

    const deadPid = 2147483647;
    const lockBase = { schemaVersion: "firefly-dispatch-lock/v1", pid: deadPid, workOrderId: workOrder.workOrderId, workOrderSha256: first.workOrderSha256, receiptName, acquiredAt: "2026-09-02T00:00:00.000Z" };
    const idempotencyLockPath = join(root, ".firefly", "locks", `idempotency-${receiptName.replace(/\.json$/, ".lock")}`);
    const targetLockPath = join(root, ".firefly", "locks", `inkos--${workOrder.bookId}.lock`);
    await writeFile(idempotencyLockPath, `${JSON.stringify({ ...lockBase, lockKind: "idempotency" })}\n`);
    await writeFile(targetLockPath, `${JSON.stringify({ ...lockBase, lockKind: "target", repo: workOrder.repo, bookId: workOrder.bookId, receiptId: first.receiptId })}\n`);
    const staleLockReplay = await executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions });
    assert.equal(staleLockReplay.replayed, true);
    await assert.rejects(readFile(idempotencyLockPath), { code: "ENOENT" });
    await assert.rejects(readFile(targetLockPath), { code: "ENOENT" });

    await writeFile(targetLockPath, `${JSON.stringify({ ...lockBase, lockKind: "target", pid: process.pid, repo: workOrder.repo, bookId: workOrder.bookId, receiptId: first.receiptId })}\n`);
    const liveLockReplay = await executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions });
    assert.equal(liveLockReplay.replayed, true);
    assert.ok((await readFile(targetLockPath)).byteLength > 0, "live target lock must remain");
    await rm(targetLockPath);

    await writeFile(receiptPath, `${JSON.stringify(sealRunReceiptV2({ ...first, status: "running", replayed: false }), null, 2)}\n`);
    await writeFile(idempotencyLockPath, `${JSON.stringify({ ...lockBase, lockKind: "idempotency" })}\n`);
    await writeFile(targetLockPath, `${JSON.stringify({ ...lockBase, lockKind: "target", repo: workOrder.repo, bookId: workOrder.bookId, receiptId: first.receiptId })}\n`);

    const resumed = await executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions });
    assert.equal(resumed.status, "succeeded");
    assert.equal(hermesCalls, 1, "validated resume must not call Hermes again");
    assert.equal(exportCalls, 1, "validated resume must reuse the exported session");
    assert.equal(childCalls, 2, "validated resume calls only the idempotent InkOS child");

    const strictFailureRunningReceipt = sealRunReceiptV2({
      schemaVersion: 2,
      receiptId: first.receiptId,
      workOrderId: first.workOrderId,
      workOrderSha256: first.workOrderSha256,
      idempotencyKey: first.idempotencyKey,
      repo: first.repo,
      capability: first.capability,
      status: "running",
      mutating: true,
      startedAt: first.startedAt,
      control: first.control,
      approval: first.approval,
      inputVerification: first.inputVerification,
      artifacts: [],
      replayed: false,
    });
    await writeFile(receiptPath, `${JSON.stringify(strictFailureRunningReceipt, null, 2)}\n`);
    corruptReportedTerminalHash = true;
    const strictFailure = await executeWorkOrder({ root, manifest, workOrder, spawn: childSpawn, hermesSpawn, sessionExportSpawn, hermesOptions: hermesReadbackOptions });
    assert.equal(strictFailure.status, "needs-attention");
    assert.equal("agentOperation" in strictFailure, false, "invalid strict terminal evidence must not be projected as a success-shaped Agent operation");
    assert.deepEqual(validateWithContract("run-receipt-v2.schema.json", strictFailure), []);
    assert.equal(hermesCalls, 1);
    assert.equal(exportCalls, 1);
    assert.equal(childCalls, 3);
  } finally {
    for (const [key, value] of Object.entries(previousTimeoutEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("executes neutral-baseline canary in the exact isolated lane with a null Soul binding", async () => {
  const fixture = await createAgentDispatchFixture({ lane: "neutral-baseline" });
  const { root, executionRoot, canaryProjection, workOrder, manifest, profile } = fixture;
  const plan = buildDispatchPlan({ root, manifest, workOrder });
  const hermesSessionId = "20260902_121500_neutral_fixture";
  let operationPromptText = "";
  let proposalText = "";
  let hermesCalls = 0;
  let childCalls = 0;
  try {
    const receipt = await executeWorkOrder({
      root,
      manifest,
      workOrder,
      hermesSpawn: (_executable, _args, options) => {
        hermesCalls += 1;
        operationPromptText = readFileSync(join(options.cwd, "AGENTS.md"), "utf8");
        proposalText = JSON.stringify({
          schemaVersion: "hermes-control-proposal/v1",
          action: "write-next",
          workOrderId: workOrder.workOrderId,
          workOrderSha256: plan.invocation.workOrderSha256,
          bookId: workOrder.bookId,
          sessionId: workOrder.sessionId,
          guidance: "장르 Soul 없이 동일 조건의 상업적 보상을 집필해.",
        });
        return { status: 0, signal: null, stdout: `${proposalText}\n`, stderr: `session_id: ${hermesSessionId}\n` };
      },
      sessionExportSpawn: () => ({
        status: 0,
        signal: null,
        stdout: Buffer.from(`${JSON.stringify({
          id: hermesSessionId,
          source: "tool",
          profile_name: profile.profileId,
          model: "gpt-5.6-sol",
          model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }),
          system_prompt: `Hermes prelude\n${operationPromptText}\nHermes suffix`,
          end_reason: "agent_close",
          ended_at: 1,
          message_count: 2,
          api_call_count: 1,
          tool_call_count: 0,
          messages: [
            { role: "user", content: "Emit the single Firefly control proposal defined by the injected operation contract.", tool_calls: [] },
            { role: "assistant", content: proposalText, finish_reason: "stop", tool_calls: [] },
          ],
        })}\n`),
        stderr: Buffer.alloc(0),
      }),
      spawn: (_executable, _args, options) => {
        childCalls += 1;
        assert.equal(options.cwd, executionRoot);
        const envelope = JSON.parse(options.input);
        assert.equal(envelope.canaryIsolationReceipt.sha256, workOrder.modeEvidence.canaryIsolation.sha256);
        const result = writeStrictAgentChildResult({
          repoPath: executionRoot,
          workOrder,
          plan,
          envelope,
          profile,
          hermesSessionId,
          canaryProjection,
        });
        return { status: 0, signal: null, stdout: `${JSON.stringify(result)}\n`, stderr: "" };
      },
      hermesOptions: hermesReadbackOptions,
    });
    assert.equal(receipt.status, "succeeded", JSON.stringify(receipt.diagnostics ?? {}));
    assert.equal(receipt.control.lane, "neutral-baseline");
    assert.equal(receipt.control.canaryIsolation.lane, "neutral");
    assert.equal(receipt.control.canaryIsolation.expectedSoulBinding, null);
    assert.equal(receipt.execution.executionRoot, "edge_repos/inkos/.inkos/canaries/pair-fixture/neutral");
    assert.equal(receipt.agentOperation.canaryIsolation.expectedSoulBinding, null);
    assert.equal(receipt.productionRun.executionStatus, "succeeded");
    assert.deepEqual(validateWithContract("run-receipt-v2.schema.json", receipt), []);
    assert.equal(hermesCalls, 1);
    assert.equal(childCalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed on canary receipt, source, lane, and symlink drift before Hermes", async (t) => {
  const cases = [
    {
      name: "raw receipt drift",
      expected: /raw hash or byte length mismatch/,
      mutate: async ({ repoPath, workOrder }) => {
        await writeFile(join(repoPath, workOrder.modeEvidence.canaryIsolation.path), "{}\n");
      },
    },
    {
      name: "source Book drift",
      expected: /source InkOS snapshot changed|source Book config ID mismatch/,
      mutate: async ({ repoPath }) => {
        await writeFile(join(repoPath, "books", "demo-book", "book.json"), `${JSON.stringify({ id: "demo-book", title: "drift" })}\n`);
      },
    },
    {
      name: "lane manifest drift",
      expected: /lane changed after its sealed preparation snapshot/,
      mutate: async ({ executionRoot }) => {
        await writeFile(join(executionRoot, "rogue.txt"), "drift\n");
      },
    },
    {
      name: "receipt symlink",
      expected: /forbidden symlink/,
      mutate: async ({ repoPath, workOrder }) => {
        const receiptPath = join(repoPath, workOrder.modeEvidence.canaryIsolation.path);
        await rm(receiptPath);
        await symlink(join(repoPath, "inkos.json"), receiptPath);
      },
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const fixture = await createAgentDispatchFixture();
      let hermesCalls = 0;
      let childCalls = 0;
      try {
        await entry.mutate(fixture);
        await assert.rejects(
          executeWorkOrder({
            root: fixture.root,
            manifest: fixture.manifest,
            workOrder: fixture.workOrder,
            hermesSpawn: () => { hermesCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
            spawn: () => { childCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
            hermesOptions: hermesReadbackOptions,
          }),
          entry.expected,
        );
        assert.equal(hermesCalls, 0);
        assert.equal(childCalls, 0);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("seals a crashed dirty canary lane as recovery-required and never auto-retries it", async () => {
  const { root, executionRoot, canaryProjection, workOrder, manifest } = await createAgentDispatchFixture();
  let hermesCalls = 0;
  let childCalls = 0;
  try {
    const plan = buildDispatchPlan({ root, manifest, workOrder });
    const receiptName = `${createHash("sha256").update(workOrder.idempotencyKey).digest("hex").slice(0, 32)}.json`;
    const runsDir = join(root, ".firefly", "runs");
    const locksDir = join(root, ".firefly", "locks");
    const receiptPath = join(runsDir, receiptName);
    const targetLockPath = join(locksDir, `inkos--${workOrder.bookId}.lock`);
    await mkdir(runsDir, { recursive: true });
    await mkdir(locksDir, { recursive: true });
    const running = sealRunReceiptV2({
      schemaVersion: 2,
      receiptId: "rr-canary-recovery-fixture",
      workOrderId: workOrder.workOrderId,
      workOrderSha256: plan.invocation.workOrderSha256,
      idempotencyKey: workOrder.idempotencyKey,
      repo: workOrder.repo,
      capability: workOrder.capability,
      status: "running",
      mutating: true,
      startedAt: "2026-09-02T00:00:00.000Z",
      control: {
        executionMode: workOrder.executionMode,
        lane: workOrder.modeEvidence.lane,
        modeEvidenceSha256: sha256Json(workOrder.modeEvidence),
        canaryIsolation: canaryProjection,
      },
      approval: { required: true, status: "pending" },
      inputVerification: {
        approvedCount: 0,
        privateCount: 0,
        setSha256: sha256Json({ inputVerification: [], privateInputVerification: [] }),
      },
      artifacts: [],
      instruction: workOrder.instruction,
      replayed: false,
    });
    await writeFile(receiptPath, `${JSON.stringify(running, null, 2)}\n`);
    await writeFile(join(executionRoot, "interrupted-partial-write.txt"), "partial\n");
    const targetLock = {
      schemaVersion: "firefly-dispatch-lock/v1",
      lockKind: "target",
      pid: process.pid,
      workOrderId: workOrder.workOrderId,
      workOrderSha256: plan.invocation.workOrderSha256,
      repo: workOrder.repo,
      bookId: workOrder.bookId,
      receiptName,
      receiptId: running.receiptId,
      acquiredAt: "2026-09-02T00:00:00.000Z",
    };
    await writeFile(targetLockPath, `${JSON.stringify(targetLock)}\n`);
    await assert.rejects(
      executeWorkOrder({
        root,
        manifest,
        workOrder,
        hermesSpawn: () => { hermesCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
        spawn: () => { childCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
        hermesOptions: hermesReadbackOptions,
      }),
      /mutating target is locked/,
    );
    assert.equal(JSON.parse(await readFile(receiptPath, "utf8")).status, "running");
    assert.equal(JSON.parse(await readFile(targetLockPath, "utf8")).pid, process.pid, "live target lock must remain untouched");

    await writeFile(targetLockPath, `${JSON.stringify({ ...targetLock, pid: 2147483647 })}\n`);
    const recovery = await executeWorkOrder({
      root,
      manifest,
      workOrder,
      hermesSpawn: () => { hermesCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
      spawn: () => { childCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
      hermesOptions: hermesReadbackOptions,
    });
    assert.equal(recovery.status, "needs-attention");
    assert.equal(recovery.error.category, "canary-recovery-required");
    assert.equal(recovery.approval.status, "pending");
    assert.equal("agentOperation" in recovery, false);
    assert.equal(JSON.stringify(recovery).includes(workOrder.instruction), false, "recovery receipt must be reconstructed bodylessly");
    assert.deepEqual(validateWithContract("run-receipt-v2.schema.json", recovery), []);
    await assert.rejects(readFile(targetLockPath), { code: "ENOENT" });

    const replay = await executeWorkOrder({
      root,
      manifest,
      workOrder,
      hermesSpawn: () => { hermesCalls += 1; return { status: 0, stdout: "{}", stderr: "" }; },
      spawn: () => { childCalls += 1; return { status: 0, stdout: "{}", stderr: "" }; },
      hermesOptions: hermesReadbackOptions,
    });
    assert.equal(replay.status, "needs-attention");
    assert.equal(replay.replayed, true);
    assert.equal(hermesCalls, 0);
    assert.equal(childCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records an ambiguous Hermes crash once and never retries automatically", async () => {
  const { root, workOrder, manifest } = await createAgentDispatchFixture();
  let hermesCalls = 0;
  let childCalls = 0;
  try {
    const plan = buildDispatchPlan({ root, manifest, workOrder });
    const receiptName = `${createHash("sha256").update(workOrder.idempotencyKey).digest("hex").slice(0, 32)}.json`;
    const locksDir = join(root, ".firefly", "locks");
    await mkdir(locksDir, { recursive: true });
    await writeFile(join(locksDir, `idempotency-${receiptName.replace(/\.json$/, ".lock")}`), `${JSON.stringify({
      schemaVersion: "firefly-dispatch-lock/v1",
      lockKind: "idempotency",
      pid: 2147483647,
      workOrderId: workOrder.workOrderId,
      workOrderSha256: plan.invocation.workOrderSha256,
      receiptName,
      acquiredAt: "2026-09-02T00:00:00.000Z",
    })}\n`);
    const receipt = await executeWorkOrder({
      root,
      manifest,
      workOrder,
      spawn: () => { childCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
      hermesSpawn: () => {
        hermesCalls += 1;
        return { status: 1, signal: null, stdout: "partial provider output", stderr: "provider connection closed" };
      },
      sessionExportSpawn: () => { throw new Error("session export must not run after ambiguous provider failure"); },
      hermesOptions: hermesReadbackOptions,
    });
    assert.equal(receipt.status, "needs-attention");
    assert.equal(receipt.error.category, "hermes-ambiguous-no-retry");
    assert.deepEqual(validateWithContract("run-receipt-v2.schema.json", receipt), []);
    assert.equal(childCalls, 0);
    const markerPath = join(root, receipt.hermesInvocation.evidence.needsAttention.path);
    assert.equal(JSON.parse(await readFile(markerPath, "utf8")).automaticRetryAllowed, false);
    const replayed = await executeWorkOrder({
      root,
      manifest,
      workOrder,
      spawn: () => { childCalls += 1; return { status: 1, stdout: "", stderr: "" }; },
      hermesSpawn: () => { hermesCalls += 1; return { status: 0, stdout: "{}", stderr: "" }; },
      hermesOptions: hermesReadbackOptions,
    });
    assert.equal(replayed.replayed, true);
    assert.equal(hermesCalls, 1);
    assert.equal(childCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps completed Hermes evidence completed when the InkOS child throws", async () => {
  const { root, workOrder, manifest, profile } = await createAgentDispatchFixture();
  const plan = buildDispatchPlan({ root, manifest, workOrder });
  const hermesSessionId = "20260902_130000_child_throw";
  let operationPromptText = "";
  let proposalText = "";
  let hermesCalls = 0;
  let childCalls = 0;
  try {
    const receipt = await executeWorkOrder({
      root,
      manifest,
      workOrder,
      hermesSpawn: (_executable, _args, options) => {
        hermesCalls += 1;
        operationPromptText = readFileSync(join(options.cwd, "AGENTS.md"), "utf8");
        proposalText = JSON.stringify({
          schemaVersion: "hermes-control-proposal/v1",
          action: "write-next",
          workOrderId: workOrder.workOrderId,
          workOrderSha256: plan.invocation.workOrderSha256,
          bookId: workOrder.bookId,
          sessionId: workOrder.sessionId,
          guidance: "후반 보상을 강화해.",
        });
        return { status: 0, signal: null, stdout: `${proposalText}\n`, stderr: `session_id: ${hermesSessionId}\n` };
      },
      sessionExportSpawn: () => ({
        status: 0,
        signal: null,
        stdout: Buffer.from(`${JSON.stringify({
          id: hermesSessionId,
          source: "tool",
          profile_name: profile.profileId,
          model: "gpt-5.6-sol",
          model_config: JSON.stringify({ max_iterations: 1, reasoning_config: { effort: "high" } }),
          system_prompt: `Hermes prelude\n${operationPromptText}\nHermes suffix`,
          end_reason: "agent_close",
          ended_at: 1,
          message_count: 2,
          api_call_count: 1,
          tool_call_count: 0,
          messages: [
            { role: "user", content: "Emit the single Firefly control proposal defined by the injected operation contract.", tool_calls: [] },
            { role: "assistant", content: proposalText, finish_reason: "stop", tool_calls: [] },
          ],
        })}\n`),
        stderr: Buffer.alloc(0),
      }),
      spawn: () => {
        childCalls += 1;
        throw new Error("simulated InkOS spawn failure");
      },
      hermesOptions: hermesReadbackOptions,
    });
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.hermesInvocation.schemaVersion, "hermes-invocation-receipt/v1");
    assert.equal(receipt.hermesInvocation.sessionId, hermesSessionId);
    assert.equal("status" in receipt.hermesInvocation, false);
    assert.equal("needsAttention" in receipt.hermesInvocation.evidence, false);
    assert.equal(receipt.error.category, "dispatcher-failed");
    assert.equal(hermesCalls, 1);
    assert.equal(childCalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  for (const unsafeBookId of [
    " book", "book ", "\uFEFFbook", "book..part", "book:colon", "book\ncontrol", 'book"inject', "a".repeat(121),
  ]) {
    assert.ok(
      validateWorkOrder(writeNextV2WorkOrder({ bookId: unsafeBookId }), manifest)
        .some((error) => error.includes("safe path segment")),
      `unsafe InkOS Book ID must fail in HQ: ${JSON.stringify(unsafeBookId)}`,
    );
  }
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
    const runUnsigned = {
      schemaVersion: "production-run/v1",
      command: { commandId: "cmd-1" },
      productionAttempt: { productionOperationId: "prod-1", attemptId: "attempt-1" },
      executionStatus: "succeeded",
      approvalStatus: "pending",
      completionHealth: "verified",
      projectionHealth: "verified",
      projectionOrigin: "direct",
      evidence: { kind: "verified-commit", commitState: "verified" },
    };
    const run = { ...runUnsigned, runSelfHash: hashInkosCanonicalJson(runUnsigned) };
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
        hermesE2E: false,
        orchestrator: {
          ...workOrder.runtime,
          invoked: false,
          evidence: "work-order-declaration",
        },
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
    assert.equal(receipt.status, "succeeded", JSON.stringify(receipt.diagnostics ?? {}));
    assert.equal(receipt.boundaryChecks.artifactReportsValid, true);
    assert.equal(receipt.boundaryChecks.privateBodyExcluded, true);
    assert.equal(receipt.productionRun.sha256, result.productionRun.sha256);
    assert.equal(receipt.effectiveRuntime.hermesE2E, false);
    assert.equal(receipt.effectiveRuntime.orchestrator.invoked, false);
    assert.equal(receipt.effectiveRuntime.orchestrator.evidence, "work-order-declaration");
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
      effectiveRuntime: {
        ...result.effectiveRuntime,
        hermesE2E: false,
        orchestrator: {
          ...tamperedOrder.runtime,
          invoked: false,
          evidence: "work-order-declaration",
        },
      },
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

    const falseHermesOrder = writeNextV2WorkOrder({
      workOrderId: "wo-write-next-v2-false-hermes",
      idempotencyKey: "write-next-v2-false-hermes",
    });
    const falseHermesPlan = buildDispatchPlan({ root, manifest, workOrder: falseHermesOrder });
    const falseHermesResult = {
      ...result,
      workOrder: { id: falseHermesOrder.workOrderId, sha256: falseHermesPlan.invocation.workOrderSha256 },
      effectiveRuntime: {
        ...result.effectiveRuntime,
        hermesE2E: true,
        orchestrator: {
          ...falseHermesOrder.runtime,
          invoked: true,
          evidence: "self-reported",
        },
      },
    };
    const falseHermesReceipt = await executeWorkOrder({
      root,
      manifest,
      workOrder: falseHermesOrder,
      spawn: () => ({ status: 0, signal: null, stdout: `${JSON.stringify(falseHermesResult)}\n`, stderr: "" }),
    });
    assert.equal(falseHermesReceipt.status, "needs-attention");
    assert.equal(falseHermesReceipt.boundaryChecks.artifactReportsValid, false);
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
