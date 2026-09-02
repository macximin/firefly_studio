import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { validateHermesProfileRegistry } from "./hermes-profile-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,239}$/;
const REGISTRY_KEYS = new Set(["schemaVersion", "active"]);
const ACTIVE_KEYS = new Set([
  "soulId", "soulVersion", "soulSha256", "profileId", "profileConfigSha256",
  "decisionPath", "decisionSha256",
]);
const DECISION_KEYS = new Set([
  "schemaVersion", "soulId", "soulVersion", "candidateSoulSha256", "promptPackSha256",
  "referenceLabEligibility", "inputReceiptSha256s", "decisionId", "decision",
  "decidedByActorId", "decidedByRole", "approvalReceiptSha256", "decidedAt",
]);
const ELIGIBILITY_KEYS = new Set(["repo", "commit", "path", "sha256"]);
const INPUT_RECEIPT_KEYS = new Set([
  "sourceManifest", "coverage", "managerQa", "pathCanary", "promotionCanary",
  "pairedGeneration", "blindReviews", "genreIdentity", "reviewPacket",
]);
const REFERENCE_LAB_MANAGER_QA_SCHEMAS = new Set([
  "genre-soul-manager-qa/v2",
  "genre-soul-manager-qa/v3",
]);
const REFERENCE_LAB_GENRES = new Set(["modern-fantasy-ko", "fantasy-ko", "murim-ko"]);
const MANAGER_QA_TOP_KEYS = [
  "schemaVersion", "state", "genre", "soulId", "version", "profile", "privateInput",
  "manager", "decidedAt", "sources", "engineComparisons", "checks", "contentNeutrality",
  "surfaceReview", "authority", "result",
];
const MANAGER_QA_CHECK_KEYS = Object.freeze({
  "genre-soul-manager-qa/v2": [
    "profileEvidenceBinding", "exactSourceCoverage", "rawSampleReadback",
    "primaryEnginesPairwiseDifferent", "profileSurfaceLeakScanPassed", "contentNeutrality",
  ],
  "genre-soul-manager-qa/v3": [
    "profileEvidenceBinding", "exactSourceCoverage", "rawSampleReadback",
    "phaseAwareCollectiveEvidenceComplete", "engineRelationsEvidenceComplete",
    "profileSurfaceLeakScanPassed", "contentNeutrality",
  ],
});
const PROMOTION_ELIGIBILITY_KEYS = [
  "schemaVersion", "genre", "status", "deepReadSourceCount", "reviewPacketSchema",
  "blindPairCount", "independentBlindRunCount", "soulWins", "averageCommercialScore",
  "winningPairMinimumGain", "genreIdentityPassed", "contentNeutralViolationCount",
  "unauthorizedCanonWriteCount", "allSurfaceMatchesHumanClassified", "canonLeakCount",
  "managerQaPassed", "leakScanMatchCount", "ownerDecisionRequired", "ownerDecisionId",
  "deepReadReceiptSha256s", "reviewPacketSha256s", "blindReviewReceiptSha256s",
  "contentNeutralReceiptSha256s", "surfaceComparisonReceiptSha256s",
  "managerQaReceiptSha256", "leakScanReceiptSha256", "generationRunIds", "blindRunIds",
  "inputSha256s", "authority",
];
const MAX_REFERENCE_LAB_BLOB_BYTES = 16 * 1024 * 1024;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeJson(bytes, label) {
  if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function requireExactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys are invalid`);
  }
}

function requireText(value, label) {
  if (!hasText(value)) throw new Error(`${label} must be a non-empty string`);
}

function requireSha(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be a full SHA-256`);
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
}

function requireIsoDate(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be ISO-8601 compatible`);
  }
}

function requireRepoRelativePath(value, label) {
  requireText(value, label);
  const normalized = normalize(value);
  if (
    isAbsolute(value)
    || value.includes("\\")
    || value.includes("\0")
    || normalized !== value
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith(`..${sep}`)
  ) throw new Error(`${label} must stay inside the repository`);
}

function requireUniqueSortedStrings(values, label, { length, minimum = 1, pattern } = {}) {
  if (
    !Array.isArray(values)
    || values.length < minimum
    || values.some((value) => !hasText(value))
    || new Set(values).size !== values.length
    || values.some((value, index) => value !== [...values].sort()[index])
  ) throw new Error(`${label} must be a unique sorted non-empty string array`);
  if (length !== undefined && values.length !== length) throw new Error(`${label} must contain exactly ${length} values`);
  if (pattern && values.some((value) => !pattern.test(value))) throw new Error(`${label} contains an invalid value`);
}

function requireBoundReference(value, label, extraKeys = []) {
  requireExactKeys(value, ["path", "sha256", "sizeBytes", ...extraKeys], label);
  requireRepoRelativePath(value.path, `${label}.path`);
  requireSha(value.sha256, `${label}.sha256`);
  requirePositiveInteger(value.sizeBytes, `${label}.sizeBytes`);
}

function validateExactKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} has unknown field: ${key}`);
  }
}

function validateRelativePath(value, label, errors) {
  if (!hasText(value)) {
    errors.push(`${label} is required`);
    return;
  }
  const normalized = normalize(value);
  if (
    isAbsolute(normalized)
    || normalized === ".."
    || normalized.startsWith(`..${sep}`)
    || value.split(/[\\/]+/).includes("..")
  ) errors.push(`${label} must stay inside the HQ repository`);
}

function validateShaArray(value, label, minimum, errors) {
  if (!Array.isArray(value) || value.length < minimum) {
    errors.push(`${label} must contain at least ${minimum} SHA-256 receipt(s)`);
    return;
  }
  const seen = new Set();
  for (const [index, digest] of value.entries()) {
    if (!SHA256.test(digest ?? "")) errors.push(`${label}[${index}] is invalid`);
    if (seen.has(digest)) errors.push(`${label}[${index}] duplicates an earlier receipt`);
    seen.add(digest);
  }
}

export function validateGenreSoulPromotionDecision(decision) {
  const errors = [];
  if (!isObject(decision)) return ["genre Soul promotion decision must be an object"];
  validateExactKeys(decision, DECISION_KEYS, "decision", errors);
  if (decision.schemaVersion !== "genre_soul_promotion/v1") errors.push("decision schemaVersion is invalid");
  for (const field of ["soulId", "soulVersion"]) {
    if (!SAFE_ID.test(decision[field] ?? "")) errors.push(`decision.${field} is invalid`);
  }
  if (!SHA256.test(decision.candidateSoulSha256 ?? "")) errors.push("decision.candidateSoulSha256 is invalid");
  if (!SHA256.test(decision.promptPackSha256 ?? "")) errors.push("decision.promptPackSha256 is invalid");
  if (!isObject(decision.referenceLabEligibility)) {
    errors.push("decision.referenceLabEligibility must be an object");
  } else {
    validateExactKeys(decision.referenceLabEligibility, ELIGIBILITY_KEYS, "decision.referenceLabEligibility", errors);
    if (decision.referenceLabEligibility.repo !== "firefly_reference_lab") errors.push("decision.referenceLabEligibility.repo is invalid");
    if (!SHA1.test(decision.referenceLabEligibility.commit ?? "")) errors.push("decision.referenceLabEligibility.commit is invalid");
    validateRelativePath(decision.referenceLabEligibility.path, "decision.referenceLabEligibility.path", errors);
    if (!SHA256.test(decision.referenceLabEligibility.sha256 ?? "")) errors.push("decision.referenceLabEligibility.sha256 is invalid");
  }
  if (!isObject(decision.inputReceiptSha256s)) {
    errors.push("decision.inputReceiptSha256s must be an object");
  } else {
    validateExactKeys(decision.inputReceiptSha256s, INPUT_RECEIPT_KEYS, "decision.inputReceiptSha256s", errors);
    const receipts = decision.inputReceiptSha256s;
    for (const field of ["sourceManifest", "pathCanary", "promotionCanary", "reviewPacket"]) {
      if (!SHA256.test(receipts[field] ?? "")) errors.push(`decision.inputReceiptSha256s.${field} is invalid`);
    }
    validateShaArray(receipts.coverage, "decision.inputReceiptSha256s.coverage", 1, errors);
    validateShaArray(receipts.managerQa, "decision.inputReceiptSha256s.managerQa", 1, errors);
    validateShaArray(receipts.pairedGeneration, "decision.inputReceiptSha256s.pairedGeneration", 3, errors);
    validateShaArray(receipts.blindReviews, "decision.inputReceiptSha256s.blindReviews", 3, errors);
    validateShaArray(receipts.genreIdentity, "decision.inputReceiptSha256s.genreIdentity", 3, errors);
  }
  if (!hasText(decision.decisionId) || decision.decisionId.length > 240) errors.push("decision.decisionId is invalid");
  if (!['promote', 'hold', 'reject'].includes(decision.decision)) errors.push("decision.decision is invalid");
  if (!hasText(decision.decidedByActorId) || decision.decidedByActorId.length > 240) errors.push("decision.decidedByActorId is invalid");
  if (decision.decidedByRole !== "owner") errors.push("decision.decidedByRole must be owner");
  if (!SHA256.test(decision.approvalReceiptSha256 ?? "")) errors.push("decision.approvalReceiptSha256 is invalid");
  if (!hasText(decision.decidedAt) || Number.isNaN(Date.parse(decision.decidedAt))) errors.push("decision.decidedAt must be an ISO date-time");
  return errors;
}

export function validateGenreSoulAdoptionRegistry(registry, profileRegistry) {
  const errors = [];
  if (!isObject(registry)) return ["genre Soul adoption registry must be an object"];
  validateExactKeys(registry, REGISTRY_KEYS, "registry", errors);
  if (registry.schemaVersion !== "genre-soul-adoption-registry/v1") errors.push("adoption registry schemaVersion is invalid");
  if (!Array.isArray(registry.active)) {
    errors.push("adoption registry active must be an array");
    return errors;
  }
  const profileErrors = validateHermesProfileRegistry(profileRegistry);
  errors.push(...profileErrors.map((error) => `Hermes profile registry: ${error}`));
  const profiles = new Map(Array.isArray(profileRegistry?.profiles)
    ? profileRegistry.profiles.map((profile) => [profile.profileId, profile])
    : []);
  const activeSoulIds = new Set();
  const activeProfileIds = new Set();
  for (const [index, entry] of registry.active.entries()) {
    const label = `active[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    validateExactKeys(entry, ACTIVE_KEYS, label, errors);
    for (const field of ["soulId", "soulVersion", "profileId"]) {
      if (!SAFE_ID.test(entry[field] ?? "")) errors.push(`${label}.${field} is invalid`);
    }
    if (!SHA256.test(entry.soulSha256 ?? "")) errors.push(`${label}.soulSha256 is invalid`);
    if (!SHA256.test(entry.profileConfigSha256 ?? "")) errors.push(`${label}.profileConfigSha256 is invalid`);
    validateRelativePath(entry.decisionPath, `${label}.decisionPath`, errors);
    if (!SHA256.test(entry.decisionSha256 ?? "")) errors.push(`${label}.decisionSha256 is invalid`);
    if (activeSoulIds.has(entry.soulId)) errors.push(`duplicate active Soul: ${entry.soulId}`);
    activeSoulIds.add(entry.soulId);
    if (activeProfileIds.has(entry.profileId)) errors.push(`duplicate active Hermes profile: ${entry.profileId}`);
    activeProfileIds.add(entry.profileId);
    const expectedPath = `adoptions/genre-souls/${entry.soulId}/${entry.soulVersion}/decision.json`;
    if (entry.decisionPath !== expectedPath) errors.push(`${label}.decisionPath must be ${expectedPath}`);
    const profile = profiles.get(entry.profileId);
    if (!profile) {
      errors.push(`${label}.profileId is not registered`);
    } else {
      if (profile.lifecycle !== "promoted" || profile.productionEnabled !== true) errors.push(`${label} requires a promoted, production-enabled Hermes profile`);
      if (profile.soulId !== entry.soulId || profile.soulVersion !== entry.soulVersion || profile.soulSha256 !== entry.soulSha256) {
        errors.push(`${label} Soul identity does not match its Hermes profile`);
      }
      if (profile.configSha256 !== entry.profileConfigSha256) errors.push(`${label}.profileConfigSha256 does not match its Hermes profile`);
      if (profile.promotionDecisionSha256 !== entry.decisionSha256) errors.push(`${label}.decisionSha256 does not match its Hermes profile`);
    }
  }
  for (const profile of profiles.values()) {
    if (profile.lifecycle === "promoted" && !activeProfileIds.has(profile.profileId)) {
      errors.push(`promoted Hermes profile is absent from the active adoption registry: ${profile.profileId}`);
    }
  }
  return errors;
}

async function readRealUtf8File(path, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a real regular file: ${path}`);
  const bytes = await readFile(path);
  if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes: ${path}`);
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return bytes;
}

function gitBytes(spawn, repoPath, args, label) {
  const result = spawn("git", ["--no-replace-objects", "-C", repoPath, ...args], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: MAX_REFERENCE_LAB_BLOB_BYTES,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8").trim()
      : String(result.stderr ?? "").trim();
    throw new Error(`${label} is unavailable${stderr ? `: ${stderr}` : ""}`);
  }
  const stdout = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? "");
  if (stdout.byteLength > MAX_REFERENCE_LAB_BLOB_BYTES) {
    throw new Error(`${label} exceeds the byte limit`);
  }
  return stdout;
}

function referenceLabRepoPath(root, manifest, spawn) {
  const repo = manifest?.repos?.find((candidate) => candidate.name === "firefly_reference_lab");
  if (!repo) throw new Error("Reference Lab is absent from the HQ manifest");
  if (!hasText(repo.branch)) throw new Error("Reference Lab manifest branch is invalid");
  const absoluteRoot = resolve(root);
  const repoPath = resolve(root, repo.path);
  const lexicalRelativePath = relative(absoluteRoot, repoPath);
  if (
    lexicalRelativePath === ".."
    || lexicalRelativePath.startsWith(`..${sep}`)
    || isAbsolute(lexicalRelativePath)
  ) {
    throw new Error("Reference Lab manifest path escaped the HQ repository");
  }
  const actualOrigin = gitBytes(spawn, repoPath, ["remote", "get-url", "origin"], "Reference Lab origin")
    .toString("utf8").trim();
  if (actualOrigin !== repo.remoteUrl) throw new Error("Reference Lab origin does not match the HQ manifest");
  gitBytes(spawn, repoPath, ["check-ref-format", "--branch", repo.branch], "Reference Lab manifest branch");
  return { repoPath, branch: repo.branch };
}

function verifyReferenceLabCommit({ repoPath, branch, commit, spawn }) {
  const objectType = gitBytes(spawn, repoPath, ["cat-file", "-t", commit], "Reference Lab commit type")
    .toString("utf8").trim();
  if (objectType !== "commit") throw new Error("Reference Lab commit is not an exact commit object");
  const remoteBranch = `refs/remotes/origin/${branch}`;
  gitBytes(spawn, repoPath, ["rev-parse", "--verify", `${remoteBranch}^{commit}`], "Reference Lab origin branch");
  gitBytes(
    spawn,
    repoPath,
    ["merge-base", "--is-ancestor", commit, remoteBranch],
    "Reference Lab commit origin ancestry",
  );
}

function readReferenceLabBlob({ repoPath, commit, path, spawn, label }) {
  const pathErrors = [];
  validateRelativePath(path, `${label} path`, pathErrors);
  if (pathErrors.length > 0) throw new Error(pathErrors.join("\n"));
  return gitBytes(spawn, repoPath, ["show", `${commit}:${path}`], label);
}

function requireReferenceLabIdentity(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw new Error(`${label}.${key} does not match the adoption decision`);
  }
}

export function validateReferenceLabManagerQaProjection(managerQa, expected) {
  requireText(expected?.profileId, "Reference Lab expected Hermes profile ID");
  requireSha(expected?.profileConfigSha256, "Reference Lab expected Hermes profile config SHA");
  if (!REFERENCE_LAB_MANAGER_QA_SCHEMAS.has(managerQa?.schemaVersion)) {
    throw new Error("Reference Lab Manager QA schema is not supported");
  }
  requireExactKeys(managerQa, MANAGER_QA_TOP_KEYS, "Reference Lab Manager QA");
  if (!REFERENCE_LAB_GENRES.has(managerQa.genre)) throw new Error("Reference Lab Manager QA genre is invalid");
  requireReferenceLabIdentity(managerQa, {
    state: "candidate-qa-passed",
    genre: expected.genre,
    soulId: expected.soulId,
    version: expected.soulVersion,
    result: "pass",
  }, "Reference Lab Manager QA");
  if (managerQa.soulId !== "male-" + managerQa.genre || managerQa.version !== "v1") {
    throw new Error("Reference Lab Manager QA Soul identity is invalid");
  }

  requireExactKeys(managerQa.profile, [
    "path", "sha256", "sizeBytes", "synthesisRunId", "leakScanReceipt",
  ], "Reference Lab Manager QA profile");
  const expectedProfilePath = "analyses/genre_souls/" + managerQa.soulId + "/v1/genre-profile.json";
  requireRepoRelativePath(managerQa.profile.path, "Reference Lab Manager QA profile.path");
  if (managerQa.profile.path !== expectedProfilePath) throw new Error("Reference Lab Manager QA profile path is invalid");
  requireSha(managerQa.profile.sha256, "Reference Lab Manager QA profile.sha256");
  requirePositiveInteger(managerQa.profile.sizeBytes, "Reference Lab Manager QA profile.sizeBytes");
  requireText(managerQa.profile.synthesisRunId, "Reference Lab Manager QA profile.synthesisRunId");
  requireBoundReference(managerQa.profile.leakScanReceipt, "Reference Lab Manager QA profile leak receipt");
  if (
    managerQa.profile.leakScanReceipt.path
      !== "analyses/genre_souls/" + managerQa.soulId + "/v1/leak-scan-receipts/genre-profile.json"
  ) throw new Error("Reference Lab Manager QA profile leak receipt path is invalid");

  requireExactKeys(managerQa.privateInput, [
    "schemaVersion", "path", "sha256", "sizeBytes", "sourceIds", "rawSampleCount",
  ], "Reference Lab Manager QA private input");
  const expectedPrivateSchema = managerQa.schemaVersion === "genre-soul-manager-qa/v3"
    ? "private-genre-soul-manager-qa-input/v3"
    : "private-genre-soul-manager-qa-input/v2";
  if (managerQa.privateInput.schemaVersion !== expectedPrivateSchema) {
    throw new Error("Reference Lab Manager QA private input schema is invalid");
  }
  requireRepoRelativePath(managerQa.privateInput.path, "Reference Lab Manager QA private input.path");
  const privatePrefix = "exports/genre-souls/" + managerQa.soulId + "/v1/manager-qa-runs/";
  const privateSuffix = "/input.json";
  const privateRunKey = managerQa.privateInput.path.slice(privatePrefix.length, -privateSuffix.length);
  if (
    !managerQa.privateInput.path.startsWith(privatePrefix)
    || !managerQa.privateInput.path.endsWith(privateSuffix)
    || !SHA256.test(privateRunKey)
  ) throw new Error("Reference Lab Manager QA private input path is invalid");
  requireSha(managerQa.privateInput.sha256, "Reference Lab Manager QA private input.sha256");
  requirePositiveInteger(managerQa.privateInput.sizeBytes, "Reference Lab Manager QA private input.sizeBytes");
  requireUniqueSortedStrings(managerQa.privateInput.sourceIds, "Reference Lab Manager QA private source IDs", {
    length: 3,
    pattern: /^gdrive-[A-Za-z0-9_-]+$/,
  });
  if (managerQa.privateInput.rawSampleCount !== 9) throw new Error("Reference Lab Manager QA must bind nine samples");

  requireExactKeys(managerQa.manager, [
    "actorId", "role", "runId", "inputDigest", "model", "provider", "reasoningEffort",
    "configSha256", "traceReceiptSha256", "outputSha256",
  ], "Reference Lab Manager QA manager");
  if (
    managerQa.manager.role !== "manager"
    || managerQa.manager.actorId !== `hermes:${expected.profileId}:${managerQa.manager.runId}`
    || !hasText(managerQa.manager.runId)
    || managerQa.manager.runId === managerQa.profile.synthesisRunId
    || managerQa.manager.model !== "gpt-5.6-sol"
    || managerQa.manager.provider !== "openai-codex"
    || managerQa.manager.reasoningEffort !== "high"
    || managerQa.manager.configSha256 !== expected.profileConfigSha256
  ) throw new Error("Reference Lab Manager QA manager identity is invalid");
  for (const key of ["inputDigest", "configSha256", "traceReceiptSha256", "outputSha256"]) {
    requireSha(managerQa.manager[key], "Reference Lab Manager QA manager." + key);
  }
  requireIsoDate(managerQa.decidedAt, "Reference Lab Manager QA decidedAt");

  if (!Array.isArray(managerQa.sources) || managerQa.sources.length !== 3) {
    throw new Error("Reference Lab Manager QA must bind exactly three sources");
  }
  const sourceIds = managerQa.sources.map((source) => source?.sourceId);
  if (
    sourceIds.some((sourceId) => !/^gdrive-[A-Za-z0-9_-]+$/.test(sourceId ?? ""))
    || new Set(sourceIds).size !== 3
    || JSON.stringify([...sourceIds].sort()) !== JSON.stringify(managerQa.privateInput.sourceIds)
  ) throw new Error("Reference Lab Manager QA source cardinality or identity is invalid");
  const sourceById = new Map();
  for (const source of managerQa.sources) {
    if (!isObject(source) || !hasText(source.engineId)) {
      throw new Error("Reference Lab Manager QA source envelope is invalid");
    }
    if (
      !Array.isArray(source.samples)
      || source.samples.length !== 3
      || source.samples.some((sample) => !isObject(sample))
      || JSON.stringify(source.samples.map((sample) => sample.span).sort())
        !== JSON.stringify(["early", "late", "middle"])
      || (managerQa.schemaVersion === "genre-soul-manager-qa/v3"
        && !isObject(source.collectiveAssessment))
    ) throw new Error("Reference Lab Manager QA source samples must bind exactly early, middle, and late");
    sourceById.set(source.sourceId, source);
  }
  if (
    !Array.isArray(managerQa.engineComparisons)
    || managerQa.engineComparisons.length !== 3
    || managerQa.engineComparisons.some((comparison) => !isObject(comparison))
  ) throw new Error("Reference Lab Manager QA comparison cardinality is invalid");
  const expectedPairs = [];
  const canonicalSourceIds = [...sourceIds].sort();
  for (let leftIndex = 0; leftIndex < canonicalSourceIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < canonicalSourceIds.length; rightIndex += 1) {
      expectedPairs.push(`${canonicalSourceIds[leftIndex]}::${canonicalSourceIds[rightIndex]}`);
    }
  }
  const actualPairs = managerQa.engineComparisons.map((comparison) => {
    const left = sourceById.get(comparison.leftSourceId);
    const right = sourceById.get(comparison.rightSourceId);
    if (
      !left
      || !right
      || comparison.leftSourceId >= comparison.rightSourceId
      || comparison.leftEngineId !== left.engineId
      || comparison.rightEngineId !== right.engineId
    ) throw new Error("Reference Lab Manager QA comparison source or engine binding is invalid");
    return `${comparison.leftSourceId}::${comparison.rightSourceId}`;
  });
  if (JSON.stringify(actualPairs.sort()) !== JSON.stringify(expectedPairs.sort())) {
    throw new Error("Reference Lab Manager QA comparison pair set is incomplete or duplicated");
  }

  requireExactKeys(
    managerQa.checks,
    MANAGER_QA_CHECK_KEYS[managerQa.schemaVersion],
    "Reference Lab Manager QA checks",
  );
  if (Object.values(managerQa.checks).some((value) => value !== true)) {
    throw new Error("Reference Lab Manager QA deterministic checks did not all pass");
  }
  requireExactKeys(managerQa.contentNeutrality, [
    "moralFitnessGate", "automaticRewrite", "userIntensityPreserved",
  ], "Reference Lab Manager QA content neutrality");
  if (
    managerQa.contentNeutrality.moralFitnessGate !== false
    || managerQa.contentNeutrality.automaticRewrite !== false
    || managerQa.contentNeutrality.userIntensityPreserved !== true
  ) throw new Error("Reference Lab Manager QA content neutrality is invalid");

  requireExactKeys(managerQa.surfaceReview, [
    "schemaVersion", "gateVersion", "extractorVersion", "mode", "candidate", "deterministic",
    "semantic", "ownerDecision", "authority",
  ], "Reference Lab Manager QA surface review");
  if (
    !new Set([
      "genre-soul-manager-surface-review-proof/v2",
      "genre-soul-manager-surface-review-proof/v3",
    ]).has(managerQa.surfaceReview.schemaVersion)
    || (managerQa.schemaVersion === "genre-soul-manager-qa/v3"
      && managerQa.surfaceReview.schemaVersion !== "genre-soul-manager-surface-review-proof/v3")
    || managerQa.surfaceReview.gateVersion !== "genre-soul-protected-surface-hil/v3"
    || managerQa.surfaceReview.extractorVersion !== "genre-soul-surface-candidate-extractor/v3"
  ) throw new Error("Reference Lab Manager QA surface review envelope is invalid");
  requireBoundReference(managerQa.surfaceReview.candidate, "Reference Lab Manager QA surface candidate");
  const managerRunRoot = managerQa.privateInput.path.slice(0, -privateSuffix.length);
  const expectedCandidatePath = `${managerRunRoot}/structured-runs/${managerQa.manager.inputDigest}/surface-review/candidate.json`;
  if (managerQa.surfaceReview.candidate.path !== expectedCandidatePath) {
    throw new Error("Reference Lab Manager QA surface candidate path is not bound to the Manager run");
  }
  requireExactKeys(managerQa.surfaceReview.deterministic, [
    "status", "privateEvidence", "findingSetSha256", "findingIds",
  ], "Reference Lab Manager QA deterministic surface proof");
  requireExactKeys(managerQa.surfaceReview.deterministic.privateEvidence, [
    "sourceSetSha256", "sampleSetSha256",
  ], "Reference Lab Manager QA deterministic private evidence");
  requireSha(
    managerQa.surfaceReview.deterministic.privateEvidence.sourceSetSha256,
    "Reference Lab Manager QA deterministic source-set SHA",
  );
  requireSha(
    managerQa.surfaceReview.deterministic.privateEvidence.sampleSetSha256,
    "Reference Lab Manager QA deterministic sample-set SHA",
  );
  const deterministic = managerQa.surfaceReview.deterministic;
  if (!Array.isArray(deterministic.findingIds)) {
    throw new Error("Reference Lab Manager QA deterministic finding IDs must be an array");
  }
  if (deterministic.status === "pass") {
    if (
      managerQa.surfaceReview.mode !== "deterministic-clean"
      || deterministic.findingSetSha256 !== null
      || deterministic.findingIds.length !== 0
      || managerQa.surfaceReview.semantic !== null
      || managerQa.surfaceReview.ownerDecision !== null
    ) throw new Error("Reference Lab Manager QA deterministic surface terminal envelope is invalid");
  } else if (deterministic.status === "pending_semantic_review") {
    requireSha(deterministic.findingSetSha256, "Reference Lab Manager QA deterministic finding-set SHA");
    if (deterministic.findingIds.length < 1 || !isObject(managerQa.surfaceReview.semantic)) {
      throw new Error("Reference Lab Manager QA semantic surface terminal envelope is invalid");
    }
    if (managerQa.surfaceReview.mode === "semantic-auto-passed") {
      if (
        managerQa.surfaceReview.semantic.outcome !== "auto-passed"
        || managerQa.surfaceReview.ownerDecision !== null
      ) throw new Error("Reference Lab Manager QA semantic auto-pass envelope is invalid");
    } else if (managerQa.surfaceReview.mode === "semantic-owner-approved") {
      if (
        managerQa.surfaceReview.semantic.outcome !== "owner-approved"
        || !isObject(managerQa.surfaceReview.ownerDecision)
      ) throw new Error("Reference Lab Manager QA semantic owner-approval envelope is invalid");
      requireExactKeys(
        managerQa.surfaceReview.ownerDecision,
        ["request", "decision"],
        "Reference Lab Manager QA surface owner decision",
      );
      requireBoundReference(
        managerQa.surfaceReview.ownerDecision.request,
        "Reference Lab Manager QA surface owner request",
      );
      requireBoundReference(
        managerQa.surfaceReview.ownerDecision.decision,
        "Reference Lab Manager QA surface owner decision receipt",
        ["decisionId", "outcome", "decidedByRole"],
      );
      const surfaceRoot = expectedCandidatePath.slice(0, -"/candidate.json".length);
      const request = managerQa.surfaceReview.ownerDecision.request;
      const decision = managerQa.surfaceReview.ownerDecision.decision;
      if (
        request.path !== `${surfaceRoot}/owner-hil/requests/${request.sha256}.json`
        || decision.path !== `${surfaceRoot}/owner-hil/decisions/${request.sha256}.json`
        || !/^surface-decision-[0-9a-f]{24}$/.test(decision.decisionId ?? "")
        || decision.outcome !== "approved"
        || decision.decidedByRole !== "owner"
      ) throw new Error("Reference Lab Manager QA surface owner approval is invalid");
    } else {
      throw new Error("Reference Lab Manager QA semantic surface terminal envelope is invalid");
    }
  } else {
    throw new Error("Reference Lab Manager QA deterministic surface status is invalid");
  }
  requireExactKeys(managerQa.surfaceReview.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul",
  ], "Reference Lab Manager QA surface authority");
  if (
    managerQa.surfaceReview.authority.scope !== "reference-lab-analysis-surface-only"
    || managerQa.surfaceReview.authority.mayWriteInkOSCanon !== false
    || managerQa.surfaceReview.authority.mayPromoteSoul !== false
  ) throw new Error("Reference Lab Manager QA surface authority is invalid");

  requireExactKeys(managerQa.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul", "ownerDecisionRequired",
  ], "Reference Lab Manager QA authority");
  if (
    managerQa.authority.scope !== "reference-lab-qa-only"
    || managerQa.authority.mayWriteInkOSCanon !== false
    || managerQa.authority.mayPromoteSoul !== false
    || managerQa.authority.ownerDecisionRequired !== true
  ) throw new Error("Reference Lab Manager QA authority is invalid");
}

export function validateReferenceLabAnalysisProfileProjection(profile, expected) {
  requireSha(expected?.profileConfigSha256, "Reference Lab expected Hermes profile config SHA");
  requireExactKeys(profile, [
    "schemaVersion", "state", "genre", "soulId", "version", "generatedAt", "evidenceSet",
    "primaryCommercialEngines", "patterns", "dimensions", "contentNeutrality", "synthesis", "authority",
  ], "Reference Lab analysis profile");
  if (!REFERENCE_LAB_GENRES.has(profile.genre)) throw new Error("Reference Lab analysis profile genre is invalid");
  requireReferenceLabIdentity(profile, {
    schemaVersion: "genre-soul-analysis-profile/v1",
    state: "candidate",
    genre: expected.genre,
    soulId: expected.soulId,
    version: expected.soulVersion,
  }, "Reference Lab analysis profile");
  if (profile.soulId !== `male-${profile.genre}` || profile.version !== "v1") {
    throw new Error("Reference Lab analysis profile Soul identity is invalid");
  }
  requireIsoDate(profile.generatedAt, "Reference Lab analysis profile generatedAt");
  if (!isObject(profile.evidenceSet) || !Array.isArray(profile.primaryCommercialEngines)) {
    throw new Error("Reference Lab analysis profile evidence is invalid");
  }
  if (!Array.isArray(profile.patterns) || !isObject(profile.dimensions) || !isObject(profile.synthesis)) {
    throw new Error("Reference Lab analysis profile structure is invalid");
  }
  requireExactKeys(profile.synthesis, [
    "contentContract", "privateInput", "run", "truncation",
  ], "Reference Lab analysis profile synthesis");
  requireExactKeys(profile.synthesis.run, [
    "runId", "model", "provider", "reasoningEffort", "configSha256", "traceReceiptSha256",
  ], "Reference Lab analysis profile synthesis run");
  if (
    profile.synthesis.run.runId !== expected.synthesisRunId
    || profile.synthesis.run.model !== "gpt-5.6-sol"
    || profile.synthesis.run.provider !== "openai-codex"
    || profile.synthesis.run.reasoningEffort !== "high"
    || profile.synthesis.run.configSha256 !== expected.profileConfigSha256
  ) throw new Error("Reference Lab analysis profile synthesis identity is invalid");
  requireSha(profile.synthesis.run.configSha256, "Reference Lab analysis profile synthesis config SHA");
  requireSha(profile.synthesis.run.traceReceiptSha256, "Reference Lab analysis profile synthesis trace SHA");
  requireExactKeys(profile.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul", "ownerDecisionRequired",
  ], "Reference Lab analysis profile authority");
  if (
    profile.authority?.scope !== "analysis-only"
    || profile.authority?.mayWriteInkOSCanon !== false
    || profile.authority?.mayPromoteSoul !== false
    || profile.authority?.ownerDecisionRequired !== true
  ) {
    throw new Error("Reference Lab analysis profile authority is invalid");
  }
}

export function validateReferenceLabPromotionEligibilityProjection(eligibility, decision) {
  requireExactKeys(eligibility, PROMOTION_ELIGIBILITY_KEYS, "Reference Lab promotion eligibility");
  if (
    eligibility.schemaVersion !== "genre-soul-promotion-eligibility/v1"
    || !REFERENCE_LAB_GENRES.has(eligibility.genre)
  ) {
    throw new Error("Reference Lab promotion eligibility schema is invalid");
  }
  if (
    eligibility.status !== "pass"
    || !Number.isSafeInteger(eligibility.deepReadSourceCount)
    || eligibility.deepReadSourceCount < 3
    || eligibility.reviewPacketSchema !== "firefly_review_packet/v2"
    || eligibility.blindPairCount !== 3
    || eligibility.independentBlindRunCount !== 3
    || !Number.isSafeInteger(eligibility.soulWins)
    || eligibility.soulWins < 2
    || eligibility.soulWins > eligibility.blindPairCount
    || typeof eligibility.averageCommercialScore !== "number"
    || !Number.isFinite(eligibility.averageCommercialScore)
    || eligibility.averageCommercialScore < 85
    || eligibility.averageCommercialScore > 100
    || typeof eligibility.winningPairMinimumGain !== "number"
    || !Number.isFinite(eligibility.winningPairMinimumGain)
    || eligibility.winningPairMinimumGain < 2
    || eligibility.winningPairMinimumGain > 100
    || eligibility.genreIdentityPassed !== 3
    || eligibility.contentNeutralViolationCount !== 0
    || eligibility.unauthorizedCanonWriteCount !== 0
    || eligibility.allSurfaceMatchesHumanClassified !== true
    || eligibility.canonLeakCount !== 0
    || eligibility.managerQaPassed !== true
    || eligibility.leakScanMatchCount !== 0
    || eligibility.ownerDecisionRequired !== true
    || eligibility.ownerDecisionId !== null
  ) {
    throw new Error("Reference Lab promotion eligibility is not owner-ready");
  }
  for (const key of [
    "blindPairCount", "independentBlindRunCount", "genreIdentityPassed",
    "contentNeutralViolationCount", "unauthorizedCanonWriteCount", "canonLeakCount", "leakScanMatchCount",
  ]) requireNonNegativeInteger(eligibility[key], `Reference Lab promotion eligibility.${key}`);
  requireFiniteNumber(eligibility.averageCommercialScore, "Reference Lab promotion eligibility.averageCommercialScore");
  requireFiniteNumber(eligibility.winningPairMinimumGain, "Reference Lab promotion eligibility.winningPairMinimumGain");
  for (const key of [
    "reviewPacketSha256s", "blindReviewReceiptSha256s", "contentNeutralReceiptSha256s",
    "surfaceComparisonReceiptSha256s",
  ]) requireUniqueSortedStrings(eligibility[key], `Reference Lab promotion eligibility.${key}`, {
    length: 3,
    pattern: SHA256,
  });
  requireUniqueSortedStrings(
    eligibility.deepReadReceiptSha256s,
    "Reference Lab promotion eligibility.deepReadReceiptSha256s",
    { minimum: 3, pattern: SHA256 },
  );
  requireSha(eligibility.managerQaReceiptSha256, "Reference Lab promotion eligibility.managerQaReceiptSha256");
  requireSha(eligibility.leakScanReceiptSha256, "Reference Lab promotion eligibility.leakScanReceiptSha256");
  requireUniqueSortedStrings(
    eligibility.generationRunIds,
    "Reference Lab promotion eligibility.generationRunIds",
    { length: 6 },
  );
  requireUniqueSortedStrings(
    eligibility.blindRunIds,
    "Reference Lab promotion eligibility.blindRunIds",
    { length: 3 },
  );
  requireUniqueSortedStrings(
    eligibility.inputSha256s,
    "Reference Lab promotion eligibility.inputSha256s",
    { pattern: SHA256 },
  );
  requireExactKeys(eligibility.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul", "ownerDecisionRequired",
  ], "Reference Lab promotion eligibility authority");
  if (
    eligibility.authority?.scope !== "analysis-only"
    || eligibility.authority?.mayWriteInkOSCanon !== false
    || eligibility.authority?.mayPromoteSoul !== false
    || eligibility.authority?.ownerDecisionRequired !== true
  ) {
    throw new Error("Reference Lab promotion eligibility authority is invalid");
  }
  const expectedPath = `analyses/genre_souls/${decision.soulId}/${decision.soulVersion}/promotion-eligibility.json`;
  if (decision.referenceLabEligibility.path !== expectedPath) {
    throw new Error(`Reference Lab promotion eligibility path must be ${expectedPath}`);
  }
}

function verifyReferenceLabEligibility({ root, manifest, decision, expectedProfile, spawn }) {
  const { repoPath, branch } = referenceLabRepoPath(root, manifest, spawn);
  const reference = decision.referenceLabEligibility;
  verifyReferenceLabCommit({ repoPath, branch, commit: reference.commit, spawn });
  const expectedEligibilityPath = `analyses/genre_souls/${decision.soulId}/${decision.soulVersion}/promotion-eligibility.json`;
  if (reference.path !== expectedEligibilityPath) {
    throw new Error(`Reference Lab promotion eligibility path must be ${expectedEligibilityPath}`);
  }
  const eligibilityBytes = readReferenceLabBlob({
    repoPath,
    commit: reference.commit,
    path: reference.path,
    spawn,
    label: "Reference Lab promotion eligibility",
  });
  const eligibilitySha256 = sha256(eligibilityBytes);
  if (eligibilitySha256 !== reference.sha256) {
    throw new Error("Reference Lab promotion eligibility hash mismatch");
  }
  const eligibility = decodeJson(eligibilityBytes, "Reference Lab promotion eligibility");
  validateReferenceLabPromotionEligibilityProjection(eligibility, decision);

  const managerQaPath = `analyses/genre_souls/${decision.soulId}/${decision.soulVersion}/manager-qa.json`;
  const managerQaBytes = readReferenceLabBlob({
    repoPath,
    commit: reference.commit,
    path: managerQaPath,
    spawn,
    label: "Reference Lab Manager QA",
  });
  const managerQaSha256 = sha256(managerQaBytes);
  if (eligibility.managerQaReceiptSha256 !== managerQaSha256) {
    throw new Error("Reference Lab promotion eligibility does not bind the Manager QA bytes");
  }
  if (!decision.inputReceiptSha256s.managerQa.includes(managerQaSha256)) {
    throw new Error("HQ promotion decision does not bind the Reference Lab Manager QA bytes");
  }
  const managerQa = decodeJson(managerQaBytes, "Reference Lab Manager QA");
  if (!hasText(eligibility.genre)) throw new Error("Reference Lab promotion eligibility genre is invalid");
  validateReferenceLabManagerQaProjection(managerQa, {
    genre: eligibility.genre,
    soulId: decision.soulId,
    soulVersion: decision.soulVersion,
    profileId: expectedProfile.profileId,
    profileConfigSha256: expectedProfile.profileConfigSha256,
  });

  const profilePath = `analyses/genre_souls/${decision.soulId}/${decision.soulVersion}/genre-profile.json`;
  if (managerQa.profile?.path !== profilePath || !SHA256.test(managerQa.profile?.sha256 ?? "")) {
    throw new Error("Reference Lab Manager QA analysis profile binding is invalid");
  }
  const profileBytes = readReferenceLabBlob({
    repoPath,
    commit: reference.commit,
    path: profilePath,
    spawn,
    label: "Reference Lab analysis profile",
  });
  const profileSha256 = sha256(profileBytes);
  if (
    profileSha256 !== managerQa.profile.sha256
    || profileBytes.byteLength !== managerQa.profile.sizeBytes
  ) {
    throw new Error("Reference Lab Manager QA analysis profile hash mismatch");
  }
  validateReferenceLabAnalysisProfileProjection(decodeJson(profileBytes, "Reference Lab analysis profile"), {
    genre: eligibility.genre,
    soulId: decision.soulId,
    soulVersion: decision.soulVersion,
    synthesisRunId: managerQa.profile.synthesisRunId,
    profileConfigSha256: expectedProfile.profileConfigSha256,
  });
  return {
    commit: reference.commit,
    eligibilityPath: reference.path,
    eligibilitySha256,
    managerQaPath,
    managerQaSha256,
    managerQaSchemaVersion: managerQa.schemaVersion,
    profilePath,
    profileSha256,
  };
}

export async function verifyGenreSoulAdoptions({
  root,
  registry,
  profileRegistry,
  manifest,
  spawn = spawnSync,
}) {
  const errors = validateGenreSoulAdoptionRegistry(registry, profileRegistry);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const absoluteRoot = resolve(root);
  const realRoot = await realpath(root);
  const profiles = new Map(profileRegistry.profiles.map((profile) => [profile.profileId, profile]));
  const receipts = [];
  for (const entry of registry.active) {
    const decisionAbsolutePath = resolve(root, entry.decisionPath);
    const lexicalRelativePath = relative(absoluteRoot, decisionAbsolutePath);
    if (lexicalRelativePath === ".." || lexicalRelativePath.startsWith(`..${sep}`) || isAbsolute(lexicalRelativePath)) {
      throw new Error(`adoption decision escaped the HQ repository: ${entry.decisionPath}`);
    }
    const decisionBytes = await readRealUtf8File(decisionAbsolutePath, "genre Soul promotion decision");
    const realDecisionPath = await realpath(decisionAbsolutePath);
    const realRelativePath = relative(realRoot, realDecisionPath);
    if (realRelativePath === ".." || realRelativePath.startsWith(`..${sep}`) || isAbsolute(realRelativePath)) {
      throw new Error(`adoption decision escaped the real HQ repository: ${entry.decisionPath}`);
    }
    const actualDecisionSha256 = sha256(decisionBytes);
    if (actualDecisionSha256 !== entry.decisionSha256) throw new Error(`promotion decision hash mismatch: ${entry.decisionPath}`);
    let decision;
    try {
      decision = JSON.parse(decisionBytes.toString("utf8"));
    } catch {
      throw new Error(`promotion decision is not valid JSON: ${entry.decisionPath}`);
    }
    const decisionErrors = validateGenreSoulPromotionDecision(decision);
    if (decisionErrors.length > 0) throw new Error(decisionErrors.join("\n"));
    if (decision.decision !== "promote") throw new Error(`active adoption decision must be promote: ${entry.decisionPath}`);
    if (
      decision.soulId !== entry.soulId
      || decision.soulVersion !== entry.soulVersion
      || decision.candidateSoulSha256 !== entry.soulSha256
    ) throw new Error(`active adoption identity does not match its decision: ${entry.decisionPath}`);
    const activeProfile = profiles.get(entry.profileId);
    if (!activeProfile) throw new Error(`active Hermes profile is missing: ${entry.profileId}`);
    const referenceLab = verifyReferenceLabEligibility({
      root,
      manifest,
      decision,
      expectedProfile: {
        profileId: entry.profileId,
        profileConfigSha256: entry.profileConfigSha256,
      },
      spawn,
    });
    receipts.push({
      soulId: entry.soulId,
      soulVersion: entry.soulVersion,
      profileId: entry.profileId,
      decisionId: decision.decisionId,
      decisionSha256: actualDecisionSha256,
      decision: decision.decision,
      referenceLab,
    });
  }
  return receipts;
}
