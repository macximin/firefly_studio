import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { validateManifest } from "./edge-lib.mjs";
import {
  validateHermesBlindEvaluatorRegistry,
  verifyHermesBlindEvaluatorRegistry,
} from "./hermes-blind-evaluator-lib.mjs";
import { validateHermesNeutralProfileRegistry, validateHermesProfileRegistry } from "./hermes-profile-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const PAIR_ID = /^bp-[0-9a-f]{24}$/;
const RUN_ID = /^br-[0-9a-f]{24}$/;
const SAFE_BOOK_ID = /^(?!.*\.\.)(?![\s\uFEFF])(?!.*[\s\uFEFF]$)[^\u0000-\u001f\u007f/\\:*?"'`{}<>|]{1,120}$/u;
const CONFIG_KEYS = new Set([
  "schemaVersion", "batchId", "idNamespaceSha256", "roundsPerGenre", "chapterCount",
  "targetLength", "instruction", "sourceAuthority", "genres",
]);
const GENRE_KEYS = new Set([
  "genreId", "bookId", "profileId", "soulId", "soulVersion",
  "analysisProfilePath", "managerQaPath", "routingCatalogPath",
]);
const PLAN_KEYS = new Set([
  "schemaVersion", "batchId", "ownerApproval", "authorities", "blindMappingAuthority",
  "blindMappingPresent", "pairCount", "pairs", "planSha256",
]);
const PAIR_KEYS = new Set([
  "pairId", "blindRunId", "ordinal", "genreId", "bookId", "profileId", "soulId",
  "soulVersion", "round", "sourceBook", "sourceRegistryReceipt", "candidateDecision",
  "workOrderDrafts",
]);
const WORK_ORDER_DRAFT_KEYS = new Set([
  "schemaVersion", "pairId", "blindRunId", "repo", "capability", "executionMode", "bookId",
  "instructionSha256", "args", "runtime", "canaryIsolationBinding", "draftId", "lane",
  "profileId", "profileConfigSha256", "profileSoulSha256", "expectedSoulBinding",
]);
const ARTIFACT_REF_KEYS = new Set(["path", "sha256", "sizeBytes"]);
const EXACT_GENRE_BINDINGS = Object.freeze({
  "modern-fantasy-ko": { profileId: "inkos_male_modern_fantasy", soulId: "male-modern-fantasy-ko" },
  "fantasy-ko": { profileId: "inkos_male_fantasy", soulId: "male-fantasy-ko" },
  "murim-ko": { profileId: "inkos_male_murim", soulId: "male-murim-ko" },
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashCanonical(value) {
  return sha256Bytes(Buffer.from(canonicalStringify(value), "utf8"));
}

function exactKeys(value, keys, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) if (!keys.has(key)) errors.push(`${label} has unknown field: ${key}`);
  for (const key of keys) if (!(key in value)) errors.push(`${label}.${key} is required`);
}

function assertExactKeys(value, keys, label) {
  const errors = [];
  exactKeys(value, keys, label, errors);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

function assertArtifactRef(value, label) {
  assertExactKeys(value, ARTIFACT_REF_KEYS, label);
  if (!safeRelativePath(value.path) || !SHA256.test(value.sha256 ?? "") || !Number.isInteger(value.sizeBytes) || value.sizeBytes < 1) {
    throw new Error(`${label} is invalid`);
  }
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || isAbsolute(value)) return false;
  const normalized = normalize(value);
  return normalized === value && normalized !== "." && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

export function validateBlindCanaryBatchConfig(config) {
  const errors = [];
  exactKeys(config, CONFIG_KEYS, "batch config", errors);
  if (!isObject(config)) return errors;
  if (config.schemaVersion !== "firefly-blind-canary-batch-config/v1") errors.push("batch config schemaVersion is invalid");
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/u.test(config.batchId ?? "")) errors.push("batch config batchId is invalid");
  if (!SHA256.test(config.idNamespaceSha256 ?? "")) errors.push("batch config idNamespaceSha256 is invalid");
  if (config.roundsPerGenre !== 3) errors.push("batch config must run exactly three rounds per genre");
  if (config.chapterCount !== 1) errors.push("batch config chapterCount must be one");
  exactKeys(config.targetLength, new Set(["count", "unit"]), "batch config targetLength", errors);
  if (!Number.isInteger(config.targetLength?.count) || config.targetLength.count < 1 || config.targetLength.unit !== "ko-chars") {
    errors.push("batch config targetLength is invalid");
  }
  if (typeof config.instruction !== "string" || !config.instruction.trim()) errors.push("batch config instruction is required");
  exactKeys(config.sourceAuthority, new Set(["repo", "receiptPath"]), "batch config sourceAuthority", errors);
  if (config.sourceAuthority?.repo !== "firefly_reference_lab" || !safeRelativePath(config.sourceAuthority?.receiptPath)) {
    errors.push("batch config source authority is invalid");
  }
  if (!Array.isArray(config.genres) || config.genres.length !== 3) {
    errors.push("batch config must contain exactly three genres");
    return errors;
  }
  const genres = new Set();
  const books = new Set();
  const profiles = new Set();
  for (const [index, item] of config.genres.entries()) {
    const label = `batch config genres[${index}]`;
    exactKeys(item, GENRE_KEYS, label, errors);
    if (!isObject(item)) continue;
    const expected = EXACT_GENRE_BINDINGS[item.genreId];
    if (!expected) errors.push(`${label}.genreId is outside the exact three-genre batch`);
    else if (item.profileId !== expected.profileId || item.soulId !== expected.soulId || item.soulVersion !== "v1") {
      errors.push(`${label} genre/profile/Soul binding mismatch`);
    }
    if (!SAFE_BOOK_ID.test(item.bookId ?? "")) errors.push(`${label}.bookId is invalid`);
    for (const [field, value] of [["analysisProfilePath", item.analysisProfilePath], ["managerQaPath", item.managerQaPath], ["routingCatalogPath", item.routingCatalogPath]]) {
      if (!safeRelativePath(value)) errors.push(`${label}.${field} is invalid`);
    }
    if (genres.has(item.genreId)) errors.push(`duplicate genreId: ${item.genreId}`);
    if (books.has(item.bookId)) errors.push(`duplicate bookId: ${item.bookId}`);
    if (profiles.has(item.profileId)) errors.push(`duplicate profileId: ${item.profileId}`);
    genres.add(item.genreId);
    books.add(item.bookId);
    profiles.add(item.profileId);
  }
  for (const genreId of Object.keys(EXACT_GENRE_BINDINGS)) if (!genres.has(genreId)) errors.push(`missing required genreId: ${genreId}`);
  return errors;
}

function runGit(repoRoot, args, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const result = spawn("git", ["-C", repoRoot, ...args], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8").trim() : String(result.stderr ?? "").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed for ${repoRoot}`);
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
}

async function assertRealDirectory(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory: ${path}`);
}

async function readStableFile(path, label) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`${label} must be a non-symlink regular file: ${path}`, { cause: error });
  }
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || BigInt(bytes.byteLength) !== before.size) {
      throw new Error(`${label} changed during readback: ${path}`);
    }
    if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes: ${path}`);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readContainedStableFile(root, relativePath, label) {
  if (!safeRelativePath(relativePath)) throw new Error(`${label} path is invalid`);
  const parts = relativePath.split("/");
  let cursor = root;
  for (const [index, part] of parts.entries()) {
    cursor = join(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`${label} path contains a symlink: ${relativePath}`);
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error(`${label} parent must be a real directory: ${relativePath}`);
  }
  return readStableFile(cursor, label);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON`);
  }
}

export async function verifyReachableRepository(repoRoot, expected = {}, options = {}) {
  await assertRealDirectory(repoRoot, `${expected.name ?? "evidence"} repository`);
  const resolvedRoot = await realpath(repoRoot);
  const head = runGit(resolvedRoot, ["rev-parse", "HEAD"], options).toString("utf8").trim();
  if (!GIT_COMMIT.test(head)) throw new Error(`${expected.name ?? "evidence"} repository HEAD is invalid`);
  const branch = expected.branch ?? runGit(resolvedRoot, ["branch", "--show-current"], options).toString("utf8").trim();
  const originRef = `origin/${branch}`;
  const originHead = runGit(resolvedRoot, ["rev-parse", originRef], options).toString("utf8").trim();
  if (!GIT_COMMIT.test(originHead)) throw new Error(`${expected.name ?? "evidence"} ${originRef} is invalid`);
  // A merely reachable local commit can be behind origin and therefore omit a
  // later authority revocation or source correction.  Batch inputs must be the
  // exact remote-tracked tip, not an arbitrary ancestor of it.
  if (head !== originHead) {
    throw new Error(`${expected.name ?? "evidence"} HEAD must exactly match ${originRef} before batch planning`);
  }
  if (expected.remoteUrl) {
    const actualRemote = runGit(resolvedRoot, ["remote", "get-url", "origin"], options).toString("utf8").trim();
    if (actualRemote !== expected.remoteUrl) throw new Error(`${expected.name} origin URL mismatch`);
  }
  return { root: resolvedRoot, commit: head, originRef, originCommit: originHead };
}

export async function readCommittedArtifact(repo, path, label, options = {}, parse = true) {
  if (!safeRelativePath(path)) throw new Error(`${label} path is invalid`);
  const worktreeBytes = await readContainedStableFile(repo.root, path, label);
  const committedBytes = runGit(repo.root, ["show", `${repo.commit}:${path}`], options);
  if (!worktreeBytes.equals(committedBytes)) throw new Error(`${label} has stale or uncommitted byte drift`);
  return {
    bytes: worktreeBytes,
    value: parse ? parseJson(worktreeBytes, label) : null,
    ref: { path, sha256: sha256Bytes(worktreeBytes), sizeBytes: worktreeBytes.byteLength },
  };
}

function assertEvidenceIdentity(value, item, label) {
  if (!isObject(value) || value.soulId !== item.soulId || value.version !== item.soulVersion || value.genre !== item.genreId) {
    throw new Error(`${label} genre/profile/Soul identity mismatch`);
  }
}

function opaqueId(prefix, namespace, ordinal) {
  return `${prefix}-${sha256Bytes(Buffer.from(canonicalStringify({ domain: prefix, namespace, ordinal }), "utf8")).slice(0, 24)}`;
}

function assertOpaquePlan(plan) {
  const pairIds = new Set();
  const runIds = new Set();
  for (const pair of plan.pairs ?? []) {
    if (!PAIR_ID.test(pair.pairId ?? "")) throw new Error("batch plan pairId is not opaque");
    if (!RUN_ID.test(pair.blindRunId ?? "")) throw new Error("batch plan blindRunId is not opaque");
    if (pairIds.has(pair.pairId)) throw new Error("batch plan has a duplicate pairId");
    if (runIds.has(pair.blindRunId)) throw new Error("batch plan has a duplicate blindRunId");
    pairIds.add(pair.pairId);
    runIds.add(pair.blindRunId);
  }
  const forbiddenKey = /^(?:mapping|blindMapping|laneMapping|candidateA|candidateB|candidateLabel)$/u;
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKey.test(key)) throw new Error(`batch plan exposes a forbidden blind mapping field: ${key}`);
      visit(child);
    }
  };
  visit(plan);
}

export function validateBlindCanaryBatchPlan(plan) {
  try {
    if (!isObject(plan) || plan.schemaVersion !== "firefly-blind-canary-batch-plan/v1") throw new Error("batch plan schemaVersion is invalid");
    assertExactKeys(plan, PLAN_KEYS, "batch plan");
    const { planSha256, ...unsigned } = plan;
    if (!SHA256.test(planSha256 ?? "") || planSha256 !== hashCanonical(unsigned)) throw new Error("batch plan self hash mismatch");
    if (!Array.isArray(plan.pairs) || plan.pairs.length !== 9) throw new Error("batch plan must contain exactly nine pairs");
    if (plan.pairCount !== plan.pairs.length || plan.blindMappingPresent !== false || plan.blindMappingAuthority !== "inkos-csprng-private-receipt-only") {
      throw new Error("batch plan count or blind-mapping boundary is invalid");
    }
    if (plan.authorities?.evaluator?.profileId !== "inkos_blind_evaluator"
      || plan.authorities.evaluator.configSha256 !== "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46"
      || plan.authorities.evaluator.soulSha256 !== "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b") {
      throw new Error("batch plan evaluator authority mismatch");
    }
    assertOpaquePlan(plan);
    const genreRounds = new Set();
    for (const pair of plan.pairs) {
      assertExactKeys(pair, PAIR_KEYS, "batch plan pair");
      if (!EXACT_GENRE_BINDINGS[pair.genreId]) throw new Error("batch plan genre is invalid");
      if (![1, 2, 3].includes(pair.round)) throw new Error("batch plan round is invalid");
      const expected = EXACT_GENRE_BINDINGS[pair.genreId];
      if (pair.profileId !== expected.profileId || pair.soulId !== expected.soulId || pair.soulVersion !== "v1") {
        throw new Error("batch plan cross-genre/profile mismatch");
      }
      const genreRound = `${pair.genreId}:${pair.round}`;
      if (genreRounds.has(genreRound)) throw new Error("batch plan has a duplicate genre round");
      genreRounds.add(genreRound);
      assertArtifactRef(pair.sourceBook, "batch plan source Book");
      assertArtifactRef(pair.sourceRegistryReceipt, "batch plan source registry receipt");
      assertArtifactRef(pair.candidateDecision, "batch plan candidate decision");
      if (!isObject(pair.workOrderDrafts)) throw new Error("batch plan WorkOrder drafts are invalid");
      assertExactKeys(pair.workOrderDrafts, new Set(["neutral", "genreSoul"]), "batch plan WorkOrder drafts");
      assertExactKeys(pair.workOrderDrafts.neutral, WORK_ORDER_DRAFT_KEYS, "neutral WorkOrder draft");
      assertExactKeys(pair.workOrderDrafts.genreSoul, WORK_ORDER_DRAFT_KEYS, "genre Soul WorkOrder draft");
      if (pair.workOrderDrafts?.neutral?.lane !== "neutral-baseline" || pair.workOrderDrafts?.genreSoul?.lane !== "genre-soul") {
        throw new Error("batch plan WorkOrder lanes are invalid");
      }
      if (pair.workOrderDrafts.neutral.expectedSoulBinding !== null || pair.workOrderDrafts.genreSoul.expectedSoulBinding !== "from-inkos-canary-receipt") {
        throw new Error("batch plan WorkOrder Soul binding source is invalid");
      }
      if (pair.workOrderDrafts.neutral.instructionSha256 !== pair.workOrderDrafts.genreSoul.instructionSha256
        || hashCanonical(pair.workOrderDrafts.neutral.args) !== hashCanonical(pair.workOrderDrafts.genreSoul.args)) {
        throw new Error("batch plan WorkOrder pair does not share exact task inputs");
      }
      for (const draft of [pair.workOrderDrafts.neutral, pair.workOrderDrafts.genreSoul]) {
        if (draft.pairId !== pair.pairId || draft.blindRunId !== pair.blindRunId || draft.bookId !== pair.bookId
          || draft.repo !== "inkos" || draft.capability !== "agent-operate" || draft.executionMode !== "promotion-canary"
          || draft.schemaVersion !== "firefly-agent-operate-work-order-draft/v1"
          || draft.canaryIsolationBinding !== "pending-inkos-prepare"
          || draft.runtime?.model !== "gpt-5.6-sol" || draft.runtime?.reasoning !== "high") {
          throw new Error("batch plan WorkOrder identity or runtime mismatch");
        }
      }
      if (pair.workOrderDrafts.neutral.profileId !== "inkos_neutral_baseline"
        || pair.workOrderDrafts.genreSoul.profileId !== pair.profileId) {
        throw new Error("batch plan WorkOrder profile mismatch");
      }
    }
    if (genreRounds.size !== 9) throw new Error("batch plan does not cover three exact rounds per genre");
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

export async function loadBlindCanaryBatchAuthority({ root, manifest, config, profileRegistry, neutralRegistry, evaluatorRegistry }, options = {}) {
  const errors = [
    ...validateManifest(manifest).map((error) => `manifest: ${error}`),
    ...validateBlindCanaryBatchConfig(config),
    ...validateHermesProfileRegistry(profileRegistry).map((error) => `production profiles: ${error}`),
    ...validateHermesNeutralProfileRegistry(neutralRegistry).map((error) => `neutral profile: ${error}`),
    ...validateHermesBlindEvaluatorRegistry(evaluatorRegistry).map((error) => `blind evaluator: ${error}`),
  ];
  if (errors.length > 0) throw new Error(errors.join("\n"));
  // Re-read the live evaluator immediately before minting the plan.  A prior
  // `npm run validate` is not sufficient: the local Hermes profile may change
  // between that check and this authority snapshot.
  const evaluatorReadback = await (options.verifyEvaluator ?? verifyHermesBlindEvaluatorRegistry)(evaluatorRegistry, options.evaluatorOptions);
  if (
    !evaluatorReadback || evaluatorReadback.profileId !== evaluatorRegistry.profile.profileId
    || evaluatorReadback.configSha256 !== evaluatorRegistry.profile.configSha256
    || evaluatorReadback.soulSha256 !== evaluatorRegistry.profile.soulSha256
    || evaluatorReadback.provider !== evaluatorRegistry.profile.provider
    || evaluatorReadback.model !== evaluatorRegistry.profile.model
    || evaluatorReadback.reasoning !== evaluatorRegistry.profile.reasoning
    || evaluatorReadback.toolsCount !== 0
  ) throw new Error("live Hermes blind evaluator readback does not match the fixed registry");
  const inkosManifest = manifest.repos.find((repo) => repo.name === "inkos");
  const referenceManifest = manifest.repos.find((repo) => repo.name === "firefly_reference_lab");
  if (!inkosManifest || !referenceManifest || manifest.policy?.defaultProductionEngine !== "inkos") {
    throw new Error("manifest does not preserve InkOS production and Reference Lab evidence authority");
  }
  const hqRepo = await verifyReachableRepository(root, { name: "firefly_studio", branch: "main" }, options);
  const inkosRepo = await verifyReachableRepository(join(root, inkosManifest.path), inkosManifest, options);
  const referenceRepo = await verifyReachableRepository(join(root, referenceManifest.path), referenceManifest, options);
  const [manifestArtifact, batchConfigArtifact, profileRegistryArtifact, neutralRegistryArtifact, evaluatorRegistryArtifact, sourceRegistryArtifact] = await Promise.all([
    readCommittedArtifact(hqRepo, "config/edge-repos.json", "HQ edge repository manifest", options),
    readCommittedArtifact(hqRepo, "config/blind-canary-batch.json", "HQ blind canary batch config", options),
    readCommittedArtifact(hqRepo, "config/hermes-production-profiles.json", "HQ Hermes production profile registry", options),
    readCommittedArtifact(hqRepo, "config/hermes-neutral-production-profile.json", "HQ neutral profile registry", options),
    readCommittedArtifact(hqRepo, "config/hermes-blind-evaluator.json", "HQ blind evaluator registry", options),
    readCommittedArtifact(referenceRepo, config.sourceAuthority.receiptPath, "Reference Lab source registry receipt", options),
  ]);
  if (canonicalStringify(manifestArtifact.value) !== canonicalStringify(manifest)) throw new Error("HQ manifest input is not its exact committed artifact");
  if (canonicalStringify(batchConfigArtifact.value) !== canonicalStringify(config)) throw new Error("HQ batch config input is not its exact committed artifact");
  if (canonicalStringify(profileRegistryArtifact.value) !== canonicalStringify(profileRegistry)) throw new Error("HQ profile registry input is not its exact committed artifact");
  if (canonicalStringify(neutralRegistryArtifact.value) !== canonicalStringify(neutralRegistry)) throw new Error("HQ neutral registry input is not its exact committed artifact");
  if (canonicalStringify(evaluatorRegistryArtifact.value) !== canonicalStringify(evaluatorRegistry)) throw new Error("HQ evaluator registry input is not its exact committed artifact");
  if (sourceRegistryArtifact.value.schemaVersion !== "source-registry-receipt/v1") throw new Error("source registry receipt schemaVersion is invalid");
  const sourceReceipt = sourceRegistryArtifact.value;
  if (sourceReceipt.rawSourceTracked !== false) throw new Error("source registry receipt must keep raw source material untracked");
  const sourceLinked = await Promise.all([
    [sourceReceipt.inventoryPath, sourceReceipt.inventorySha256, "source inventory", true],
    [sourceReceipt.privateRegistryPath, sourceReceipt.privateRegistrySha256, "private source registry", false],
    [sourceReceipt.managerSelectionPath, sourceReceipt.managerSelectionSha256, "manager source selection", true],
  ].map(async ([path, expectedSha, label, mustBeCommitted]) => {
    const artifact = mustBeCommitted
      ? await readCommittedArtifact(referenceRepo, path, label, options)
      : await readContainedStableFile(referenceRepo.root, path, label).then((bytes) => ({
        bytes,
        value: parseJson(bytes, label),
        ref: { path, sha256: sha256Bytes(bytes), sizeBytes: bytes.byteLength },
      }));
    if (artifact.ref.sha256 !== expectedSha) throw new Error(`${label} hash does not match source registry receipt`);
    return artifact.ref;
  }));

  const genres = [];
  for (const item of config.genres) {
    const profile = profileRegistry.profiles.find((candidate) => candidate.profileId === item.profileId);
    if (!profile || profile.soulId !== item.soulId || profile.soulVersion !== item.soulVersion || profile.lifecycle !== "candidate" || profile.productionEnabled !== false) {
      throw new Error(`${item.genreId} candidate profile registry mismatch`);
    }
    const [analysis, managerQa, routingCatalog] = await Promise.all([
      readCommittedArtifact(referenceRepo, item.analysisProfilePath, `${item.genreId} analysis profile`, options),
      readCommittedArtifact(referenceRepo, item.managerQaPath, `${item.genreId} manager QA`, options),
      readCommittedArtifact(referenceRepo, item.routingCatalogPath, `${item.genreId} routing catalog`, options),
    ]);
    assertEvidenceIdentity(analysis.value, item, `${item.genreId} analysis profile`);
    assertEvidenceIdentity(managerQa.value, item, `${item.genreId} manager QA`);
    assertEvidenceIdentity(routingCatalog.value, item, `${item.genreId} routing catalog`);

    const bookPath = `books/${item.bookId}/book.json`;
    const bookBytes = await readContainedStableFile(inkosRepo.root, bookPath, `${item.genreId} source Book config`);
    const book = parseJson(bookBytes, `${item.genreId} source Book config`);
    if (book.id !== item.bookId || book.genre !== item.genreId) throw new Error(`${item.genreId} source Book identity mismatch`);

    const genreProfilePath = `packages/core/genres/${item.genreId}.md`;
    const genreProfileBytes = runGit(inkosRepo.root, ["show", `${inkosRepo.commit}:${genreProfilePath}`], options);
    const genreProfileWorktree = await readContainedStableFile(inkosRepo.root, genreProfilePath, `${item.genreId} InkOS genre profile`);
    if (!genreProfileBytes.equals(genreProfileWorktree)) throw new Error(`${item.genreId} InkOS genre profile has stale or uncommitted byte drift`);
    const packageRoot = `packages/core/souls/${item.soulId}/${item.soulVersion}`;
    const packageManifest = await readCommittedArtifact(inkosRepo, `${packageRoot}/manifest.json`, `${item.genreId} Writer Soul package manifest`, options);
    if (packageManifest.value.soulId !== item.soulId || packageManifest.value.version !== item.soulVersion || packageManifest.value.schemaVersion !== "soul-package/v1") {
      throw new Error(`${item.genreId} Writer Soul package identity mismatch`);
    }
    const packageFilePaths = [packageManifest.value.promptPath, ...(packageManifest.value.resources ?? [])];
    if (new Set(packageFilePaths).size !== packageFilePaths.length || packageFilePaths.some((path) => !safeRelativePath(path))) {
      throw new Error(`${item.genreId} Writer Soul package paths are invalid`);
    }
    const packageFiles = await Promise.all(packageFilePaths.map((path) => readCommittedArtifact(inkosRepo, `${packageRoot}/${path}`, `${item.genreId} Writer Soul package file`, options, false)));
    const packageSha256 = hashCanonical({
      schemaVersion: "writer-soul-package/v1",
      soulId: item.soulId,
      version: item.soulVersion,
      packageManifest: packageManifest.ref,
      files: packageFiles.map((artifact) => artifact.ref),
    });
    genres.push({
      ...item,
      profile,
      sourceBook: { path: bookPath, sha256: sha256Bytes(bookBytes), sizeBytes: bookBytes.byteLength },
      referenceLab: { analysisProfile: analysis.ref, managerQa: managerQa.ref, routingCatalog: routingCatalog.ref },
      writerGenreProfile: {
        schemaVersion: "genre-profile-read-receipt/v1",
        requestedGenre: item.genreId,
        resolvedProfileId: item.genreId,
        source: "builtin",
        profilePath: `builtin-genres/${item.genreId}.md`,
        profileSha256: sha256Bytes(genreProfileBytes),
        profileSizeBytes: genreProfileBytes.byteLength,
        language: "ko",
      },
      writerSoulPackage: {
        packageManifest: packageManifest.ref,
        files: packageFiles.map((artifact) => artifact.ref),
        packageSha256,
      },
    });
  }
  return {
    repositories: { hq: hqRepo, inkos: inkosRepo, referenceLab: referenceRepo },
    artifacts: {
      manifest: manifestArtifact.ref,
      batchConfig: batchConfigArtifact.ref,
      profileRegistry: profileRegistryArtifact.ref,
      neutralRegistry: neutralRegistryArtifact.ref,
      evaluatorRegistry: evaluatorRegistryArtifact.ref,
      sourceRegistry: sourceRegistryArtifact.ref,
      sourceLinked,
    },
    profiles: { neutral: neutralRegistry.profile, evaluator: evaluatorRegistry.profile },
    genres,
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertBundleAuthority(config, authority) {
  for (const [label, commit] of Object.entries({
    HQ: authority?.repositories?.hq?.commit,
    InkOS: authority?.repositories?.inkos?.commit,
    "Reference Lab": authority?.repositories?.referenceLab?.commit,
  })) if (!GIT_COMMIT.test(commit ?? "")) throw new Error(`${label} authority commit is invalid`);
  if (authority?.profiles?.neutral?.profileId !== "inkos_neutral_baseline") throw new Error("neutral authority profile mismatch");
  if (
    authority?.profiles?.evaluator?.profileId !== "inkos_blind_evaluator"
    || authority.profiles.evaluator.configSha256 !== "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46"
    || authority.profiles.evaluator.soulSha256 !== "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b"
  ) throw new Error("blind evaluator authority mismatch");
  if (!Array.isArray(authority?.genres) || authority.genres.length !== config.genres.length) throw new Error("batch authority genre count mismatch");
  for (const configured of config.genres) {
    const item = authority.genres.find((candidate) => candidate.genreId === configured.genreId);
    if (
      !item || item.bookId !== configured.bookId || item.profile?.profileId !== configured.profileId
      || item.profile?.soulId !== configured.soulId || item.profile?.soulVersion !== configured.soulVersion
      || item.soulId !== configured.soulId || item.soulVersion !== configured.soulVersion
    ) throw new Error(`${configured.genreId} batch authority cross-genre/profile mismatch`);
  }
}

export function buildBlindCanaryBatchBundle({ config, authority, approvedAt }) {
  const configErrors = validateBlindCanaryBatchConfig(config);
  if (configErrors.length > 0) throw new Error(configErrors.join("\n"));
  assertBundleAuthority(config, authority);
  if (typeof approvedAt !== "string" || Number.isNaN(Date.parse(approvedAt)) || new Date(approvedAt).toISOString() !== approvedAt) {
    throw new Error("owner approvedAt must be an explicit canonical ISO timestamp");
  }
  const approvalUnsigned = {
    schemaVersion: "firefly-canary-batch-owner-approval/v1",
    approvalId: `approval-${sha256Bytes(Buffer.from(`${config.batchId}:${approvedAt}`, "utf8")).slice(0, 24)}`,
    batchId: config.batchId,
    decision: "approved",
    actorId: "owner",
    actorRole: "owner",
    scope: "candidate-soul-binding-and-nine-pair-preparation-generation-and-independent-evaluation-only",
    promotionAuthorized: false,
    manuscriptWinnerSelectionAuthorized: false,
    approvedAt,
    batchConfigSha256: hashCanonical(config),
  };
  const approval = { ...approvalUnsigned, approvalSha256: hashCanonical(approvalUnsigned) };
  const profileRegistryRef = authority.artifacts.profileRegistry;
  const decisions = authority.genres.map((item, index) => {
    const decision = {
      schemaVersion: "soul-binding-decision/v2",
      kind: "bind-soul",
      decisionId: `sbd-${sha256Bytes(Buffer.from(`${config.idNamespaceSha256}:decision:${index}`, "utf8")).slice(0, 24)}`,
      actorId: "owner",
      actorRole: "owner",
      bookId: item.bookId,
      soulId: item.soulId,
      soulVersion: item.soulVersion,
      status: "candidate",
      createdAt: approvedAt,
      adoptionEvidence: {
        schemaVersion: "soul-adoption-evidence/v1",
        referenceLab: {
          repo: "firefly_reference_lab",
          commit: authority.repositories.referenceLab.commit,
          ...item.referenceLab,
        },
        writerGenreProfile: {
          repo: "inkos",
          commit: authority.repositories.inkos.commit,
          receipt: item.writerGenreProfile,
        },
        executorSoul: {
          repo: "firefly_studio",
          commit: authority.repositories.hq.commit,
          profileRegistry: profileRegistryRef,
          profileId: item.profile.profileId,
          soulSha256: item.profile.soulSha256,
          configSha256: item.profile.configSha256,
        },
        writerSoulPackage: {
          repo: "inkos",
          commit: authority.repositories.inkos.commit,
          ...item.writerSoulPackage,
        },
        hqAdoption: null,
      },
    };
    const bytes = jsonBytes(decision);
    return {
      genreId: item.genreId,
      bookId: item.bookId,
      soulId: item.soulId,
      soulVersion: item.soulVersion,
      path: `decisions/${item.soulId}/${item.soulVersion}/decision.json`,
      sha256: sha256Bytes(bytes),
      sizeBytes: bytes.byteLength,
      value: decision,
      bytes,
    };
  });
  const decisionByGenre = new Map(decisions.map((decision) => [decision.genreId, decision]));
  const instructionSha256 = sha256Bytes(Buffer.from(config.instruction, "utf8"));
  const args = { chapterCount: config.chapterCount, targetLength: config.targetLength };
  const pairs = [];
  let ordinal = 0;
  for (const item of authority.genres) {
    for (let round = 1; round <= config.roundsPerGenre; round += 1) {
      ordinal += 1;
      const pairId = opaqueId("bp", config.idNamespaceSha256, ordinal);
      const blindRunId = opaqueId("br", config.idNamespaceSha256, ordinal);
      const common = {
        schemaVersion: "firefly-agent-operate-work-order-draft/v1",
        pairId,
        blindRunId,
        repo: "inkos",
        capability: "agent-operate",
        executionMode: "promotion-canary",
        bookId: item.bookId,
        instructionSha256,
        args,
        runtime: { model: "gpt-5.6-sol", reasoning: "high" },
        canaryIsolationBinding: "pending-inkos-prepare",
      };
      pairs.push({
        pairId,
        blindRunId,
        ordinal,
        genreId: item.genreId,
        bookId: item.bookId,
        profileId: item.profile.profileId,
        soulId: item.soulId,
        soulVersion: item.soulVersion,
        round,
        sourceBook: item.sourceBook,
        sourceRegistryReceipt: authority.artifacts.sourceRegistry,
        candidateDecision: {
          path: decisionByGenre.get(item.genreId).path,
          sha256: decisionByGenre.get(item.genreId).sha256,
          sizeBytes: decisionByGenre.get(item.genreId).sizeBytes,
        },
        workOrderDrafts: {
          neutral: {
            ...common,
            draftId: `wo-${sha256Bytes(Buffer.from(`${pairId}:neutral`, "utf8")).slice(0, 24)}`,
            lane: "neutral-baseline",
            profileId: authority.profiles.neutral.profileId,
            profileConfigSha256: authority.profiles.neutral.configSha256,
            profileSoulSha256: authority.profiles.neutral.soulSha256,
            expectedSoulBinding: null,
          },
          genreSoul: {
            ...common,
            draftId: `wo-${sha256Bytes(Buffer.from(`${pairId}:soul`, "utf8")).slice(0, 24)}`,
            lane: "genre-soul",
            profileId: item.profile.profileId,
            profileConfigSha256: item.profile.configSha256,
            profileSoulSha256: item.profile.soulSha256,
            expectedSoulBinding: "from-inkos-canary-receipt",
          },
        },
      });
    }
  }
  const planUnsigned = {
    schemaVersion: "firefly-blind-canary-batch-plan/v1",
    batchId: config.batchId,
    ownerApproval: { path: "owner-approval.json", sha256: sha256Bytes(jsonBytes(approval)), sizeBytes: jsonBytes(approval).byteLength },
    authorities: {
      hqCommit: authority.repositories.hq.commit,
      inkosCommit: authority.repositories.inkos.commit,
      referenceLabCommit: authority.repositories.referenceLab.commit,
      manifest: authority.artifacts.manifest,
      batchConfig: authority.artifacts.batchConfig,
      profileRegistry: authority.artifacts.profileRegistry,
      neutralRegistry: authority.artifacts.neutralRegistry,
      evaluatorRegistry: authority.artifacts.evaluatorRegistry,
      sourceRegistryReceipt: authority.artifacts.sourceRegistry,
      evaluator: {
        profileId: authority.profiles.evaluator.profileId,
        configSha256: authority.profiles.evaluator.configSha256,
        soulSha256: authority.profiles.evaluator.soulSha256,
      },
    },
    blindMappingAuthority: "inkos-csprng-private-receipt-only",
    blindMappingPresent: false,
    pairCount: pairs.length,
    pairs,
  };
  assertOpaquePlan(planUnsigned);
  const plan = { ...planUnsigned, planSha256: hashCanonical(planUnsigned) };
  const validationErrors = validateBlindCanaryBatchPlan(plan);
  if (validationErrors.length > 0) throw new Error(validationErrors.join("\n"));
  return { approval, decisions, plan };
}

export const BLIND_CANARY_ID_PATTERNS = Object.freeze({ pair: PAIR_ID, run: RUN_ID });
