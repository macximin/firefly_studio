import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

import {
  FICTION_CONTENT_CONTRACT_ID,
  FICTION_CONTENT_CONTRACT_SHA256,
  validateHermesStructuredReceipt,
  preflightHermesStructuredContextBudget,
} from "../edge_repos/firefly_reference_lab/tools/genre-soul-hermes-run-lib.mjs";
import {
  BLIND_PAIR_EVALUATOR_OUTPUT_RESERVE_TOKENS,
  buildBlindPairEvaluatorPrompt,
} from "../edge_repos/firefly_reference_lab/tools/blind-pair-evaluation-runner.mjs";
import {
  assembleBlindPairEvaluationInputFromInkOSTransfer,
  BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES,
  buildBlindCandidateEvidenceSpans,
  buildBlindPairEvaluatorInput,
  buildBlindReviewReceiptFromRawEvidence,
  hashBlindEvaluationArtifact,
  validateBlindPairEvaluationInput,
  validateBlindPairEvaluationResult,
  validateBlindSurfaceScanReceipt,
  validateInkOSBlindPairEvaluationTransfer,
} from "../edge_repos/firefly_reference_lab/tools/blind-pair-evaluation-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_PAIR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u;
const OPAQUE_PAIR = /^bp-[a-f0-9]{24}$/u;
const OPAQUE_RUN = /^br-[a-f0-9]{24}$/u;
const GENRE_SOUL_IDS = Object.freeze({
  "modern-fantasy-ko": "male-modern-fantasy-ko",
  "fantasy-ko": "male-fantasy-ko",
  "murim-ko": "male-murim-ko",
});
const GENRES = new Set(Object.keys(GENRE_SOUL_IDS));
const REVIEWER_CONFIG_SHA256 = "4124e16bc40d28732d1dd02f9f2e8b78127a202313e1ace21021f16fca809f46";
const REVIEWER_SOUL_SHA256 = "5c4cca60c9971312682f7b71cac5d4d61b6f9e2c42d19af99c8fe6daedacd94b";
const MAX_REVIEW_ARTIFACT_BYTES = 10 * 1024 * 1024;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
function canonicalSha256(value) {
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sort(child)]));
    }
    return item;
  };
  return sha256(JSON.stringify(sort(value)));
}

function fail(message) { throw new Error(`Blind review bridge: ${message}`); }
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}
function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} fields are invalid.`);
}
function safePair(value) {
  if (typeof value !== "string" || !SOURCE_PAIR.test(value)) fail("source pair must be a filesystem-safe InkOS pair ID.");
  return value;
}
function safeSha(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256.`);
  return value;
}
function safeId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$/u.test(value)) fail(`${label} is invalid.`);
  return value;
}
function repoPath(root, value, label) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\\") || normalize(value) !== value) {
    fail(`${label} must be a normalized HQ-relative path.`);
  }
  const target = resolve(root, value);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes HQ.`);
  return target;
}

async function lstatOrNull(path) {
  try { return await lstat(path); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function assertPhysicalDirectory(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a physical directory.`);
}

async function resolveBridgeRoots({ root, manifest }) {
  const hqRoot = await realpath(resolve(root));
  await assertPhysicalDirectory(hqRoot, "HQ root");
  const repositories = object(manifest, "manifest").repos;
  if (!Array.isArray(repositories)) fail("manifest has no repositories.");
  const byName = new Map(repositories.map((repo) => [repo?.name, repo]));
  const inkos = byName.get("inkos");
  const reference = byName.get("firefly_reference_lab");
  if (!inkos || !reference) fail("manifest must define both inkos and firefly_reference_lab sibling roots.");
  const resolveRepo = async (repo, name) => {
    const declared = repoPath(hqRoot, repo.path, `${name} manifest path`);
    const physical = await realpath(declared);
    await assertPhysicalDirectory(physical, `${name} repository root`);
    const rootStat = await lstat(physical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail(`${name} repository root is not physical after resolution.`);
    return physical;
  };
  const [inkosRoot, referenceRoot] = await Promise.all([resolveRepo(inkos, "InkOS"), resolveRepo(reference, "Reference Lab")]);
  if (inkosRoot === referenceRoot) fail("manifest resolves InkOS and Reference Lab to the same root.");
  return { hqRoot, inkosRoot, referenceRoot };
}

function relativeSafe(root, absolute, label) {
  const path = relative(root, absolute).split(sep).join("/");
  if (!path || path === ".." || path.startsWith("../") || isAbsolute(path)) fail(`${label} escapes repository root.`);
  return path;
}

async function assertNoSymlinkPath(root, absolute, label, { requireFile = false } = {}) {
  const rel = relativeSafe(root, absolute, label);
  let cursor = root;
  for (const part of rel.split("/")) {
    cursor = join(cursor, part);
    const info = await lstatOrNull(cursor);
    if (!info) {
      if (requireFile) fail(`${label} is missing.`);
      return;
    }
    if (info.isSymbolicLink()) fail(`${label} contains a symbolic-link component.`);
  }
  if (requireFile) {
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file.`);
  }
}

async function readStable(root, relativePath, label) {
  const absolute = resolve(root, ...relativePath.split("/"));
  await assertNoSymlinkPath(root, absolute, label, { requireFile: true });
  const beforePath = await lstat(absolute);
  let handle;
  try { handle = await open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); }
  catch (error) { fail(`${label} could not be opened as a non-symlink file: ${error.message}`); }
  try {
    const before = await handle.stat();
    const bytes = await handle.readFile();
    const [after, afterPath] = await Promise.all([handle.stat(), lstat(absolute)]);
    if (!before.isFile() || !after.isFile() || !afterPath.isFile() || afterPath.isSymbolicLink()
      || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || after.dev !== afterPath.dev || after.ino !== afterPath.ino
      || bytes.byteLength !== after.size) fail(`${label} changed during stable readback.`);
    return bytes;
  } finally { await handle?.close(); }
}

async function ensurePhysicalParent(root, absolute, label) {
  const rel = relativeSafe(root, dirname(absolute), label);
  let cursor = root;
  for (const part of rel.split("/")) {
    cursor = join(cursor, part);
    const existing = await lstatOrNull(cursor);
    if (!existing) await mkdir(cursor, { mode: 0o700 });
    const info = await lstat(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} parent contains a symlink or non-directory.`);
  }
}

async function publishNoClobber(root, relativePath, bytes, label) {
  if (typeof relativePath !== "string" || !relativePath || isAbsolute(relativePath) || relativePath.includes("\\") || normalize(relativePath) !== relativePath) {
    fail(`${label} target must be normalized and repository-relative.`);
  }
  const absolute = resolve(root, ...relativePath.split("/"));
  relativeSafe(root, absolute, label);
  await ensurePhysicalParent(root, absolute, label);
  await assertNoSymlinkPath(root, absolute, label);
  const temporary = join(dirname(absolute), `.${randomBytes(16).toString("hex")}.tmp`);
  let handle;
  let made = false;
  let publication = "written";
  try {
    handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    made = true;
    await handle.writeFile(bytes);
    await handle.sync();
    const temporaryInfo = await handle.stat();
    await handle.close();
    handle = undefined;
    if (!temporaryInfo.isFile() || temporaryInfo.size !== bytes.byteLength) fail(`${label} temporary write failed.`);
    try { await link(temporary, absolute); }
    catch (error) { if (error?.code !== "EEXIST") throw error; publication = "reused"; }
  } finally {
    await handle?.close();
    if (made) await unlink(temporary).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  }
  const stored = await readStable(root, relativePath, `${label} readback`);
  if (!stored.equals(bytes)) fail(`${label} already exists with different bytes.`);
  return publication;
}

function parseCanonical(bytes, label) {
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) { fail(`${label} is not valid UTF-8 JSON: ${error.message}`); }
  if (!bytes.equals(jsonBytes(value))) fail(`${label} must use canonical JSON bytes.`);
  return value;
}

function transferPaths(sourcePair) {
  return {
    publicTransfer: `.inkos/canaries/${sourcePair}/review/public/evaluation-transfer.json`,
    privateMapping: `.inkos/canaries/${sourcePair}/review/private/label-assignment.json`,
  };
}

function refLabPaths(sourcePair, opaquePair, genre) {
  const sourceRoot = `exports/inkos-blind-pairs/${sourcePair}`;
  const soulId = GENRE_SOUL_IDS[genre];
  if (!soulId) fail("genre is invalid.");
  const privateRoot = `exports/genre-souls/${soulId}/v1/blind-reviews/${opaquePair}`;
  return {
    transferCopy: `${sourceRoot}/evaluation-transfer.json`,
    publicInput: `${sourceRoot}/input.json`,
    evaluatorInput: `${privateRoot}/evaluator-input.json`,
    result: `${privateRoot}/result.json`,
    surfaceA: `${privateRoot}/surface-scan-candidate-A.json`,
    surfaceB: `${privateRoot}/surface-scan-candidate-B.json`,
    completed: `${privateRoot}/hermes-run/completed.json`,
    trackedReceipt: `analyses/genre_souls/${soulId}/v1/blind-reviews/${opaquePair}.json`,
  };
}

function validateArtifactRef(value, label, withSelfHash = false) {
  object(value, label);
  exactKeys(value, withSelfHash ? ["path", "sha256", "byteLength", "receiptSelfHash"] : ["path", "sha256", "byteLength"], label);
  if (typeof value.path !== "string" || !value.path || isAbsolute(value.path) || value.path.includes("\\")
    || normalize(value.path) !== value.path || value.path === ".." || value.path.startsWith(`..${sep}`)) {
    fail(`${label} path is invalid.`);
  }
  safeSha(value.sha256, `${label} SHA-256`);
  if (withSelfHash) safeSha(value.receiptSelfHash, `${label} self hash`);
  if (!Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > MAX_REVIEW_ARTIFACT_BYTES) {
    fail(`${label} byteLength is invalid.`);
  }
}

function validatePrivateMapping(mapping, transfer, mappingBytes, sourcePair, genre) {
  object(mapping, "InkOS private mapping");
  exactKeys(mapping, [
    "schemaVersion", "sourcePairId", "opaquePairId", "blindRunId", "blindSessionId", "bookId", "chapterNumber", "round",
    "commonContext", "commonInputReceiptSha256", "pairedGenerationReceiptSha256", "canaryIsolation", "entropyCommitmentSha256",
    "mappingRandomized", "mappings", "createdAt", "receiptSelfHash",
  ], "InkOS private mapping");
  if (mapping.schemaVersion !== "inkos-blind-pair-private-mapping/v1" || !Array.isArray(mapping.mappings) || mapping.mappings.length !== 2) {
    fail("InkOS private mapping is not a sealed blind-pair mapping v1.");
  }
  if (mapping.sourcePairId !== sourcePair || !OPAQUE_PAIR.test(mapping.opaquePairId ?? "")
    || !OPAQUE_RUN.test(mapping.blindRunId ?? "") || !OPAQUE_RUN.test(mapping.blindSessionId ?? "")
    || mapping.sourcePairId === mapping.opaquePairId || mapping.blindRunId === mapping.blindSessionId
    || mapping.opaquePairId !== transfer.pairId || mapping.blindRunId !== transfer.blindRunId || mapping.blindSessionId !== transfer.blindSessionId
    || mapping.round !== transfer.round || mapping.bookId !== transfer.bookId || mapping.chapterNumber !== transfer.chapterNumber
    || mapping.createdAt !== transfer.generatedAt || mapping.mappingRandomized !== true
    || sha256(mappingBytes) !== transfer.labelAssignmentReceiptSha256) {
    fail("InkOS private mapping does not bind the public evaluation transfer.");
  }
  object(mapping.commonContext, "InkOS private mapping common context");
  exactKeys(mapping.commonContext, ["text", "sha256", "byteLength"], "InkOS private mapping common context");
  const commonBytes = Buffer.from(mapping.commonContext.text ?? "", "utf8");
  if (typeof mapping.commonContext.text !== "string" || !mapping.commonContext.text.trim()
    || commonBytes.toString("utf8") !== mapping.commonContext.text || commonBytes.byteLength > 500_000
    || commonBytes.byteLength !== mapping.commonContext.byteLength || sha256(commonBytes) !== mapping.commonContext.sha256
    || JSON.stringify(mapping.commonContext) !== JSON.stringify(transfer.commonContext)) {
    fail("InkOS private mapping common context binding is invalid.");
  }
  for (const field of ["commonInputReceiptSha256", "pairedGenerationReceiptSha256", "entropyCommitmentSha256", "receiptSelfHash"]) {
    safeSha(mapping[field], `InkOS private mapping ${field}`);
  }
  object(mapping.canaryIsolation, "InkOS private mapping canary isolation");
  exactKeys(mapping.canaryIsolation, ["receiptSha256", "receiptSelfHash", "isolationScopeSha256", "commonSnapshotSha256"], "InkOS private mapping canary isolation");
  for (const [key, value] of Object.entries(mapping.canaryIsolation)) safeSha(value, `InkOS private mapping canary isolation ${key}`);
  if (JSON.stringify(mapping.canaryIsolation) !== JSON.stringify(transfer.canaryIsolation)
    || mapping.commonInputReceiptSha256 !== transfer.commonInputReceiptSha256
    || mapping.pairedGenerationReceiptSha256 !== transfer.pairedGenerationReceiptSha256
    || mapping.commonInputReceiptSha256 !== canonicalSha256({ schemaVersion: "inkos-blind-common-context/v1", commonContext: mapping.commonContext })) {
    fail("InkOS private mapping common/generation/isolation receipts drifted from its transfer.");
  }
  if (typeof mapping.createdAt !== "string" || !Number.isFinite(Date.parse(mapping.createdAt))) fail("InkOS private mapping createdAt is invalid.");
  const { receiptSelfHash, ...mappingUnsigned } = mapping;
  if (receiptSelfHash !== canonicalSha256(mappingUnsigned)) fail("InkOS private mapping self hash is invalid.");
  const byLane = new Map();
  const workOrders = new Set();
  const profiles = new Set();
  const manuscripts = new Set();
  for (const [index, entry] of mapping.mappings.entries()) {
    object(entry, "InkOS private candidate mapping");
    exactKeys(entry, [
      "candidateId", "lane", "profileId", "sessionId", "workOrderId", "laneProjectRoot", "expectedSoulBinding",
      "terminal", "chapterCommit", "chapterArtifact", "body",
    ], "InkOS private candidate mapping");
    if (entry.candidateId !== (index === 0 ? "candidate-A" : "candidate-B")) fail("InkOS private candidate mappings must be ordered A then B.");
    if (!["neutral", "soul"].includes(entry.lane) || byLane.has(entry.lane)) fail("InkOS private mapping must contain one neutral and one soul terminal.");
    if (entry.laneProjectRoot !== `.inkos/canaries/${sourcePair}/${entry.lane}`) fail("InkOS private mapping lane project root is cross-bound.");
    safeId(entry.sessionId, "producer session ID");
    safeId(entry.profileId, "producer profile ID");
    safeId(entry.workOrderId, "producer WorkOrder ID");
    if (entry.workOrderId.length > 160) fail("producer WorkOrder ID exceeds the InkOS 160-character limit.");
    if (entry.lane === "neutral" ? entry.expectedSoulBinding !== null : !entry.expectedSoulBinding) fail("InkOS private mapping lane Soul binding is invalid.");
    if (entry.expectedSoulBinding !== null) {
      object(entry.expectedSoulBinding, "InkOS private mapping expected Soul binding");
      exactKeys(entry.expectedSoulBinding, ["soulId", "soulVersion", "bindingSha256"], "InkOS private mapping expected Soul binding");
      safeId(entry.expectedSoulBinding.soulId, "expected Soul ID");
      safeId(entry.expectedSoulBinding.soulVersion, "expected Soul version");
      safeSha(entry.expectedSoulBinding.bindingSha256, "expected Soul binding SHA-256");
      if (entry.expectedSoulBinding.soulId !== GENRE_SOUL_IDS[genre] || entry.expectedSoulBinding.soulVersion !== "v1") {
        fail("InkOS private mapping Soul binding does not match the requested genre.");
      }
    }
    validateArtifactRef(entry.terminal, "producer terminal", true);
    validateArtifactRef(entry.chapterCommit, "producer ChapterCommit", true);
    validateArtifactRef(entry.chapterArtifact, "producer Chapter artifact");
    if (typeof entry.body !== "string" || !entry.body || sha256(entry.body) !== entry.chapterArtifact.sha256
      || Buffer.byteLength(entry.body, "utf8") !== entry.chapterArtifact.byteLength) fail("InkOS private candidate body does not bind its Chapter artifact.");
    const publicCandidate = transfer.candidates[index];
    if (publicCandidate.id !== entry.candidateId || publicCandidate.body !== entry.body
      || publicCandidate.sha256 !== entry.chapterArtifact.sha256 || publicCandidate.byteLength !== entry.chapterArtifact.byteLength) {
      fail("InkOS private candidate mapping differs from the public opaque candidate.");
    }
    if (workOrders.has(entry.workOrderId) || profiles.has(entry.profileId) || manuscripts.has(entry.chapterArtifact.sha256)) {
      fail("InkOS private mappings require distinct WorkOrders, profiles, and manuscripts.");
    }
    workOrders.add(entry.workOrderId);
    profiles.add(entry.profileId);
    manuscripts.add(entry.chapterArtifact.sha256);
    byLane.set(entry.lane, entry);
  }
  const generationBinding = canonicalSha256({
    schemaVersion: "inkos-blind-pair-generation-binding/v1",
    bookId: mapping.bookId,
    chapterNumber: mapping.chapterNumber,
    canaryIsolation: mapping.canaryIsolation,
    terminals: mapping.mappings.map((entry) => ({
      terminalSha256: entry.terminal.sha256,
      terminalSelfHash: entry.terminal.receiptSelfHash,
      chapterCommitSha256: entry.chapterCommit.sha256,
      chapterArtifactSha256: entry.chapterArtifact.sha256,
    })).sort((left, right) => left.terminalSha256.localeCompare(right.terminalSha256)),
  });
  if (generationBinding !== mapping.pairedGenerationReceiptSha256) fail("InkOS private mapping paired generation receipt is invalid.");
  return byLane;
}

async function producerActorsFromMapping({ inkosRoot, sourcePair, mapping, byLane }) {
  const actors = [];
  for (const lane of ["neutral", "soul"]) {
    const entry = byLane.get(lane);
    const laneRoot = `.inkos/canaries/${sourcePair}/${lane}`;
    const terminalPath = `${laneRoot}/books/${mapping.bookId}/${entry.terminal.path}`;
    const bytes = await readStable(inkosRoot, terminalPath, `${lane} producer terminal`);
    if (bytes.byteLength !== entry.terminal.byteLength || sha256(bytes) !== entry.terminal.sha256) {
      fail(`${lane} producer terminal differs from its private mapping reference.`);
    }
    const terminal = parseCanonical(bytes, `${lane} producer terminal`);
    if (terminal.schemaVersion !== "inkos-agent-operation-terminal/v2" || terminal.status !== "succeeded"
      || terminal.executionMode !== "promotion-canary" || terminal.bookId !== mapping.bookId
      || terminal.workOrderId !== entry.workOrderId || terminal.sessionId !== entry.sessionId
      || terminal.receiptSelfHash !== entry.terminal.receiptSelfHash) {
      fail(`${lane} producer terminal is cross-bound or not successfully sealed.`);
    }
    actors.push({ lane, actorId: entry.sessionId, profileId: entry.profileId, terminalReceiptSha256: entry.terminal.sha256 });
  }
  return actors;
}

export async function prepareBlindReviewPair({ root, manifest, sourcePair, genre, reviewerActorId, intensityDirectiveSha256 }) {
  sourcePair = safePair(sourcePair);
  if (!GENRES.has(genre)) fail("genre must be modern-fantasy-ko, fantasy-ko, or murim-ko.");
  reviewerActorId = safeId(reviewerActorId, "reviewer actor ID");
  intensityDirectiveSha256 = safeSha(intensityDirectiveSha256, "intensity directive SHA-256");
  const { inkosRoot, referenceRoot } = await resolveBridgeRoots({ root, manifest });
  const paths = transferPaths(sourcePair);
  const transferBytes = await readStable(inkosRoot, paths.publicTransfer, "InkOS public evaluation transfer");
  const transfer = parseCanonical(transferBytes, "InkOS public evaluation transfer");
  validateInkOSBlindPairEvaluationTransfer(transfer);
  const mappingBytes = await readStable(inkosRoot, paths.privateMapping, "InkOS private label mapping");
  const mapping = parseCanonical(mappingBytes, "InkOS private label mapping");
  safeId(mapping.bookId, "InkOS private mapping Book ID");
  const bookBytes = await readStable(inkosRoot, `books/${mapping.bookId}/book.json`, "InkOS canonical Book metadata");
  const book = object(parseCanonical(bookBytes, "InkOS canonical Book metadata"), "InkOS canonical Book metadata");
  if (book.id !== mapping.bookId || book.genre !== genre || !GENRES.has(book.genre)) {
    fail("requested genre does not match the canonical InkOS Book genre.");
  }
  const byLane = validatePrivateMapping(mapping, transfer, mappingBytes, sourcePair, genre);
  const producerActors = await producerActorsFromMapping({ inkosRoot, sourcePair, mapping, byLane });
  const refPaths = refLabPaths(sourcePair, transfer.pairId, genre);
  const input = assembleBlindPairEvaluationInputFromInkOSTransfer({
    transfer,
    genre,
    reviewPacket: { path: refPaths.transferCopy, sha256: sha256(transferBytes), byteLength: transferBytes.byteLength },
    producerActors,
    reviewerActorId,
    contentContract: {
      id: FICTION_CONTENT_CONTRACT_ID,
      sha256: FICTION_CONTENT_CONTRACT_SHA256,
      intensityDirectiveSha256,
    },
  });
  validateBlindPairEvaluationInput(input);
  if (JSON.stringify(input.candidates).includes("body") || JSON.stringify(input).includes("workOrderId")) fail("prepared input leaked a candidate body or WorkOrder.");
  const candidateContexts = candidateContextsFromTransfer(transfer);
  const evaluatorInputPreflight = buildBlindPairEvaluatorInput(input, candidateContexts);
  const evaluatorContextPreflight = await preflightHermesStructuredContextBudget({
    profileHome: join(homedir(), ".hermes", "profiles", input.reviewer.profileId),
    profileId: input.reviewer.profileId,
    projectCwd: referenceRoot,
    prompt: buildBlindPairEvaluatorPrompt(evaluatorInputPreflight.value),
    inputBuffers: [evaluatorInputPreflight.bytes],
    outputReserveTokens: BLIND_PAIR_EVALUATOR_OUTPUT_RESERVE_TOKENS,
  });
  const inputBytes = jsonBytes(input);
  const transferPublication = await publishNoClobber(referenceRoot, refPaths.transferCopy, transferBytes, "Reference Lab transfer copy");
  const inputPublication = await publishNoClobber(referenceRoot, refPaths.publicInput, inputBytes, "Reference Lab bodyless blind input");
  return {
    sourcePair,
    pairId: transfer.pairId,
    transfer: { path: refPaths.transferCopy, sha256: sha256(transferBytes), byteLength: transferBytes.byteLength, publication: transferPublication },
    input: { path: refPaths.publicInput, sha256: sha256(inputBytes), byteLength: inputBytes.byteLength, publication: inputPublication },
    evaluatorInputPreflight: {
      byteLength: evaluatorInputPreflight.bytes.byteLength,
      maximumByteLength: BLIND_EVALUATOR_EXACT_INPUT_MAX_BYTES,
      contextInputProxyTokens: evaluatorContextPreflight.contextInputProxyTokens,
      outputReserveTokens: evaluatorContextPreflight.outputReserveTokens,
      preflightBudgetTokens: evaluatorContextPreflight.preflightBudgetTokens,
      contextLimit: evaluatorContextPreflight.contextLimit,
      fits: evaluatorContextPreflight.fits,
      runtimeIdentitySha256: evaluatorContextPreflight.runtimeIdentitySha256,
    },
    runnerInvocation: {
      cwd: referenceRoot,
      command: "node",
      args: ["tools/blind-pair-evaluation-runner.mjs", "--input", refPaths.publicInput],
    },
    runnerCommand: `Run with cwd=${referenceRoot}: node tools/blind-pair-evaluation-runner.mjs --input ${refPaths.publicInput}`,
  };
}

function bridgeArtifact(path, bytes) { return { path, sha256: sha256(bytes), byteLength: bytes.byteLength }; }

function validateCompletedPointer(pointer, hostReceiptBytes, completedBytes, attemptCompletion, attemptCompletionBytes, hostReceipt) {
  object(pointer, "Reference Lab completed pointer");
  exactKeys(pointer, ["schemaVersion", "role", "attempt", "attemptCompletionSha256", "hostReceiptSha256"], "Reference Lab completed pointer");
  if (pointer.schemaVersion !== "private-hermes-structured-completed-pointer/v1" || pointer.role !== "blind-pair-commercial-evaluator"
    || typeof pointer.attempt !== "string" || !/^attempts\/attempt-[A-Za-z0-9-]+$/u.test(pointer.attempt)
    || pointer.hostReceiptSha256 !== sha256(hostReceiptBytes) || pointer.attemptCompletionSha256 !== sha256(attemptCompletionBytes)) {
    fail("Reference Lab completed pointer does not bind the exact host receipt.");
  }
  if (!completedBytes.equals(jsonBytes(pointer))) fail("Reference Lab completed pointer is not canonical JSON.");
  object(attemptCompletion, "Reference Lab attempt completion marker");
  exactKeys(attemptCompletion, ["schemaVersion", "role", "attemptId", "runId", "hostReceiptSha256", "completed"], "Reference Lab attempt completion marker");
  if (attemptCompletion.schemaVersion !== "private-hermes-structured-attempt-completion/v1"
    || attemptCompletion.role !== "blind-pair-commercial-evaluator"
    || attemptCompletion.attemptId !== pointer.attempt.slice("attempts/".length)
    || attemptCompletion.runId !== hostReceipt.runId
    || attemptCompletion.hostReceiptSha256 !== sha256(hostReceiptBytes)
    || attemptCompletion.completed !== true
    || !attemptCompletionBytes.equals(jsonBytes(attemptCompletion))) {
    fail("Reference Lab attempt completion marker does not bind the exact completed host run.");
  }
}

function validateEvaluatorHostReceipt(hostReceipt, input, inputBytes, resultBytes, evaluatorInputPath) {
  const exactInputSha256 = sha256(inputBytes);
  const harnessInputSha256 = sha256(jsonBytes([{ path: evaluatorInputPath, sha256: exactInputSha256 }]));
  try {
    validateHermesStructuredReceipt(hostReceipt, {
      role: "blind-pair-commercial-evaluator",
      profileId: "inkos_blind_evaluator",
      profileConfigSha256: REVIEWER_CONFIG_SHA256,
      soulSha256: REVIEWER_SOUL_SHA256,
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      inputDigest: hashBlindEvaluationArtifact(input),
      inputSha256: harnessInputSha256,
      expectedReadCount: 1,
      exactReadCount: 1,
      exactReadSha256s: [exactInputSha256],
      resultSha256: sha256(resultBytes),
    });
  } catch (error) {
    fail(`Reference Lab evaluator host receipt does not bind the exact evaluator input/result or fixed reviewer: ${error.message}`);
  }
}

function candidateContextsFromTransfer(transfer) {
  return transfer.candidates.map(({ id, body, sha256: digest, byteLength }) => {
    return { id, body, sha256: digest, byteLength, evidenceSpans: buildBlindCandidateEvidenceSpans(body) };
  });
}

export async function importBlindReviewEvidence({ root, manifest, sourcePair, genre }) {
  sourcePair = safePair(sourcePair);
  if (!GENRES.has(genre)) fail("genre must be modern-fantasy-ko, fantasy-ko, or murim-ko.");
  const { inkosRoot, referenceRoot } = await resolveBridgeRoots({ root, manifest });
  const transferBytes = await readStable(inkosRoot, transferPaths(sourcePair).publicTransfer, "InkOS public evaluation transfer");
  const transfer = parseCanonical(transferBytes, "InkOS public evaluation transfer");
  validateInkOSBlindPairEvaluationTransfer(transfer);
  const refPaths = refLabPaths(sourcePair, transfer.pairId, genre);
  const [transferCopyBytes, publicInputBytes, evaluatorInputBytes, resultBytes, surfaceABytes, surfaceBBytes, completedBytes, trackedReceiptBytes] = await Promise.all([
    readStable(referenceRoot, refPaths.transferCopy, "Reference Lab transfer copy"),
    readStable(referenceRoot, refPaths.publicInput, "Reference Lab public blind input"),
    readStable(referenceRoot, refPaths.evaluatorInput, "Reference Lab private evaluator input"),
    readStable(referenceRoot, refPaths.result, "Reference Lab evaluator result"),
    readStable(referenceRoot, refPaths.surfaceA, "Reference Lab candidate-A surface scan"),
    readStable(referenceRoot, refPaths.surfaceB, "Reference Lab candidate-B surface scan"),
    readStable(referenceRoot, refPaths.completed, "Reference Lab completed pointer"),
    readStable(referenceRoot, refPaths.trackedReceipt, "Reference Lab tracked review receipt"),
  ]);
  const publicInput = parseCanonical(publicInputBytes, "Reference Lab public blind input");
  validateBlindPairEvaluationInput(publicInput);
  if (!transferCopyBytes.equals(transferBytes)) fail("Reference Lab transfer copy differs from the exact InkOS public transfer.");
  if (publicInput.pairId !== transfer.pairId || publicInput.round !== transfer.round || publicInput.blindRunId !== transfer.blindRunId
    || publicInput.blindSessionId !== transfer.blindSessionId || publicInput.labelAssignmentReceiptSha256 !== transfer.labelAssignmentReceiptSha256
    || publicInput.reviewPacket.path !== refPaths.transferCopy || publicInput.reviewPacket.sha256 !== sha256(transferBytes)
    || publicInput.reviewPacket.byteLength !== transferBytes.byteLength) {
    fail("Reference Lab public blind input does not bind the exact InkOS transfer.");
  }
  const completed = parseCanonical(completedBytes, "Reference Lab completed pointer");
  const hostRelative = `${dirname(refPaths.completed)}/${completed.attempt}/host-receipt.json`;
  const attemptCompletionRelative = `${dirname(refPaths.completed)}/${completed.attempt}/completed.json`;
  const [hostReceiptBytes, attemptCompletionBytes] = await Promise.all([
    readStable(referenceRoot, hostRelative, "Reference Lab evaluator host receipt"),
    readStable(referenceRoot, attemptCompletionRelative, "Reference Lab attempt completion marker"),
  ]);
  const hostReceipt = parseCanonical(hostReceiptBytes, "Reference Lab evaluator host receipt");
  const attemptCompletion = parseCanonical(attemptCompletionBytes, "Reference Lab attempt completion marker");
  validateCompletedPointer(completed, hostReceiptBytes, completedBytes, attemptCompletion, attemptCompletionBytes, hostReceipt);
  const result = parseCanonical(resultBytes, "Reference Lab evaluator result");
  const candidateContexts = candidateContextsFromTransfer(transfer);
  validateBlindPairEvaluationResult(result, publicInput, candidateContexts);
  validateEvaluatorHostReceipt(
    hostReceipt,
    publicInput,
    evaluatorInputBytes,
    resultBytes,
    resolve(referenceRoot, ...refPaths.evaluatorInput.split("/")),
  );
  const scanA = parseCanonical(surfaceABytes, "Reference Lab candidate-A surface scan");
  const scanB = parseCanonical(surfaceBBytes, "Reference Lab candidate-B surface scan");
  validateBlindSurfaceScanReceipt(scanA, candidateContexts[0]);
  validateBlindSurfaceScanReceipt(scanB, candidateContexts[1]);
  const rebuiltReceipt = buildBlindReviewReceiptFromRawEvidence({
    input: publicInput,
    result,
    candidateContexts,
    evaluatorInputBytes,
    evaluatorResultBytes: resultBytes,
    hostReceiptBytes,
    surfaceScans: [
      { receipt: scanA, upstreamScanSha256: scanA.upstreamScanSha256 },
      { receipt: scanB, upstreamScanSha256: scanB.upstreamScanSha256 },
    ],
  });
  if (!trackedReceiptBytes.equals(jsonBytes(rebuiltReceipt))) fail("Reference Lab tracked review receipt differs from exact raw evidence.");
  const targetRoot = `.inkos/canaries/${sourcePair}/review/reflab`;
  const sources = [
    ["input.json", refPaths.publicInput, publicInputBytes],
    ["evaluator-input.json", refPaths.evaluatorInput, evaluatorInputBytes],
    ["result.json", refPaths.result, resultBytes],
    ["host-receipt.json", hostRelative, hostReceiptBytes],
    ["attempt-completed.json", attemptCompletionRelative, attemptCompletionBytes],
    ["completed.json", refPaths.completed, completedBytes],
    ["surface-scan-candidate-A.json", refPaths.surfaceA, surfaceABytes],
    ["surface-scan-candidate-B.json", refPaths.surfaceB, surfaceBBytes],
    ["review-receipt.json", refPaths.trackedReceipt, trackedReceiptBytes],
  ];
  const publications = {};
  for (const [name, _source, bytes] of sources) publications[name] = await publishNoClobber(inkosRoot, `${targetRoot}/${name}`, bytes, `InkOS RefLab ${name}`);
  const artifacts = Object.fromEntries(sources.map(([name, source, bytes]) => [name, { source, ...bridgeArtifact(`${targetRoot}/${name}`, bytes) }]));
  const receiptUnsigned = {
    schemaVersion: "firefly-hq-blind-review-bridge-receipt/v1",
    sourcePair,
    pairId: transfer.pairId,
    genre,
    transfer: bridgeArtifact(transferPaths(sourcePair).publicTransfer, transferBytes),
    artifacts,
    authority: { scope: "evidence-transport-only", mayWriteInkOSCanon: false, mayExecuteModel: false, materialization: "explicit-inkos-command-required" },
  };
  const bridgeReceipt = { ...receiptUnsigned, receiptSelfHash: sha256(jsonBytes(receiptUnsigned)) };
  const bridgeBytes = jsonBytes(bridgeReceipt);
  publications["bridge-receipt.json"] = await publishNoClobber(inkosRoot, `${targetRoot}/bridge-receipt.json`, bridgeBytes, "InkOS RefLab bridge receipt");
  const downstream = {
    pair: sourcePair,
    reviewInput: `${targetRoot}/input.json`,
    evaluatorInput: `${targetRoot}/evaluator-input.json`,
    evaluationResult: `${targetRoot}/result.json`,
    evaluatorHostReceipt: `${targetRoot}/host-receipt.json`,
    reviewReceipt: `${targetRoot}/review-receipt.json`,
    surfaceA: `${targetRoot}/surface-scan-candidate-A.json`,
    surfaceB: `${targetRoot}/surface-scan-candidate-B.json`,
  };
  const materializeArgs = [
    "packages/cli/dist/index.js",
    "review",
    "materialize-blind-pair",
    "--pair", sourcePair,
    "--review-input", downstream.reviewInput,
    "--evaluator-input", downstream.evaluatorInput,
    "--evaluation-result", downstream.evaluationResult,
    "--evaluator-host-receipt", downstream.evaluatorHostReceipt,
    "--review-receipt", downstream.reviewReceipt,
    "--surface-a", downstream.surfaceA,
    "--surface-b", downstream.surfaceB,
  ];
  return {
    sourcePair,
    pairId: transfer.pairId,
    publications,
    bridgeReceipt: { path: `${targetRoot}/bridge-receipt.json`, sha256: sha256(bridgeBytes), byteLength: bridgeBytes.byteLength },
    downstream,
    materializeInvocation: {
      cwd: inkosRoot,
      command: "node",
      args: materializeArgs,
    },
    materializeCommand: `Run with cwd=${inkosRoot}: node ${materializeArgs.join(" ")}`,
  };
}
