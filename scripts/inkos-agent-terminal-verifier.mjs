import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { HERMES_CONTROL_TRANSPORT_POLICY } from "./hermes-control-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_BLIND_PAIR_ID = /^bp-[0-9a-f]{24}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalJson(nested)]));
  }
  return value;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonicalJson(value)), "utf8"));
}

export function hashInkosCanonicalJson(value) {
  return sha256Canonical(value);
}

function without(value, key) {
  if (!isObject(value)) return value;
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function exactKeys(value, expected, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${label} fields are not exact`);
    return false;
  }
  return true;
}

function allowedKeys(value, required, optional, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${label} has unknown field: ${key}`);
  for (const key of required) if (!(key in value)) errors.push(`${label}.${key} is required`);
  return true;
}

function validDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizedRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return null;
  const normalized = normalize(value).split(sep).join("/").replace(/^\.\//, "");
  if (isAbsolute(value) || normalized !== value || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

function validateArtifactRef(ref, label, errors, { byteLength = false, extraKeys = [] } = {}) {
  const keys = [...(byteLength ? ["path", "sha256", "byteLength"] : ["path", "sha256"]), ...extraKeys];
  if (!exactKeys(ref, keys, label, errors)) return false;
  if (!normalizedRelativePath(ref.path)) errors.push(`${label}.path must be normalized and relative`);
  if (!SHA256.test(ref.sha256 ?? "")) errors.push(`${label}.sha256 is invalid`);
  if (byteLength && (!Number.isInteger(ref.byteLength) || ref.byteLength <= 0)) errors.push(`${label}.byteLength is invalid`);
  return true;
}

async function readRegularInside(root, relativePath, expectedSha256, errors, label, expectedByteLength) {
  const normalized = normalizedRelativePath(relativePath);
  if (!normalized) {
    errors.push(`${label} path is invalid`);
    return null;
  }
  try {
    let cursor = root;
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      errors.push(`${label} root must be a real directory`);
      return null;
    }
    for (const part of normalized.split("/")) {
      cursor = join(cursor, part);
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) {
        errors.push(`${label} path contains a symlink`);
        return null;
      }
    }
    const info = await lstat(join(root, normalized));
    if (!info.isFile() || info.isSymbolicLink()) {
      errors.push(`${label} is not a regular file`);
      return null;
    }
    const bytes = await readFile(join(root, normalized));
    if (expectedByteLength !== undefined && bytes.byteLength !== expectedByteLength) {
      errors.push(`${label} byte length mismatch`);
      return null;
    }
    if (SHA256.test(expectedSha256 ?? "") && sha256Bytes(bytes) !== expectedSha256) {
      errors.push(`${label} hash mismatch`);
      return null;
    }
    return bytes;
  } catch {
    errors.push(`${label} is unavailable`);
    return null;
  }
}

async function readJsonInside(root, ref, errors, label, expectedByteLength) {
  const bytes = await readRegularInside(root, ref.path, ref.sha256, errors, label, expectedByteLength);
  if (!bytes) return { bytes: null, value: null };
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch {
    errors.push(`${label} is not valid JSON`);
    return { bytes, value: null };
  }
}

function sameCanonical(left, right) {
  return sha256Canonical(left) === sha256Canonical(right);
}

function validateSelfHash(value, field, label, errors) {
  if (!isObject(value) || !SHA256.test(value[field] ?? "") || sha256Canonical(without(value, field)) !== value[field]) {
    errors.push(`${label} self hash mismatch`);
    return false;
  }
  return true;
}

export function validateHermesInvocationTransportPolicy(runtime) {
  const errors = [];
  if (!isObject(runtime)) {
    errors.push("Hermes invocation runtime must be an object");
    return errors;
  }
  if (!Object.hasOwn(runtime, "transportPolicy")) return errors;
  if (exactKeys(
    runtime.transportPolicy,
    Object.keys(HERMES_CONTROL_TRANSPORT_POLICY),
    "Hermes invocation transport policy",
    errors,
  ) && !sameCanonical(runtime.transportPolicy, HERMES_CONTROL_TRANSPORT_POLICY)) {
    errors.push("Hermes invocation transport policy mismatch");
  }
  return errors;
}

function externalBookPath(bookId, bookRelativePath) {
  return `books/${bookId}/${bookRelativePath}`;
}

function validateExactExternalRef(actual, expectedPath, expectedSha256, label, errors) {
  validateArtifactRef(actual, label, errors);
  if (actual?.path !== expectedPath || actual?.sha256 !== expectedSha256) {
    errors.push(`${label} does not match canonical evidence`);
  }
}

async function verifyArtifactHash(repoPath, bookId, ref, label, errors) {
  if (!validateArtifactRef(ref, label, errors)) return;
  await readRegularInside(repoPath, externalBookPath(bookId, ref.path), ref.sha256, errors, label);
}

async function hashFinalCanaryLaneManifest(repoPath, bookId, terminalPath, errors) {
  const excluded = new Set([
    `books/${bookId}/.soul-turn.lock`,
    `books/${bookId}/.write.lock`,
    terminalPath,
  ]);
  const files = [];
  const walk = async (directory, relativeDirectory = "") => {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (excluded.has(relativePath)) continue;
      const absolutePath = join(directory, entry.name);
      const metadata = await lstat(absolutePath);
      if (metadata.isSymbolicLink()) throw new Error(`final lane manifest contains a symlink: ${relativePath}`);
      if (metadata.isDirectory()) await walk(absolutePath, relativePath);
      else if (metadata.isFile()) {
        const bytes = await readFile(absolutePath);
        const readback = await lstat(absolutePath);
        const second = await readFile(absolutePath);
        if (!readback.isFile() || readback.isSymbolicLink() || readback.size !== bytes.byteLength || !bytes.equals(second)) {
          throw new Error(`final lane manifest file changed during readback: ${relativePath}`);
        }
        files.push({ path: relativePath, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength });
      } else throw new Error(`final lane manifest contains a non-file entry: ${relativePath}`);
    }
  };
  try {
    await walk(repoPath);
    files.sort((left, right) => left.path.localeCompare(right.path));
    return sha256Canonical(files);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Independently re-reads the immutable InkOS Agent terminal graph. This module
 * intentionally does not import InkOS code: HQ must verify child evidence,
 * not trust another child projection of that evidence.
 */
export async function verifyInkosAgentOperationTerminal({
  repoPath,
  workOrder,
  workOrderSha256,
  manifestCapabilitySha256,
  agentOperation,
  productionRun,
  artifacts,
  hermesReceiptSha256,
  hermesActionSha256,
  hermesActionTextSha256,
  hermesInvocationSessionId,
  canaryIsolation = null,
  verifyProjectedArtifacts = true,
  allowLegacyProductionV1 = false,
}) {
  const errors = [];
  const bookId = workOrder.bookId;
  const operationRoot = `story/runtime/hermes-control/${workOrder.workOrderId}`;
  const expectedPaths = {
    request: `${operationRoot}/request.json`,
    action: `${operationRoot}/action.json`,
    hermes: `${operationRoot}/hermes-invocation.json`,
    import: `${operationRoot}/import-receipt.json`,
    terminal: `${operationRoot}/terminal.json`,
  };
  const external = Object.fromEntries(Object.entries(expectedPaths).map(([key, path]) => [key, externalBookPath(bookId, path)]));

  if (!isObject(agentOperation)) return { errors: ["agentOperation evidence is missing"], terminal: null, chapterCommit: null };
  if (agentOperation.status !== "succeeded") errors.push("agentOperation must be succeeded");
  if (agentOperation.executionMode !== workOrder.executionMode) errors.push("agentOperation executionMode mismatch");
  if (agentOperation.receipt?.path !== external.terminal) errors.push("agentOperation terminal path is not canonical");
  if (agentOperation.importReceipt?.path !== external.import) errors.push("agentOperation import path is not canonical");
  if (agentOperation.action?.path !== external.action) errors.push("agentOperation action path is not canonical");
  if (agentOperation.hermesReceipt?.path !== external.hermes) errors.push("agentOperation Hermes receipt path is not canonical");
  if (agentOperation.hermesReceipt?.sha256 !== hermesReceiptSha256) errors.push("agentOperation Hermes receipt bytes differ from HQ evidence");
  if (agentOperation.action?.sha256 !== hermesActionSha256 || agentOperation.action?.textSha256 !== hermesActionTextSha256) {
    errors.push("agentOperation action bytes differ from HQ evidence");
  }

  const roleExpectations = new Map([
    ["agent-operation-receipt", agentOperation.receipt],
    ["hermes-control-action", agentOperation.action],
    ["hermes-invocation-receipt", agentOperation.hermesReceipt],
    ["production-run", productionRun],
  ]);
  for (const [role, ref] of roleExpectations) {
    const matches = (artifacts ?? []).filter((artifact) => artifact?.role === role);
    if (matches.length !== 1 || matches[0].path !== ref?.path || matches[0].sha256 !== ref?.sha256) {
      errors.push(`${role} must have exactly one matching child artifact`);
    }
  }

  const terminalRead = await readJsonInside(repoPath, agentOperation.receipt ?? {}, errors, "Agent terminal");
  const terminal = terminalRead.value;
  if (!terminal) return { errors, terminal: null, chapterCommit: null };
  const legacyProductionV1 = allowLegacyProductionV1 === true
    && workOrder.executionMode === "production"
    && canaryIsolation === null
    && terminal.schemaVersion === "inkos-agent-operation-terminal/v1";
  exactKeys(terminal, [
    "schemaVersion", "workOrderId", "workOrderSha256", "bookId", "sessionId", "executionMode",
    ...(legacyProductionV1 ? [] : ["canaryIsolation", "finalLaneManifestSha256"]),
    "importReceipt", "productionRun", "completedAt", "status", "chapterCommit", "receiptSelfHash",
  ], "Agent terminal", errors);
  if (terminal.schemaVersion !== "inkos-agent-operation-terminal/v2" && !legacyProductionV1) {
    errors.push("Agent terminal schemaVersion is invalid");
  }
  if (terminal.workOrderId !== workOrder.workOrderId || terminal.workOrderSha256 !== workOrderSha256
    || terminal.bookId !== bookId || terminal.sessionId !== workOrder.sessionId
    || terminal.executionMode !== workOrder.executionMode) errors.push("Agent terminal WorkOrder identity mismatch");
  if (terminal.status !== "succeeded" || !validDate(terminal.completedAt)) errors.push("Agent terminal is not a valid success terminal");
  if (legacyProductionV1) {
    if ("canaryIsolation" in terminal || "finalLaneManifestSha256" in terminal
      || (agentOperation.canaryIsolation !== undefined && agentOperation.canaryIsolation !== null)
      || (agentOperation.finalLaneManifestSha256 !== undefined && agentOperation.finalLaneManifestSha256 !== null)) {
      errors.push("legacy production Agent terminal must not carry canary isolation evidence");
    }
  } else {
    if (!("canaryIsolation" in terminal) || !sameCanonical(terminal.canaryIsolation, canaryIsolation)) errors.push("Agent terminal canary isolation projection mismatch");
    if (agentOperation.finalLaneManifestSha256 !== terminal.finalLaneManifestSha256) {
      errors.push("agentOperation final lane manifest hash does not match Agent terminal");
    }
  }
  if (!legacyProductionV1 && canaryIsolation) {
    if (!SHA256.test(terminal.finalLaneManifestSha256 ?? "")) {
      errors.push("Agent terminal final lane manifest hash is invalid");
    } else {
      const currentLaneManifestSha256 = await hashFinalCanaryLaneManifest(repoPath, bookId, external.terminal, errors);
      if (currentLaneManifestSha256 !== terminal.finalLaneManifestSha256) {
        errors.push("Agent terminal final lane manifest does not match current isolated lane");
      }
    }
  } else if (!legacyProductionV1 && terminal.finalLaneManifestSha256 !== null) {
    errors.push("production Agent terminal finalLaneManifestSha256 must be null");
  }
  validateSelfHash(terminal, "receiptSelfHash", "Agent terminal", errors);
  validateArtifactRef(terminal.importReceipt, "Agent terminal importReceipt", errors, { byteLength: true });
  validateArtifactRef(terminal.productionRun, "Agent terminal productionRun", errors, {
    byteLength: true,
    extraKeys: ["commandId", "productionOperationId", "attemptId"],
  });
  if (isObject(terminal.productionRun)) {
    for (const field of ["commandId", "productionOperationId", "attemptId"]) {
      if (!UUID.test(terminal.productionRun[field] ?? "")) errors.push(`Agent terminal productionRun.${field} is invalid`);
    }
  }
  if (terminal.importReceipt?.path !== expectedPaths.import) errors.push("Agent terminal importReceipt path is not canonical");
  if (terminal.productionRun?.path !== `story/runtime/production-runs/terminals/${terminal.productionRun?.commandId}.json`) {
    errors.push("Agent terminal productionRun path is not canonical");
  }
  validateArtifactRef(terminal.chapterCommit, "Agent terminal chapterCommit", errors, {
    byteLength: true,
    extraKeys: ["receiptId", "receiptSelfHash"],
  });
  if (!UUID.test(terminal.chapterCommit?.receiptId ?? "") || !SHA256.test(terminal.chapterCommit?.receiptSelfHash ?? "")) {
    errors.push("Agent terminal chapterCommit identity is invalid");
  }
  if (terminal.chapterCommit?.path !== `story/runtime/chapter-commits/${terminal.productionRun?.productionOperationId}--${terminal.chapterCommit?.receiptId}.json`) {
    errors.push("Agent terminal chapterCommit path is not canonical");
  }
  validateExactExternalRef(agentOperation.importReceipt, externalBookPath(bookId, terminal.importReceipt?.path), terminal.importReceipt?.sha256, "agentOperation.importReceipt", errors);
  if (productionRun?.path !== externalBookPath(bookId, terminal.productionRun?.path)
    || productionRun?.sha256 !== terminal.productionRun?.sha256) {
    errors.push("productionRun does not match canonical evidence");
  }
  if (agentOperation.receipt?.sha256 !== sha256Bytes(terminalRead.bytes ?? Buffer.alloc(0))) errors.push("Agent terminal output hash mismatch");

  const importRead = await readJsonInside(repoPath, {
    path: externalBookPath(bookId, terminal.importReceipt?.path),
    sha256: terminal.importReceipt?.sha256,
  }, errors, "Hermes import receipt", terminal.importReceipt?.byteLength);
  const imported = importRead.value;
  if (imported) {
    exactKeys(imported, [
      "schemaVersion", "workOrderId", "workOrderSha256", "bookId", "sessionId", "request", "action",
      "hermesReceipt", "taskGuidance", ...(legacyProductionV1 ? [] : ["canaryIsolation"]), "importedAt", "receiptSelfHash",
    ], "Hermes import receipt", errors);
    const expectedImportSchemaVersion = legacyProductionV1 ? "hermes-control-import/v1" : "hermes-control-import/v2";
    if (imported.schemaVersion !== expectedImportSchemaVersion || imported.workOrderId !== workOrder.workOrderId
      || imported.workOrderSha256 !== workOrderSha256 || imported.bookId !== bookId
      || imported.sessionId !== workOrder.sessionId || !validDate(imported.importedAt)) {
      errors.push("Hermes import receipt identity mismatch");
    }
    if (legacyProductionV1) {
      if ("canaryIsolation" in imported) errors.push("legacy production Hermes import must not carry canary isolation evidence");
    } else if (!("canaryIsolation" in imported) || !sameCanonical(imported.canaryIsolation, canaryIsolation)) {
      errors.push("Hermes import canary isolation projection mismatch");
    }
    validateSelfHash(imported, "receiptSelfHash", "Hermes import receipt", errors);
    for (const [field, path] of [["request", expectedPaths.request], ["action", expectedPaths.action], ["hermesReceipt", expectedPaths.hermes]]) {
      validateArtifactRef(imported[field], `Hermes import receipt ${field}`, errors, { byteLength: true });
      if (imported[field]?.path !== path) errors.push(`Hermes import receipt ${field} path is not canonical`);
    }
    exactKeys(imported.taskGuidance, ["source", "bookId", "workOrderId", "actionRef", "textSha256"], "Hermes task guidance", errors);
    if (imported.taskGuidance?.source !== "hermes-control-action" || imported.taskGuidance?.bookId !== bookId
      || imported.taskGuidance?.workOrderId !== workOrder.workOrderId
      || !sameCanonical(imported.taskGuidance?.actionRef, imported.action)
      || imported.taskGuidance?.textSha256 !== hermesActionTextSha256) errors.push("Hermes task guidance binding mismatch");

    const requestBytes = await readRegularInside(repoPath, externalBookPath(bookId, imported.request?.path), imported.request?.sha256, errors, "Imported WorkOrder", imported.request?.byteLength);
    const expectedWorkOrderBytes = Buffer.from(JSON.stringify(canonicalJson(workOrder)), "utf8");
    if (!requestBytes?.equals(expectedWorkOrderBytes) || imported.request?.sha256 !== workOrderSha256) errors.push("Imported WorkOrder bytes mismatch");
    const actionRead = await readJsonInside(repoPath, {
      path: externalBookPath(bookId, imported.action?.path), sha256: imported.action?.sha256,
    }, errors, "Imported Hermes action", imported.action?.byteLength);
    const action = actionRead.value;
    if (action) {
      exactKeys(action, ["schemaVersion", "action", "workOrderId", "workOrderSha256", "bookId", "sessionId", "guidance", "guidanceSha256"], "Hermes action", errors);
      if (action.schemaVersion !== "hermes-control-action/v1" || action.action !== "write-next"
        || action.workOrderId !== workOrder.workOrderId || action.workOrderSha256 !== workOrderSha256
        || action.bookId !== bookId || action.sessionId !== workOrder.sessionId
        || sha256Bytes(Buffer.from(action.guidance ?? "", "utf8")) !== action.guidanceSha256
        || action.guidanceSha256 !== hermesActionTextSha256) errors.push("Hermes action binding mismatch");
    }
    const hermesRead = await readJsonInside(repoPath, {
      path: externalBookPath(bookId, imported.hermesReceipt?.path), sha256: imported.hermesReceipt?.sha256,
    }, errors, "Imported Hermes invocation", imported.hermesReceipt?.byteLength);
    const hermes = hermesRead.value;
    if (hermes) {
      exactKeys(hermes, [
        "schemaVersion", "status", "workOrderId", "workOrderSha256", "profile", "runtime", "invocation",
        "promptSha256", "systemPrompt", "rawOutput", "action", "sessionExport", "receiptSelfHash",
      ], "Hermes invocation", errors);
      exactKeys(hermes.profile, ["profileId", "soulId", "soulVersion", "configSha256", "soulSha256"], "Hermes invocation profile", errors);
      const hasTransportPolicy = Object.hasOwn(hermes.runtime ?? {}, "transportPolicy");
      const requiresTransportPolicy = workOrder?.schemaVersion === 2
        && workOrder?.capability === "agent-operate"
        && workOrder?.executionMode === "promotion-canary"
        && OPAQUE_BLIND_PAIR_ID.test(workOrder?.modeEvidence?.canaryIsolation?.pairId ?? "");
      if (requiresTransportPolicy && !hasTransportPolicy) {
        errors.push("opaque blind-canary Hermes invocation receipt requires transport policy attestation");
      }
      exactKeys(hermes.runtime, [
        "provider", "model", "reasoning", "platform", "openaiRuntime", "transport", "toolsCount", "toolCallCount",
        ...(hasTransportPolicy ? ["transportPolicy"] : []),
      ], "Hermes invocation runtime", errors);
      errors.push(...validateHermesInvocationTransportPolicy(hermes.runtime));
      exactKeys(hermes.invocation, ["sessionId", "startedAt", "completedAt", "exitCode"], "Hermes invocation timing", errors);
      validateSelfHash(hermes, "receiptSelfHash", "Hermes invocation", errors);
      if (hermes.schemaVersion !== "hermes-invocation-receipt/v1" || hermes.status !== "completed"
        || hermes.workOrderId !== workOrder.workOrderId || hermes.workOrderSha256 !== workOrderSha256
        || hermes.profile?.profileId !== workOrder.modeEvidence.profileId
        || hermes.profile?.soulId !== workOrder.modeEvidence.soulId
        || hermes.profile?.soulVersion !== workOrder.modeEvidence.soulVersion
        || hermes.profile?.configSha256 !== workOrder.modeEvidence.profileConfigSha256
        || hermes.profile?.soulSha256 !== workOrder.modeEvidence.soulSha256
        || hermes.runtime?.provider !== "openai-codex" || hermes.runtime?.model !== "gpt-5.6-sol"
        || hermes.runtime?.reasoning !== "high" || hermes.runtime?.toolsCount !== 0
        || hermes.runtime?.platform !== "cli" || hermes.runtime?.openaiRuntime !== "auto"
        || hermes.runtime?.transport !== "codex_responses" || hermes.runtime?.toolCallCount !== 0
        || hermes.invocation?.sessionId !== hermesInvocationSessionId
        || hermes.invocation?.exitCode !== 0 || hermes.action?.sha256 !== imported.action?.sha256
        || hermes.action?.byteLength !== imported.action?.byteLength
        || hermes.action?.textSha256 !== hermesActionTextSha256) errors.push("Hermes invocation binding mismatch");
      if (!validDate(hermes.invocation?.startedAt) || !validDate(hermes.invocation?.completedAt)
        || Date.parse(hermes.invocation.completedAt) < Date.parse(hermes.invocation.startedAt)) {
        errors.push("Hermes invocation timing is invalid");
      }
    }
  }

  const runRead = await readJsonInside(repoPath, {
    path: externalBookPath(bookId, terminal.productionRun?.path), sha256: terminal.productionRun?.sha256,
  }, errors, "ProductionRun", terminal.productionRun?.byteLength);
  const run = runRead.value;
  if (run) {
    exactKeys(run, [
      "schemaVersion", "command", "commandSha256", "productionAttempt", "context", "executionStatus", "approvalStatus",
      "completionHealth", "projectionHealth", "projectionOrigin", "evidence", "chapter", "startedAt", "completedAt", "runSelfHash",
    ], "ProductionRun", errors);
    allowedKeys(run.command, [
      "schemaVersion", "commandId", "idempotencyKey", "intentDigest", "capability", "source", "binding", "authorization",
      "args", "activatedSkills", "issuedAt", "commandSelfHash",
    ], ["disabledSkills"], "ProductionRun command", errors);
    allowedKeys(run.context, [
      "schemaVersion", "commandId", "commandSha256", "productionOperationId", "attemptId", "intentDigest", "capability",
      "mode", "source", "actionSource", "binding", "activatedSkills", "startedAt",
    ], ["productionInputs"], "ProductionRun context", errors);
    exactKeys(run.productionAttempt, ["productionOperationId", "attemptId"], "ProductionRun attempt", errors);
    exactKeys(run.evidence, [
      "kind", "receiptFile", "receiptId", "commitState", "chapterArtifact", "indexArtifact", "currentStateArtifact",
      "railTruth", "verifiedAt",
    ], "ProductionRun evidence", errors);
    validateSelfHash(run, "runSelfHash", "ProductionRun", errors);
    if (run.schemaVersion !== "production-run/v1" || run.executionStatus !== "succeeded"
      || run.completionHealth !== "verified" || run.projectionHealth !== "verified"
      || run.evidence?.kind !== "verified-commit" || run.evidence?.commitState !== "verified"
      || !isObject(run.chapter)) {
      errors.push("ProductionRun is not a fully verified success");
    }
    if (!validDate(run.startedAt) || !validDate(run.completedAt) || Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
      errors.push("ProductionRun timing is invalid");
    }
    if (!isObject(run.command) || run.command.schemaVersion !== "production-command/v2"
      || sha256Canonical(without(run.command, "commandSelfHash")) !== run.command.commandSelfHash
      || run.commandSha256 !== run.command.commandSelfHash) errors.push("ProductionRun command self hash mismatch");
    if (run.command?.commandId !== terminal.productionRun?.commandId
      || run.productionAttempt?.productionOperationId !== terminal.productionRun?.productionOperationId
      || run.productionAttempt?.attemptId !== terminal.productionRun?.attemptId) errors.push("ProductionRun attempt identity mismatch");
    if (run.command?.source !== "hq" || run.command?.capability !== "write-next-chapter"
      || run.command?.binding?.bookId !== bookId || run.command?.binding?.sessionId !== workOrder.sessionId
      || run.command?.binding?.workOrderId !== workOrder.workOrderId
      || run.command?.authorization?.kind !== "authenticated-orchestrator"
      || run.command?.authorization?.workOrderId !== workOrder.workOrderId
      || run.command?.authorization?.workOrderSha256 !== workOrderSha256
      || run.command?.authorization?.manifestCapabilitySha256 !== manifestCapabilitySha256
      || run.command?.authorization?.ownerDecisionReceiptSha256 !== sha256Canonical(workOrder.ownerDecision)) {
      errors.push("ProductionRun authenticated orchestrator binding mismatch");
    }
    if (!imported || !sameCanonical(run.command?.args?.taskGuidance, imported.taskGuidance)) errors.push("ProductionRun task guidance mismatch");
    if (!sameCanonical(run.command?.binding?.soulBinding ?? null, workOrder.expectedSoulBinding ?? null)) errors.push("ProductionRun Soul binding mismatch");
    if (run.context?.commandId !== run.command?.commandId || run.context?.commandSha256 !== run.commandSha256
      || run.context?.productionOperationId !== run.productionAttempt?.productionOperationId
      || run.context?.attemptId !== run.productionAttempt?.attemptId
      || run.context?.source !== "hq" || run.context?.actionSource !== "authenticated-orchestrator"
      || !sameCanonical(run.context?.binding, run.command?.binding)) errors.push("ProductionRun execution context mismatch");
    if (run.evidence?.receiptFile?.path !== terminal.chapterCommit?.path
      || run.evidence?.receiptFile?.sha256 !== terminal.chapterCommit?.sha256
      || run.evidence?.receiptId !== terminal.chapterCommit?.receiptId) errors.push("ProductionRun ChapterCommit reference mismatch");
    if (verifyProjectedArtifacts) {
      for (const [label, ref] of [
        ["ProductionRun chapter", run.evidence?.chapterArtifact],
        ["ProductionRun index", run.evidence?.indexArtifact],
        ["ProductionRun current state", run.evidence?.currentStateArtifact],
      ]) if (ref !== null && ref !== undefined) await verifyArtifactHash(repoPath, bookId, ref, label, errors);
      if (run.evidence?.railTruth?.applicability === "required" && run.evidence.railTruth.status === "verified") {
        await verifyArtifactHash(repoPath, bookId, run.evidence.railTruth.receipt, "ProductionRun rail truth", errors);
      }
    }
  }

  const chapterRead = await readJsonInside(repoPath, {
    path: externalBookPath(bookId, terminal.chapterCommit?.path), sha256: terminal.chapterCommit?.sha256,
  }, errors, "ChapterCommit", terminal.chapterCommit?.byteLength);
  const chapter = chapterRead.value;
  if (chapter) {
    exactKeys(chapter, [
      "schemaVersion", "receiptId", "bookId", "chapterNumber", "capability", "productionOperationId", "attemptId",
      "fictionOperationIds", "operationManifests", "chapterArtifact", "indexArtifact", "currentStateArtifact", "railTruth",
      "commitState", "committedAt", "receiptSelfHash",
    ], "ChapterCommit", errors);
    validateSelfHash(chapter, "receiptSelfHash", "ChapterCommit", errors);
    if (chapter.schemaVersion !== "chapter-commit-receipt/v1" || chapter.receiptId !== terminal.chapterCommit?.receiptId
      || chapter.receiptSelfHash !== terminal.chapterCommit?.receiptSelfHash || chapter.bookId !== bookId
      || chapter.productionOperationId !== terminal.productionRun?.productionOperationId
      || chapter.attemptId !== terminal.productionRun?.attemptId || chapter.commitState !== "verified"
      || chapter.capability !== "write-next-chapter" || !validDate(chapter.committedAt)
      || !Array.isArray(chapter.fictionOperationIds) || chapter.fictionOperationIds.length === 0
      || new Set(chapter.fictionOperationIds).size !== chapter.fictionOperationIds.length
      || [...(chapter.fictionOperationIds ?? [])].sort().some((id, index) => id !== chapter.fictionOperationIds[index])) {
      errors.push("ChapterCommit identity or state mismatch");
    }
    if (verifyProjectedArtifacts) {
      for (const [label, ref] of [
        ["ChapterCommit chapter", chapter.chapterArtifact],
        ["ChapterCommit index", chapter.indexArtifact],
        ["ChapterCommit current state", chapter.currentStateArtifact],
      ]) if (ref !== null && ref !== undefined) await verifyArtifactHash(repoPath, bookId, ref, label, errors);
    }
    for (const [index, item] of (chapter.operationManifests ?? []).entries()) {
      await verifyArtifactHash(repoPath, bookId, item?.artifact, `ChapterCommit operation manifest ${index}`, errors);
    }
    if (chapter.railTruth?.applicability === "required" && chapter.railTruth.status === "verified") {
      await verifyArtifactHash(repoPath, bookId, chapter.railTruth.receipt, "ChapterCommit rail truth", errors);
    }
  }

  try {
    const commitDir = join(repoPath, "books", bookId, "story", "runtime", "chapter-commits");
    const names = (await readdir(commitDir)).filter((name) => name.endsWith(".json"));
    const matching = [];
    for (const name of names) {
      const ref = { path: `books/${bookId}/story/runtime/chapter-commits/${name}`, sha256: null };
      const bytes = await readRegularInside(repoPath, ref.path, null, errors, `ChapterCommit inventory ${name}`);
      if (!bytes) continue;
      try {
        const value = JSON.parse(bytes.toString("utf8"));
        if (value.productionOperationId === terminal.productionRun?.productionOperationId && value.attemptId === terminal.productionRun?.attemptId) matching.push(value);
      } catch {
        errors.push(`ChapterCommit inventory ${name} is not valid JSON`);
      }
    }
    if (matching.length !== 1 || !chapter || !sameCanonical(matching[0], chapter)) {
      errors.push("successful Agent operation must have exactly one matching ChapterCommit");
    }
  } catch {
    errors.push("ChapterCommit inventory is unavailable");
  }

  return {
    errors,
    terminal: terminal ? {
      path: agentOperation.receipt.path,
      sha256: agentOperation.receipt.sha256,
      receiptSelfHash: terminal.receiptSelfHash,
      status: terminal.status,
    } : null,
    chapterCommit: chapter ? {
      path: externalBookPath(bookId, terminal.chapterCommit.path),
      sha256: terminal.chapterCommit.sha256,
      receiptId: terminal.chapterCommit.receiptId,
      receiptSelfHash: terminal.chapterCommit.receiptSelfHash,
      commitState: chapter.commitState,
    } : null,
  };
}
