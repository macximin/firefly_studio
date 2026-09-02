import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PAIR_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const TRANSIENT_BOOK_FILES = new Set([".soul-turn.lock", ".write.lock"]);
const RECEIPT_KEYS = new Set([
  "schemaVersion", "pairId", "bookId", "scopeId", "sourceProjectRootFingerprint",
  "sourceConfig", "sourceGenres", "sourceBook", "commonSnapshotSha256",
  "isolationScopeSha256", "soulBindingInputs", "lanes", "productionBookFingerprint",
  "excludedTransientBookPaths", "createdAt", "receiptSelfHash",
]);
const FILE_REF_KEYS = new Set(["path", "sha256", "byteLength"]);
const LANE_KEYS = new Set([
  "projectRoot", "preBindManifestSha256", "postBindManifestSha256", "allowedDeltaPaths",
  "allowedDeltaManifestSha256", "expectedSoulBinding",
]);
const SOUL_BINDING_KEYS = new Set(["soulId", "soulVersion", "bindingSha256"]);
const ISOLATION_REF_KEYS = new Set([
  "pairId", "path", "sha256", "byteLength", "receiptSelfHash",
  "isolationScopeSha256", "commonSnapshotSha256",
]);

function canaryRecoveryRequired(message) {
  const error = new Error(message);
  error.code = "CANARY_RECOVERY_REQUIRED";
  return error;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(canonicalStringify(value), "utf8"));
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} fields are not exact`);
}

function normalizedRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  const normalized = normalize(value).split(sep).join("/");
  if (isAbsolute(value) || normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} must be a normalized relative path`);
  }
  return normalized;
}

function safeBookId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !value.includes("\0");
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be a SHA-256 digest`);
}

function validateFileRef(value, label) {
  exactKeys(value, FILE_REF_KEYS, label);
  normalizedRelativePath(value.path, `${label}.path`);
  assertSha(value.sha256, `${label}.sha256`);
  if (!Number.isInteger(value.byteLength) || value.byteLength < 0) throw new Error(`${label}.byteLength is invalid`);
}

function validateSoulBinding(value, label, nullable = false) {
  if (value === null && nullable) return;
  exactKeys(value, SOUL_BINDING_KEYS, label);
  if (typeof value.soulId !== "string" || value.soulId.length === 0
    || typeof value.soulVersion !== "string" || value.soulVersion.length === 0) {
    throw new Error(`${label} identity is invalid`);
  }
  assertSha(value.bindingSha256, `${label}.bindingSha256`);
}

async function assertRealDirectory(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
}

async function assertNoSymlinkComponents(root, relativePath, label) {
  const safe = normalizedRelativePath(relativePath, label);
  await assertRealDirectory(root, `${label} root`);
  let cursor = root;
  for (const part of safe.split("/")) {
    cursor = join(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`${label} contains a forbidden symlink`);
  }
  return cursor;
}

async function readStableRegularFile(path, label) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const first = await readFile(path);
  const middle = await lstat(path);
  const second = await readFile(path);
  const after = await lstat(path);
  if (!middle.isFile() || middle.isSymbolicLink() || !after.isFile() || after.isSymbolicLink()
    || before.dev !== after.dev || before.ino !== after.ino || before.size !== first.byteLength
    || middle.size !== first.byteLength || after.size !== second.byteLength || !first.equals(second)) {
    throw new Error(`${label} changed during readback`);
  }
  return first;
}

async function readRegularRef(root, relativePath, label) {
  const path = await assertNoSymlinkComponents(root, relativePath, label);
  const bytes = await readStableRegularFile(path, label);
  return { path: relativePath, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength };
}

async function collectManifest(root, receiptPrefix = "", excluded = new Set()) {
  await assertRealDirectory(root, receiptPrefix || "manifest root");
  const files = [];
  const walk = async (directory, rootRelative) => {
    const names = (await readdir(directory)).sort((left, right) => left.localeCompare(right));
    for (const name of names) {
      const nextRootRelative = rootRelative ? `${rootRelative}/${name}` : name;
      if (excluded.has(nextRootRelative)) continue;
      const absolute = join(directory, name);
      const info = await lstat(absolute);
      const receiptPath = receiptPrefix ? `${receiptPrefix}/${nextRootRelative}` : nextRootRelative;
      if (info.isSymbolicLink()) throw new Error(`manifest contains a forbidden symlink: ${receiptPath}`);
      if (info.isDirectory()) await walk(absolute, nextRootRelative);
      else if (info.isFile()) {
        const bytes = await readStableRegularFile(absolute, `manifest file ${receiptPath}`);
        files.push({ path: receiptPath, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength });
      } else throw new Error(`manifest contains a non-file entry: ${receiptPath}`);
    }
  };
  await walk(root, "");
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, manifestSha256: sha256Json(files) };
}

async function collectSourceSnapshot(sourceRoot, bookId) {
  const sourceConfig = await readRegularRef(sourceRoot, "inkos.json", "source config");
  let sourceGenres;
  try {
    const genresRoot = await assertNoSymlinkComponents(sourceRoot, "genres", "source genres");
    await assertRealDirectory(genresRoot, "source genres");
    const manifest = await collectManifest(genresRoot, "genres");
    sourceGenres = {
      state: "present",
      files: manifest.files,
      manifestSha256: sha256Json({ state: "present", files: manifest.files }),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    sourceGenres = { state: "absent", files: [], manifestSha256: sha256Json({ state: "absent", files: [] }) };
  }
  const bookPrefix = `books/${bookId}`;
  const bookRoot = await assertNoSymlinkComponents(sourceRoot, bookPrefix, "source Book");
  await assertRealDirectory(bookRoot, "source Book");
  const sourceBook = await collectManifest(bookRoot, bookPrefix, TRANSIENT_BOOK_FILES);
  const bookConfigRef = sourceBook.files.find((entry) => entry.path === `${bookPrefix}/book.json`);
  if (!bookConfigRef) throw new Error("source Book is missing book.json");
  const bookConfigBytes = await readStableRegularFile(join(bookRoot, "book.json"), "source Book config");
  let bookConfig;
  try {
    bookConfig = JSON.parse(bookConfigBytes.toString("utf8"));
  } catch {
    throw new Error("source Book config is not valid JSON");
  }
  if (bookConfig?.id !== bookId) throw new Error("source Book config ID mismatch");
  const commonSnapshot = {
    schemaVersion: "inkos-canary-source-snapshot/v1",
    config: sourceConfig,
    genres: sourceGenres,
    book: sourceBook,
  };
  const commonSnapshotSha256 = sha256Json(commonSnapshot);
  return {
    sourceConfig,
    sourceGenres,
    sourceBook,
    commonSnapshotSha256,
    sourceProjectRootFingerprint: sha256Json({
      schemaVersion: "inkos-canary-source-project-fingerprint/v1",
      commonSnapshotSha256,
    }),
  };
}

function validateReceiptShape(receipt) {
  exactKeys(receipt, RECEIPT_KEYS, "canary common snapshot receipt");
  if (receipt.schemaVersion !== "inkos-canary-common-snapshot/v1") throw new Error("canary receipt schemaVersion is invalid");
  if (!SAFE_PAIR_ID.test(receipt.pairId ?? "") || !safeBookId(receipt.bookId)) throw new Error("canary receipt identity is unsafe");
  if (receipt.scopeId !== `canary-pair:${receipt.pairId}:${receipt.bookId}`) throw new Error("canary receipt scopeId is not canonical");
  validateFileRef(receipt.sourceConfig, "canary receipt sourceConfig");
  exactKeys(receipt.sourceGenres, new Set(["state", "files", "manifestSha256"]), "canary receipt sourceGenres");
  if (!["present", "absent"].includes(receipt.sourceGenres.state) || !Array.isArray(receipt.sourceGenres.files)) throw new Error("canary receipt sourceGenres is invalid");
  receipt.sourceGenres.files.forEach((ref, index) => validateFileRef(ref, `canary receipt sourceGenres.files[${index}]`));
  exactKeys(receipt.sourceBook, new Set(["files", "manifestSha256"]), "canary receipt sourceBook");
  if (!Array.isArray(receipt.sourceBook.files)) throw new Error("canary receipt sourceBook.files is invalid");
  receipt.sourceBook.files.forEach((ref, index) => validateFileRef(ref, `canary receipt sourceBook.files[${index}]`));
  for (const [label, value] of [
    ["sourceProjectRootFingerprint", receipt.sourceProjectRootFingerprint],
    ["commonSnapshotSha256", receipt.commonSnapshotSha256],
    ["isolationScopeSha256", receipt.isolationScopeSha256],
    ["receiptSelfHash", receipt.receiptSelfHash],
  ]) assertSha(value, `canary receipt ${label}`);
  exactKeys(receipt.soulBindingInputs, new Set(["soulId", "soulVersion", "artifacts"]), "canary receipt soulBindingInputs");
  if (typeof receipt.soulBindingInputs.soulId !== "string" || !receipt.soulBindingInputs.soulId
    || typeof receipt.soulBindingInputs.soulVersion !== "string" || !receipt.soulBindingInputs.soulVersion
    || !Array.isArray(receipt.soulBindingInputs.artifacts) || receipt.soulBindingInputs.artifacts.length !== 3) {
    throw new Error("canary receipt Soul binding inputs are invalid");
  }
  const roles = [];
  receipt.soulBindingInputs.artifacts.forEach((artifact, index) => {
    exactKeys(artifact, new Set([...FILE_REF_KEYS, "role"]), `canary receipt soulBindingInputs.artifacts[${index}]`);
    validateFileRef(Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "role")), `canary receipt soulBindingInputs.artifacts[${index}] ref`);
    roles.push(artifact.role);
  });
  if (JSON.stringify(roles.sort()) !== JSON.stringify(["soul-binding-decision", "soul-package-manifest", "source-registry-receipt"])) {
    throw new Error("canary receipt Soul binding input roles are invalid");
  }
  exactKeys(receipt.lanes, new Set(["neutral", "genreSoul"]), "canary receipt lanes");
  for (const [name, lane] of Object.entries(receipt.lanes)) {
    exactKeys(lane, LANE_KEYS, `canary receipt lanes.${name}`);
    normalizedRelativePath(lane.projectRoot, `canary receipt lanes.${name}.projectRoot`);
    for (const field of ["preBindManifestSha256", "postBindManifestSha256", "allowedDeltaManifestSha256"]) {
      assertSha(lane[field], `canary receipt lanes.${name}.${field}`);
    }
    if (!Array.isArray(lane.allowedDeltaPaths)) throw new Error(`canary receipt lanes.${name}.allowedDeltaPaths is invalid`);
    lane.allowedDeltaPaths.forEach((path, index) => normalizedRelativePath(path, `canary receipt lanes.${name}.allowedDeltaPaths[${index}]`));
    validateSoulBinding(lane.expectedSoulBinding, `canary receipt lanes.${name}.expectedSoulBinding`, true);
  }
  exactKeys(receipt.productionBookFingerprint, new Set(["before", "after", "unchanged"]), "canary receipt productionBookFingerprint");
  assertSha(receipt.productionBookFingerprint.before, "canary receipt productionBookFingerprint.before");
  assertSha(receipt.productionBookFingerprint.after, "canary receipt productionBookFingerprint.after");
  if (receipt.productionBookFingerprint.unchanged !== true) throw new Error("canary receipt source Book is not sealed unchanged");
  if (JSON.stringify(receipt.excludedTransientBookPaths) !== JSON.stringify([".soul-turn.lock", ".write.lock"])) {
    throw new Error("canary receipt transient Book exclusions are not canonical");
  }
  if (typeof receipt.createdAt !== "string" || Number.isNaN(Date.parse(receipt.createdAt))) throw new Error("canary receipt createdAt is invalid");
}

function verifyReceiptDerivedIntegrity(receipt) {
  const receiptPath = `.inkos/canaries/${receipt.pairId}/common-snapshot.json`;
  const neutralRoot = `.inkos/canaries/${receipt.pairId}/neutral`;
  const soulRoot = `.inkos/canaries/${receipt.pairId}/soul`;
  const neutral = receipt.lanes.neutral;
  const soul = receipt.lanes.genreSoul;
  if (neutral.projectRoot !== neutralRoot || soul.projectRoot !== soulRoot
    || neutral.expectedSoulBinding !== null || neutral.allowedDeltaPaths.length !== 0
    || neutral.preBindManifestSha256 !== neutral.postBindManifestSha256) {
    throw new Error("canary receipt lane scope is not canonical");
  }
  const deltaPaths = [...soul.allowedDeltaPaths].sort((left, right) => left.localeCompare(right));
  if (deltaPaths.length === 0 || new Set(deltaPaths).size !== deltaPaths.length
    || JSON.stringify(deltaPaths) !== JSON.stringify(soul.allowedDeltaPaths)
    || deltaPaths.some((path) => !(path.startsWith(".inkos/production/souls/objects/")
      || path.startsWith(`books/${receipt.bookId}/story/soul-bindings/`)))) {
    throw new Error("canary receipt Soul delta is invalid");
  }
  if (neutral.allowedDeltaManifestSha256 !== sha256Json([])
    || soul.allowedDeltaManifestSha256 !== sha256Json(deltaPaths)) throw new Error("canary receipt delta manifest hash mismatch");
  if (receipt.sourceBook.manifestSha256 !== sha256Json(receipt.sourceBook.files)
    || receipt.sourceGenres.manifestSha256 !== sha256Json({ state: receipt.sourceGenres.state, files: receipt.sourceGenres.files })) {
    throw new Error("canary receipt source manifest hash mismatch");
  }
  const commonSnapshotSha256 = sha256Json({
    schemaVersion: "inkos-canary-source-snapshot/v1",
    config: receipt.sourceConfig,
    genres: receipt.sourceGenres,
    book: receipt.sourceBook,
  });
  const sourceProjectRootFingerprint = sha256Json({
    schemaVersion: "inkos-canary-source-project-fingerprint/v1",
    commonSnapshotSha256,
  });
  const isolationScopeSha256 = sha256Json({
    schemaVersion: "inkos-canary-isolation-scope/v1",
    scopeId: receipt.scopeId,
    pairId: receipt.pairId,
    bookId: receipt.bookId,
    sourceProjectRootFingerprint,
    receiptPath,
    laneProjectRoots: [neutralRoot, soulRoot],
    allowedDeltaPaths: deltaPaths,
  });
  if (receipt.commonSnapshotSha256 !== commonSnapshotSha256
    || receipt.sourceProjectRootFingerprint !== sourceProjectRootFingerprint
    || receipt.isolationScopeSha256 !== isolationScopeSha256
    || receipt.productionBookFingerprint.before !== receipt.sourceBook.manifestSha256
    || receipt.productionBookFingerprint.after !== receipt.sourceBook.manifestSha256) {
    throw new Error("canary receipt derived snapshot integrity mismatch");
  }
  const { receiptSelfHash, ...unsigned } = receipt;
  if (receiptSelfHash !== sha256Json(unsigned)) throw new Error("canary receipt self hash mismatch");
}

export function validateCanaryIsolationReference(value) {
  const errors = [];
  try {
    exactKeys(value, ISOLATION_REF_KEYS, "modeEvidence.canaryIsolation");
    if (!SAFE_PAIR_ID.test(value.pairId ?? "")) throw new Error("modeEvidence.canaryIsolation.pairId is invalid");
    const expectedPath = `.inkos/canaries/${value.pairId}/common-snapshot.json`;
    if (normalizedRelativePath(value.path, "modeEvidence.canaryIsolation.path") !== expectedPath) {
      throw new Error("modeEvidence.canaryIsolation.path is not canonical for pairId");
    }
    for (const field of ["sha256", "receiptSelfHash", "isolationScopeSha256", "commonSnapshotSha256"]) {
      assertSha(value[field], `modeEvidence.canaryIsolation.${field}`);
    }
    if (!Number.isInteger(value.byteLength) || value.byteLength < 1) throw new Error("modeEvidence.canaryIsolation.byteLength is invalid");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

export async function verifyCanarySourceSnapshot({ codeRepoPath, receipt }) {
  const sourceRoot = await realpath(resolve(codeRepoPath));
  await assertRealDirectory(sourceRoot, "InkOS code/source root");
  const actual = await collectSourceSnapshot(sourceRoot, receipt.bookId);
  if (canonicalStringify(actual.sourceConfig) !== canonicalStringify(receipt.sourceConfig)
    || canonicalStringify(actual.sourceGenres) !== canonicalStringify(receipt.sourceGenres)
    || canonicalStringify(actual.sourceBook) !== canonicalStringify(receipt.sourceBook)
    || actual.commonSnapshotSha256 !== receipt.commonSnapshotSha256
    || actual.sourceProjectRootFingerprint !== receipt.sourceProjectRootFingerprint) {
    throw new Error("source InkOS snapshot changed from the sealed canary receipt");
  }
  return actual;
}

async function verifyLaneSoulBinding(executionRoot, workOrder, expectedBinding) {
  const pointerPath = `books/${workOrder.bookId}/story/soul-bindings/current.json`;
  if (expectedBinding === null) {
    try {
      await assertNoSymlinkComponents(executionRoot, pointerPath, "neutral lane Soul pointer");
      throw new Error("neutral canary lane unexpectedly has an active Soul binding");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return;
  }
  const pointerAbsolute = await assertNoSymlinkComponents(executionRoot, pointerPath, "canary lane Soul pointer");
  const pointerBytes = await readStableRegularFile(pointerAbsolute, "canary lane Soul pointer");
  let pointer;
  try { pointer = JSON.parse(pointerBytes.toString("utf8")); } catch { throw new Error("canary lane Soul pointer is not valid JSON"); }
  if (pointer.bookId !== workOrder.bookId || pointer.bindingSha256 !== expectedBinding.bindingSha256
    || typeof pointer.bindingPath !== "string") throw new Error("canary lane active Soul pointer mismatch");
  const bindingPath = normalizedRelativePath(pointer.bindingPath, "canary lane Soul binding path");
  if (!bindingPath.startsWith("story/soul-bindings/")) throw new Error("canary lane Soul binding path is not canonical");
  const bindingAbsolute = await assertNoSymlinkComponents(join(executionRoot, "books", workOrder.bookId), bindingPath, "canary lane Soul binding");
  const bindingBytes = await readStableRegularFile(bindingAbsolute, "canary lane Soul binding");
  let binding;
  try { binding = JSON.parse(bindingBytes.toString("utf8")); } catch { throw new Error("canary lane Soul binding is not valid JSON"); }
  const { bindingSha256, ...unsignedBinding } = binding ?? {};
  if (bindingSha256 !== sha256Json(unsignedBinding) || bindingSha256 !== expectedBinding.bindingSha256
    || binding.bookId !== workOrder.bookId || binding.soulId !== expectedBinding.soulId
    || binding.version !== expectedBinding.soulVersion) throw new Error("canary lane active Soul binding integrity mismatch");
}

export async function verifyPromotionCanaryIsolation({ codeRepoPath, workOrder, requireLaneSnapshot = true, acceptTerminalSnapshot = false }) {
  if (workOrder?.executionMode !== "promotion-canary") return null;
  const ref = workOrder.modeEvidence?.canaryIsolation;
  const refErrors = validateCanaryIsolationReference(ref);
  if (refErrors.length > 0) throw new Error(refErrors.join("; "));
  const lexicalSourceRoot = resolve(codeRepoPath);
  const sourceRoot = await realpath(lexicalSourceRoot);
  await assertRealDirectory(sourceRoot, "InkOS code/source root");
  const receiptAbsolute = await assertNoSymlinkComponents(sourceRoot, ref.path, "canary common snapshot receipt");
  const receiptBytes = await readStableRegularFile(receiptAbsolute, "canary common snapshot receipt");
  if (sha256Bytes(receiptBytes) !== ref.sha256 || receiptBytes.byteLength !== ref.byteLength) {
    throw new Error("canary receipt raw hash or byte length mismatch");
  }
  let receipt;
  try {
    receipt = JSON.parse(receiptBytes.toString("utf8"));
  } catch {
    throw new Error("canary common snapshot receipt is not valid JSON");
  }
  validateReceiptShape(receipt);
  verifyReceiptDerivedIntegrity(receipt);
  if (receipt.pairId !== ref.pairId || receipt.bookId !== workOrder.bookId
    || receipt.receiptSelfHash !== ref.receiptSelfHash
    || receipt.isolationScopeSha256 !== ref.isolationScopeSha256
    || receipt.commonSnapshotSha256 !== ref.commonSnapshotSha256) {
    throw new Error("WorkOrder canary isolation reference does not match the sealed receipt");
  }
  const laneName = workOrder.modeEvidence.lane === "neutral-baseline" ? "neutral" : "genreSoul";
  const executionLane = laneName === "neutral" ? "neutral" : "soul";
  const lane = receipt.lanes[laneName];
  const expectedBinding = workOrder.expectedSoulBinding ?? null;
  if (canonicalStringify(lane.expectedSoulBinding) !== canonicalStringify(expectedBinding)) {
    throw new Error("WorkOrder Soul binding does not match its sealed canary lane");
  }
  const executionAbsolute = await assertNoSymlinkComponents(sourceRoot, lane.projectRoot, "canary execution root");
  await assertRealDirectory(executionAbsolute, "canary execution root");
  const executionRoot = await realpath(executionAbsolute);
  if (executionRoot !== executionAbsolute || executionRoot === sourceRoot || !executionRoot.startsWith(`${sourceRoot}${sep}`)) {
    throw new Error("canary execution root is not an isolated contained lane root");
  }
  const sourceSnapshot = await verifyCanarySourceSnapshot({ codeRepoPath: sourceRoot, receipt });
  const laneManifestSha256 = lane.postBindManifestSha256;
  await verifyLaneSoulBinding(executionRoot, workOrder, expectedBinding);
  const projection = {
    schemaVersion: "inkos-canary-execution-root-verification/v1",
    scopeId: receipt.scopeId,
    pairId: receipt.pairId,
    bookId: receipt.bookId,
    lane: executionLane,
    projectRoot: lane.projectRoot,
    sourceProjectRootFingerprint: receipt.sourceProjectRootFingerprint,
    sourceBookManifestSha256: receipt.sourceBook.manifestSha256,
    laneManifestSha256,
    receipt: {
      path: ref.path,
      sha256: ref.sha256,
      byteLength: ref.byteLength,
      selfHash: ref.receiptSelfHash,
    },
    isolationScopeSha256: ref.isolationScopeSha256,
    commonSnapshotSha256: ref.commonSnapshotSha256,
    expectedSoulBinding: expectedBinding,
  };
  if (requireLaneSnapshot) {
    const lockExclusions = new Set([
      `books/${workOrder.bookId}/.soul-turn.lock`,
      `books/${workOrder.bookId}/.write.lock`,
    ]);
    const terminalPath = `books/${workOrder.bookId}/story/runtime/hermes-control/${workOrder.workOrderId}/terminal.json`;
    let terminalAbsolute;
    try {
      terminalAbsolute = await assertNoSymlinkComponents(executionRoot, terminalPath, "canary Agent terminal");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (!terminalAbsolute) {
      const laneManifest = await collectManifest(executionRoot, "", lockExclusions);
      if (laneManifest.manifestSha256 !== lane.postBindManifestSha256) {
        throw canaryRecoveryRequired("canary execution lane changed after its sealed preparation snapshot");
      }
    } else {
      if (!acceptTerminalSnapshot) throw new Error("fresh canary execution root already contains an Agent terminal");
      const terminalBytes = await readStableRegularFile(terminalAbsolute, "canary Agent terminal");
      let terminal;
      try { terminal = JSON.parse(terminalBytes.toString("utf8")); } catch { throw new Error("canary Agent terminal is not valid JSON"); }
      exactKeys(terminal, new Set([
        "schemaVersion", "workOrderId", "workOrderSha256", "bookId", "sessionId", "executionMode",
        "canaryIsolation", "finalLaneManifestSha256", "importReceipt", "productionRun", "completedAt",
        "status", "chapterCommit", "receiptSelfHash",
      ]), "canary Agent terminal");
      const { receiptSelfHash, ...unsignedTerminal } = terminal ?? {};
      if (receiptSelfHash !== sha256Json(unsignedTerminal)
        || terminal.schemaVersion !== "inkos-agent-operation-terminal/v2"
        || terminal.workOrderId !== workOrder.workOrderId
        || terminal.workOrderSha256 !== sha256Bytes(Buffer.from(canonicalStringify(workOrder), "utf8"))
        || terminal.bookId !== workOrder.bookId || terminal.sessionId !== workOrder.sessionId
        || terminal.executionMode !== "promotion-canary" || terminal.status !== "succeeded"
        || canonicalStringify(terminal.canaryIsolation) !== canonicalStringify(projection)
        || !SHA256.test(terminal.finalLaneManifestSha256 ?? "")) {
        throw new Error("canary Agent terminal does not match the original isolation projection");
      }
      const finalExclusions = new Set([...lockExclusions, terminalPath]);
      const finalManifest = await collectManifest(executionRoot, "", finalExclusions);
      if (finalManifest.manifestSha256 !== terminal.finalLaneManifestSha256) {
        throw new Error("canary Agent terminal final manifest does not match the current lane");
      }
    }
  }
  return {
    codeRepoPath: sourceRoot,
    executionRoot,
    receipt,
    receiptBytes,
    sourceSnapshot,
    projection,
  };
}
