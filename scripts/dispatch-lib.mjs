import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { inspectGitRepo, validateManifest } from "./edge-lib.mjs";
import {
  buildAgentOperationEnvelope,
  buildHermesControlPrompt,
  buildHermesInvocationReceipt,
  canonicalStringify,
  HERMES_CONTROL_TRANSPORT_POLICY,
  HERMES_CONTROL_QUERY,
  parseHermesControlSessionExport,
  parseHermesSessionId,
  readHermesDispatchAuthority,
  sha256Bytes,
  validateAgentOperateModeEvidence,
  validateHermesInvocationReceipt,
  validateHermesRenderedControlStdout,
  verifyAgentOperateAuthority,
} from "./hermes-control-lib.mjs";
import {
  hashInkosCanonicalJson,
  verifyInkosAgentOperationTerminal,
} from "./inkos-agent-terminal-verifier.mjs";
import {
  verifyCanarySourceSnapshot,
  verifyPromotionCanaryIsolation,
} from "./canary-isolation-lib.mjs";
import { validateBlindCanaryBatchConfig } from "./blind-canary-batch-plan-lib.mjs";

const WORK_ORDER_KEYS = new Set([
  "schemaVersion",
  "workOrderId",
  "idempotencyKey",
  "repo",
  "capability",
  "bookId",
  "slateId",
  "candidateId",
  "humanDecision",
  "comment",
  "candidateCount",
  "sessionId",
  "instruction",
  "approvalMode",
  "approvedInputs",
  "privateInputs",
  "requestedAt",
  "timeoutMs",
]);
const WORK_ORDER_V2_KEYS = new Set([
  "schemaVersion", "workOrderId", "idempotencyKey", "repo", "capability", "bookId", "sessionId",
  "instruction", "args", "expectedSoulBinding", "ownerDecision", "runtime", "approvalMode", "approvedInputs", "privateInputs",
  "executionMode", "modeEvidence", "requestedAt", "timeoutMs",
]);

const INPUT_KEYS = new Set(["repo", "commit", "path", "sha256", "role"]);
const PRIVATE_INPUT_KEYS = new Set(["repo", "path", "sha256", "role", "declaredByRole"]);
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_WORK_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_SLATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const UNSAFE_BOOK_ID_RE = /[\u0000-\u001f\u007f/\\:*?"'`{}<>|]/u;
const OPAQUE_BLIND_PAIR_ID = /^bp-[0-9a-f]{24}$/;
const ACTIVE_BLIND_CANARY_BATCH_CONFIG = "config/blind-canary-batch.json";

function isSafeBookId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 120
    && value.trim() === value
    && value !== "."
    && value !== ".."
    && !value.includes("..")
    && !UNSAFE_BOOK_ID_RE.test(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRelativePath(value, label, errors) {
  if (!hasText(value)) {
    errors.push(`${label} is required`);
    return;
  }
  const normalized = normalize(value);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep}`) || value.split(/[\\/]+/).includes("..")) {
    errors.push(`${label} must stay inside its repository`);
  }
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function readActiveBlindCanaryBatchConfig(root) {
  let config;
  try {
    const bytes = readFileSync(join(root, ACTIVE_BLIND_CANARY_BATCH_CONFIG));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`active blind canary batch config is unreadable: ${ACTIVE_BLIND_CANARY_BATCH_CONFIG}`, { cause: error });
  }
  const errors = validateBlindCanaryBatchConfig(config);
  if (errors.length > 0) {
    throw new Error(`active blind canary batch config is invalid: ${errors.join("; ")}`);
  }
  return config;
}

function activeBlindCanaryPair(config, pairId) {
  let ordinal = 0;
  for (const genre of config.genres) {
    for (let round = 1; round <= config.roundsPerGenre; round += 1) {
      ordinal += 1;
      const digest = createHash("sha256")
        .update(stableStringify({ domain: "bp", namespace: config.idNamespaceSha256, ordinal }))
        .digest("hex");
      if (`bp-${digest.slice(0, 24)}` === pairId) return { genre, ordinal, round };
    }
  }
  return null;
}

function assertActiveBlindCanaryWorkOrder(root, workOrder) {
  const pairId = workOrder?.modeEvidence?.canaryIsolation?.pairId;
  if (
    workOrder?.schemaVersion !== 2
    || workOrder.capability !== "agent-operate"
    || workOrder.executionMode !== "promotion-canary"
  ) return;
  if (!OPAQUE_BLIND_PAIR_ID.test(pairId ?? "")) {
    throw new Error("promotion-canary pairId must be an active opaque blind-batch ID");
  }

  const config = readActiveBlindCanaryBatchConfig(root);
  const pair = activeBlindCanaryPair(config, pairId);
  if (!pair) {
    throw new Error(`promotion-canary pairId is not active in ${ACTIVE_BLIND_CANARY_BATCH_CONFIG}: ${pairId}`);
  }

  const errors = [];
  const lane = workOrder.modeEvidence?.lane;
  const laneSuffix = lane === "neutral-baseline" ? "neutral" : lane === "genre-soul" ? "soul" : null;
  if (workOrder.bookId !== pair.genre.bookId) errors.push("active blind canary pair bookId mismatch");
  if (workOrder.instruction !== config.instruction) errors.push("active blind canary instruction mismatch");
  if (stableStringify(workOrder.args) !== stableStringify({
    chapterCount: config.chapterCount,
    targetLength: config.targetLength,
  })) errors.push("active blind canary args mismatch");
  if (laneSuffix === null) {
    errors.push("active blind canary lane mismatch");
  } else {
    if (workOrder.workOrderId !== `wo-${pairId}-${laneSuffix}`) errors.push("active blind canary workOrderId mismatch");
    if (workOrder.idempotencyKey !== `agent-operate:${pairId}:${laneSuffix}`) errors.push("active blind canary idempotencyKey mismatch");
  }
  if (workOrder.modeEvidence?.canaryIsolation?.path !== `.inkos/canaries/${pairId}/common-snapshot.json`) {
    errors.push("active blind canary isolation path mismatch");
  }

  if (lane === "genre-soul") {
    if (workOrder.modeEvidence.profileId !== pair.genre.profileId || workOrder.runtime?.hermesProfile !== pair.genre.profileId) {
      errors.push("active blind canary profile mismatch");
    }
    if (
      workOrder.modeEvidence.soulId !== pair.genre.soulId
      || workOrder.modeEvidence.soulVersion !== pair.genre.soulVersion
      || workOrder.expectedSoulBinding?.soulId !== pair.genre.soulId
      || workOrder.expectedSoulBinding?.soulVersion !== pair.genre.soulVersion
    ) errors.push("active blind canary Soul mismatch");
  } else if (lane === "neutral-baseline") {
    if (workOrder.modeEvidence.profileId !== "inkos_neutral_baseline" || workOrder.runtime?.hermesProfile !== "inkos_neutral_baseline") {
      errors.push("active blind canary neutral profile mismatch");
    }
    if (
      workOrder.modeEvidence.soulId !== "neutral-baseline-ko"
      || workOrder.modeEvidence.soulVersion !== "v1"
      || workOrder.expectedSoulBinding !== null
    ) errors.push("active blind canary neutral Soul mismatch");
  }

  const requestedAt = workOrder.requestedAt;
  if (
    typeof requestedAt !== "string"
    || Number.isNaN(Date.parse(requestedAt))
    || new Date(requestedAt).toISOString() !== requestedAt
  ) {
    errors.push("active blind canary requestedAt must be a canonical ISO timestamp");
  } else {
    const expectedApprovalId = `approval-${createHash("sha256")
      .update(Buffer.from(`${config.batchId}:${requestedAt}`, "utf8"))
      .digest("hex")
      .slice(0, 24)}`;
    if (workOrder.ownerDecision?.receiptId !== expectedApprovalId) errors.push("active blind canary owner approval ID mismatch");
    if (workOrder.ownerDecision?.decidedAt !== requestedAt) errors.push("active blind canary owner approval timestamp mismatch");
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
}

export function runReceiptSelfHash(receipt) {
  const { receiptSelfHash: _self, replayed: _replayed, ...immutable } = receipt;
  return sha256Json(immutable);
}

export function sealRunReceiptV2(receipt) {
  if (receipt?.schemaVersion !== 2) return receipt;
  return { ...receipt, receiptSelfHash: runReceiptSelfHash(receipt) };
}

export function validateRunReceiptSelfHash(receipt) {
  return receipt?.schemaVersion !== 2
    || (SHA256.test(receipt.receiptSelfHash ?? "") && receipt.receiptSelfHash === runReceiptSelfHash(receipt));
}

export function validateWorkOrder(workOrder, manifest) {
  if (isPlainObject(workOrder) && workOrder.schemaVersion === 2) {
    return validateWorkOrderV2(workOrder, manifest);
  }
  const errors = [];
  if (!isPlainObject(workOrder)) return ["work order must be an object"];

  for (const key of Object.keys(workOrder)) {
    if (!WORK_ORDER_KEYS.has(key)) errors.push(`unknown work order field: ${key}`);
  }
  if (workOrder.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!hasText(workOrder.workOrderId) || workOrder.workOrderId.length > 160) {
    errors.push("workOrderId must be 1-160 characters");
  }
  if (!hasText(workOrder.idempotencyKey) || workOrder.idempotencyKey.length > 240) {
    errors.push("idempotencyKey must be 1-240 characters");
  }
  if (!hasText(workOrder.repo)) errors.push("repo is required");
  if (!hasText(workOrder.capability)) errors.push("capability is required");
  for (const field of ["bookId", "slateId", "candidateId", "humanDecision", "comment", "sessionId", "instruction"]) {
    if (workOrder[field] !== undefined && !hasText(workOrder[field])) {
      errors.push(`${field} must be a non-empty string when provided`);
    }
  }
  if (workOrder.sessionId !== undefined && !SAFE_SESSION_ID.test(workOrder.sessionId)) {
    errors.push("sessionId must use 1-160 safe filename characters");
  }
  if (workOrder.slateId !== undefined && !SAFE_SLATE_ID.test(workOrder.slateId)) {
    errors.push("slateId must use 1-80 safe filename characters");
  }
  if (workOrder.comment !== undefined && workOrder.comment.length > 2000) {
    errors.push("comment must be 2,000 characters or fewer");
  }
  if (workOrder.candidateCount !== undefined
    && (!Number.isInteger(workOrder.candidateCount) || workOrder.candidateCount < 1 || workOrder.candidateCount > 20)) {
    errors.push("candidateCount must be an integer between 1 and 20");
  }
  if (!Array.isArray(workOrder.approvedInputs)) errors.push("approvedInputs must be an array");
  if (workOrder.privateInputs !== undefined && !Array.isArray(workOrder.privateInputs)) {
    errors.push("privateInputs must be an array when provided");
  }
  if (!hasText(workOrder.requestedAt) || Number.isNaN(Date.parse(workOrder.requestedAt))) {
    errors.push("requestedAt must be an ISO date-time");
  }
  if (workOrder.timeoutMs !== undefined && (!Number.isInteger(workOrder.timeoutMs) || workOrder.timeoutMs < 1000 || workOrder.timeoutMs > 3600000)) {
    errors.push("timeoutMs must be an integer between 1000 and 3600000");
  }

  const repo = manifest?.repos?.find((candidate) => candidate.name === workOrder.repo);
  if (!repo) {
    errors.push(`repo is not registered: ${workOrder.repo}`);
    return errors;
  }
  if (repo.managementState !== "active" || repo.adoptionState !== "ready") {
    errors.push(`repo is not dispatchable: ${workOrder.repo}`);
  }
  if (repo.execution?.kind !== "worker") {
    errors.push(`repo is not a worker: ${workOrder.repo}`);
    return errors;
  }

  const capability = repo.execution.capabilities.find((candidate) => candidate.name === workOrder.capability);
  if (!capability) {
    errors.push(`capability is not registered for ${workOrder.repo}: ${workOrder.capability}`);
    return errors;
  }
  if (workOrder.approvalMode !== capability.approval) {
    errors.push(`approvalMode must be ${capability.approval} for ${workOrder.repo}/${workOrder.capability}`);
  }
  if (capability.mode === "mutating" && repo.writeAllowed !== true) {
    errors.push(`repo does not allow mutating dispatch: ${workOrder.repo}`);
  }

  if (workOrder.capability === "interact") {
    if (!hasText(workOrder.bookId)) errors.push("bookId is required for interact v1");
    if (!hasText(workOrder.instruction)) errors.push("instruction is required for interact v1");
  }
  if (workOrder.capability === "status" && workOrder.instruction !== undefined) {
    errors.push("status does not accept instruction");
  }
  if (workOrder.capability === "reference-bind") {
    if (!hasText(workOrder.bookId)) errors.push("bookId is required for reference-bind v1");
    const privateInputs = Array.isArray(workOrder.privateInputs) ? workOrder.privateInputs : [];
    const roles = new Set(privateInputs.map((input) => input?.role));
    for (const role of ["raw-source", "story-index", "style-examples"]) {
      if (!roles.has(role)) errors.push(`reference-bind requires private input role: ${role}`);
    }
    if (!workOrder.approvedInputs?.some((input) => input.role === "reference-pack")) {
      errors.push("reference-bind requires approved input role: reference-pack");
    }
  }
  if (workOrder.capability === "pitch-slate") {
    if (workOrder.bookId !== undefined) errors.push("pitch-slate must not bind a bookId");
    if (!hasText(workOrder.slateId)) errors.push("slateId is required for pitch-slate v1");
    if (!Number.isInteger(workOrder.candidateCount)) errors.push("candidateCount is required for pitch-slate v1");
    if (!hasText(workOrder.instruction)) errors.push("instruction is required for pitch-slate v1");
    if (!workOrder.approvedInputs?.some((input) => input.role === "pitch-reference-pack")) {
      errors.push("pitch-slate requires approved input role: pitch-reference-pack");
    }
  }
  if (workOrder.capability === "pitch-review") {
    if (workOrder.bookId !== undefined) errors.push("pitch-review must not bind a bookId");
    if (!hasText(workOrder.slateId)) errors.push("slateId is required for pitch-review v1");
    if (workOrder.candidateCount !== undefined) errors.push("pitch-review does not accept candidateCount");
    if (workOrder.instruction !== undefined) errors.push("pitch-review does not accept instruction");
  }
  if (workOrder.capability === "pitch-decision") {
    if (workOrder.bookId !== undefined) errors.push("pitch-decision must not bind a bookId");
    if (!hasText(workOrder.slateId)) errors.push("slateId is required for pitch-decision v1");
    if (!/^p\d{2}$/.test(workOrder.candidateId ?? "")) errors.push("candidateId must use pNN format for pitch-decision v1");
    if (!["select", "hold", "reject"].includes(workOrder.humanDecision)) {
      errors.push("humanDecision must be select, hold, or reject for pitch-decision v1");
    }
    if (["hold", "reject"].includes(workOrder.humanDecision) && !hasText(workOrder.comment)) {
      errors.push("pitch-decision hold or reject requires comment");
    }
    if (workOrder.instruction !== undefined) errors.push("pitch-decision does not accept instruction");
  }
  if (workOrder.capability === "pitch-promote") {
    if (!hasText(workOrder.bookId)) errors.push("bookId is required for pitch-promote v1");
    if (!hasText(workOrder.slateId)) errors.push("slateId is required for pitch-promote v1");
    if (workOrder.instruction !== undefined) errors.push("pitch-promote does not accept instruction");
  }
  if (!["pitch-slate", "pitch-review", "pitch-decision", "pitch-promote"].includes(workOrder.capability) && workOrder.slateId !== undefined) {
    errors.push("slateId is only valid for pitch capabilities v1");
  }
  if (workOrder.capability !== "pitch-slate" && workOrder.candidateCount !== undefined) {
    errors.push("candidateCount is only valid for pitch-slate v1");
  }
  if (workOrder.capability !== "pitch-decision") {
    if (workOrder.candidateId !== undefined) errors.push("candidateId is only valid for pitch-decision v1");
    if (workOrder.humanDecision !== undefined) errors.push("humanDecision is only valid for pitch-decision v1");
    if (workOrder.comment !== undefined) errors.push("comment is only valid for pitch-decision v1");
  }

  if (Array.isArray(workOrder.approvedInputs)) {
    for (const [index, input] of workOrder.approvedInputs.entries()) {
      const label = `approvedInputs[${index}]`;
      if (!isPlainObject(input)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      for (const key of Object.keys(input)) {
        if (!INPUT_KEYS.has(key)) errors.push(`${label} has unknown field: ${key}`);
      }
      if (!manifest.repos.some((candidate) => candidate.name === input.repo)) {
        errors.push(`${label}.repo is not registered: ${input.repo}`);
      }
      if (!SHA1.test(input.commit ?? "")) errors.push(`${label}.commit must be a full Git SHA-1`);
      if (!SHA256.test(input.sha256 ?? "")) errors.push(`${label}.sha256 must be a SHA-256 digest`);
      validateRelativePath(input.path, `${label}.path`, errors);
      if (!hasText(input.role)) errors.push(`${label}.role is required`);
    }
  }

  if (Array.isArray(workOrder.privateInputs)) {
    const seenPrivateRoles = new Set();
    for (const [index, input] of workOrder.privateInputs.entries()) {
      const label = `privateInputs[${index}]`;
      if (!isPlainObject(input)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      for (const key of Object.keys(input)) {
        if (!PRIVATE_INPUT_KEYS.has(key)) errors.push(`${label} has unknown field: ${key}`);
      }
      if (!manifest.repos.some((candidate) => candidate.name === input.repo)) {
        errors.push(`${label}.repo is not registered: ${input.repo}`);
      }
      if (!SHA256.test(input.sha256 ?? "")) errors.push(`${label}.sha256 must be a SHA-256 digest`);
      validateRelativePath(input.path, `${label}.path`, errors);
      if (!hasText(input.role)) errors.push(`${label}.role is required`);
      if (seenPrivateRoles.has(input.role)) errors.push(`${label}.role must be unique`);
      seenPrivateRoles.add(input.role);
      if (!hasText(input.declaredByRole)) errors.push(`${label}.declaredByRole is required`);
      const declaration = workOrder.approvedInputs?.find((approved) => approved.role === input.declaredByRole);
      if (!declaration) {
        errors.push(`${label}.declaredByRole does not match an approved input role`);
      } else if (input.repo !== declaration.repo) {
        errors.push(`${label}.repo must match its approved declaration repository`);
      }
    }
  }

  return errors;
}

export function validateWorkOrderV2(workOrder, manifest) {
  const errors = [];
  if (!isPlainObject(workOrder)) return ["work order must be an object"];
  for (const key of Object.keys(workOrder)) {
    if (!WORK_ORDER_V2_KEYS.has(key)) errors.push(`unknown WorkOrder v2 field: ${key}`);
  }
  if (workOrder.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  for (const field of ["workOrderId", "idempotencyKey", "repo", "capability", "bookId", "sessionId", "instruction"]) {
    if (!hasText(workOrder[field])) errors.push(`${field} is required for WorkOrder v2`);
  }
  if (hasText(workOrder.workOrderId) && !SAFE_WORK_ORDER_ID.test(workOrder.workOrderId)) errors.push("workOrderId must use 1-160 safe identifier characters");
  if (hasText(workOrder.idempotencyKey) && !SAFE_IDEMPOTENCY_KEY.test(workOrder.idempotencyKey)) errors.push("idempotencyKey must use 1-240 safe identifier characters");
  if (!isSafeBookId(workOrder.bookId)) errors.push("bookId must be one safe path segment");
  if (!SAFE_SESSION_ID.test(workOrder.sessionId ?? "")) errors.push("sessionId must use 1-160 safe filename characters");
  if (!isPlainObject(workOrder.args)) {
    errors.push("args must be a strict object for WorkOrder v2");
  } else {
    for (const key of Object.keys(workOrder.args)) {
      if (!["chapterCount", "targetLength"].includes(key)) errors.push(`unknown WorkOrder v2 args field: ${key}`);
    }
    if (workOrder.args.chapterCount !== 1) errors.push("WorkOrder v2 requires chapterCount=1");
    if (workOrder.args.targetLength !== undefined) {
      const target = workOrder.args.targetLength;
      if (!isPlainObject(target)) errors.push("args.targetLength must be an object");
      else {
        for (const key of Object.keys(target)) {
          if (!["count", "unit"].includes(key)) errors.push(`unknown targetLength field: ${key}`);
        }
        if (!Number.isInteger(target.count) || target.count < 1) errors.push("targetLength.count must be a positive integer");
        if (!["ko-chars", "zh-chars", "words"].includes(target.unit)) errors.push("targetLength.unit is invalid");
      }
    }
  }
  if (!("expectedSoulBinding" in workOrder) || workOrder.expectedSoulBinding === undefined) {
    errors.push("expectedSoulBinding is required for WorkOrder v2");
  } else if (workOrder.expectedSoulBinding !== null) {
    if (!isPlainObject(workOrder.expectedSoulBinding)) {
      errors.push("expectedSoulBinding must be null or a strict object");
    } else {
      for (const key of Object.keys(workOrder.expectedSoulBinding)) {
        if (!["soulId", "soulVersion", "bindingSha256"].includes(key)) errors.push(`unknown expectedSoulBinding field: ${key}`);
      }
      if (!hasText(workOrder.expectedSoulBinding.soulId) || workOrder.expectedSoulBinding.soulId.length > 240) errors.push("expectedSoulBinding.soulId must be 1-240 characters");
      if (!hasText(workOrder.expectedSoulBinding.soulVersion) || workOrder.expectedSoulBinding.soulVersion.length > 240) errors.push("expectedSoulBinding.soulVersion must be 1-240 characters");
      if (!SHA256.test(workOrder.expectedSoulBinding.bindingSha256 ?? "")) errors.push("expectedSoulBinding.bindingSha256 is invalid");
    }
  }
  if (!isPlainObject(workOrder.ownerDecision)) {
    errors.push("ownerDecision is required for WorkOrder v2");
  } else {
    for (const key of Object.keys(workOrder.ownerDecision)) {
      if (!["receiptId", "status", "instructionSha256", "argsSha256", "decidedAt"].includes(key)) errors.push(`unknown ownerDecision field: ${key}`);
    }
    if (!hasText(workOrder.ownerDecision.receiptId)) errors.push("ownerDecision.receiptId is required");
    if (workOrder.ownerDecision.status !== "approved") errors.push("ownerDecision.status must be approved");
    if (!SHA256.test(workOrder.ownerDecision.instructionSha256 ?? "")) errors.push("ownerDecision.instructionSha256 is invalid");
    if (!SHA256.test(workOrder.ownerDecision.argsSha256 ?? "")) errors.push("ownerDecision.argsSha256 is invalid");
    if (!hasText(workOrder.ownerDecision.decidedAt) || Number.isNaN(Date.parse(workOrder.ownerDecision.decidedAt))) errors.push("ownerDecision.decidedAt must be an ISO date-time");
    if (hasText(workOrder.instruction)) {
      const instructionSha256 = createHash("sha256").update(Buffer.from(workOrder.instruction, "utf8")).digest("hex");
      if (workOrder.ownerDecision.instructionSha256 !== instructionSha256) errors.push("ownerDecision instruction hash mismatch");
      const argsSha256 = sha256Json({
        capability: workOrder.capability,
        bookId: workOrder.bookId,
        sessionId: workOrder.sessionId,
        args: workOrder.args,
        expectedSoulBinding: workOrder.expectedSoulBinding,
        ...(workOrder.capability === "agent-operate" ? {
          executionMode: workOrder.executionMode,
          modeEvidence: workOrder.modeEvidence,
        } : {}),
        instructionSha256,
      });
      if (workOrder.ownerDecision.argsSha256 !== argsSha256) errors.push("ownerDecision args hash mismatch");
    }
  }
  if (!isPlainObject(workOrder.runtime)) {
    errors.push("runtime is required for WorkOrder v2");
  } else {
    for (const key of Object.keys(workOrder.runtime)) {
      if (!["hermesProfile", "model", "reasoning"].includes(key)) errors.push(`unknown runtime field: ${key}`);
    }
    for (const key of ["hermesProfile", "model", "reasoning"]) {
      if (!hasText(workOrder.runtime[key])) errors.push(`runtime.${key} is required`);
    }
  }
  if (workOrder.capability === "agent-operate") {
    if (!["promotion-canary", "production"].includes(workOrder.executionMode)) {
      errors.push("agent-operate executionMode must be promotion-canary or production");
    }
    if (!isPlainObject(workOrder.modeEvidence)) errors.push("agent-operate modeEvidence is required");
    if (
      workOrder.runtime?.model !== "gpt-5.6-sol"
      || workOrder.runtime?.reasoning !== "high"
    ) errors.push("agent-operate runtime must be gpt-5.6-sol/high");
    if (!Array.isArray(workOrder.privateInputs) || workOrder.privateInputs.length !== 0) {
      errors.push("agent-operate privateInputs must be an explicit empty array");
    }
  } else {
    if (workOrder.executionMode !== undefined) errors.push("write-next does not accept executionMode");
    if (workOrder.modeEvidence !== undefined) errors.push("write-next does not accept modeEvidence");
  }
  if (workOrder.approvalMode !== "human") errors.push("WorkOrder v2 mutation requires approvalMode=human");
  if (!Array.isArray(workOrder.approvedInputs)) {
    errors.push("approvedInputs must be an array");
  } else if (workOrder.capability === "agent-operate" && workOrder.executionMode === "promotion-canary") {
    if (workOrder.approvedInputs.length !== 0) errors.push("promotion-canary approvedInputs must be empty");
  } else if (workOrder.approvedInputs.length > 0) {
    errors.push(workOrder.capability === "write-next"
      ? "write-next WorkOrder v2 does not accept unbound approvedInputs"
      : "this WorkOrder v2 mode does not accept approvedInputs");
  }
  if (workOrder.privateInputs !== undefined && !Array.isArray(workOrder.privateInputs)) errors.push("privateInputs must be an array when provided");
  else if (workOrder.privateInputs?.length > 0) errors.push("WorkOrder v2 does not accept unbound privateInputs");
  if (!hasText(workOrder.requestedAt) || Number.isNaN(Date.parse(workOrder.requestedAt))) errors.push("requestedAt must be an ISO date-time");
  if (workOrder.timeoutMs !== undefined && (!Number.isInteger(workOrder.timeoutMs) || workOrder.timeoutMs < 1000 || workOrder.timeoutMs > 3600000)) {
    errors.push("timeoutMs must be an integer between 1000 and 3600000");
  }

  const repo = manifest?.repos?.find((candidate) => candidate.name === workOrder.repo);
  if (!repo) return [...errors, `repo is not registered: ${workOrder.repo}`];
  if (repo.managementState !== "active" || repo.adoptionState !== "ready") errors.push(`repo is not dispatchable: ${workOrder.repo}`);
  if (repo.execution?.kind !== "worker") return [...errors, `repo is not a worker: ${workOrder.repo}`];
  const capability = repo.execution.capabilities.find((candidate) => candidate.name === workOrder.capability);
  if (!capability) return [...errors, `capability is not registered for ${workOrder.repo}: ${workOrder.capability}`];
  if (capability.mode !== "mutating" || capability.approval !== "human") errors.push("WorkOrder v2 requires a human-approved mutating capability");
  if (workOrder.repo !== "inkos" || !["write-next", "agent-operate"].includes(workOrder.capability)) {
    errors.push("WorkOrder v2 supports only inkos/write-next or inkos/agent-operate");
  }
  if (repo.writeAllowed !== true) errors.push(`repo does not allow mutating dispatch: ${workOrder.repo}`);
  return errors;
}

function buildInkosCliPlan({ root, manifest, repoPath, repo, capability, workOrder }) {
  const entrypoint = join(repoPath, repo.execution.entrypoint);
  const args = [entrypoint];
  let stdin = null;

  if (capability.name === "status") {
    args.push("status");
    if (workOrder.bookId) args.push(workOrder.bookId);
    args.push("--json");
  } else if (capability.name === "interact") {
    const readableBook = workOrder.bookId
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "book";
    const sessionId = workOrder.sessionId
      ?? `hq-${readableBook}-${createHash("sha256").update(workOrder.bookId).digest("hex").slice(0, 12)}`;
    args.push("interact", "--json", "--book", workOrder.bookId);
    args.push("--session", sessionId);
    stdin = `${workOrder.instruction.trim()}\n`;
  } else if (capability.name === "reference-bind") {
    const approvedPack = workOrder.approvedInputs.find((input) => input.role === "reference-pack");
    const privateByRole = new Map(workOrder.privateInputs.map((input) => [input.role, input]));
    const absoluteInput = (input) => {
      const sourceRepo = manifest.repos.find((candidate) => candidate.name === input.repo);
      return join(root, sourceRepo.path, input.path);
    };
    args.push(
      "reference",
      "bind",
      workOrder.bookId,
      "--pack",
      absoluteInput(approvedPack),
      "--story-index",
      absoluteInput(privateByRole.get("story-index")),
      "--style-examples",
      absoluteInput(privateByRole.get("style-examples")),
      "--source",
      absoluteInput(privateByRole.get("raw-source")),
      "--json",
    );
  } else if (capability.name === "pitch-slate") {
    const readableSlate = workOrder.slateId
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "slate";
    const sessionId = workOrder.sessionId
      ?? `hq-pitch-${readableSlate}-${createHash("sha256").update(workOrder.slateId).digest("hex").slice(0, 10)}`;
    const referenceInputs = [
      ...workOrder.approvedInputs.filter((input) => input.role === "pitch-reference-pack" || input.role.startsWith("pitch-support-")),
      ...(workOrder.privateInputs ?? []),
    ];
    const absoluteInput = (input) => {
      const sourceRepo = manifest.repos.find((candidate) => candidate.name === input.repo);
      return join(root, sourceRepo.path, input.path);
    };
    args.push(
      "pitch",
      "slate",
      "--json",
      "--id",
      workOrder.slateId,
      "--count",
      String(workOrder.candidateCount),
      "--session",
      sessionId,
      "--reference",
      ...referenceInputs.map(absoluteInput),
    );
    stdin = `${workOrder.instruction.trim()}\n`;
  } else if (capability.name === "pitch-review") {
    const readableSlate = workOrder.slateId
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "slate";
    const sessionId = workOrder.sessionId
      ?? `hq-pitch-review-${readableSlate}-${createHash("sha256").update(workOrder.slateId).digest("hex").slice(0, 10)}`;
    args.push("pitch", "review", "--json", "--id", workOrder.slateId, "--session", sessionId);
  } else if (capability.name === "pitch-decision") {
    args.push(
      "pitch",
      "decision",
      "--json",
      "--id",
      workOrder.slateId,
      "--candidate",
      workOrder.candidateId,
      "--decision",
      workOrder.humanDecision,
    );
    stdin = workOrder.comment === undefined ? null : `${workOrder.comment.trim()}\n`;
  } else if (capability.name === "pitch-promote") {
    args.push("pitch", "promote", "--json", "--id", workOrder.slateId, "--book", workOrder.bookId);
  } else {
    throw new Error(`inkos-cli-v1 does not implement capability: ${capability.name}`);
  }

  return {
    executable: process.execPath,
    args,
    stdin,
    timeoutMs: workOrder.timeoutMs ?? (["pitch-slate", "pitch-review", "pitch-promote"].includes(capability.name) ? 3600000 : capability.mode === "mutating" ? 1800000 : 30000),
    sessionId: ["interact", "pitch-slate", "pitch-review"].includes(capability.name) ? args[args.indexOf("--session") + 1] : null,
  };
}

function manifestCapabilitySha256(repo, capability) {
  return sha256Json({
    repo: repo.name,
    branch: repo.branch,
    adapter: repo.execution.adapter,
    receiptContract: repo.execution.receiptContract,
    capability,
  });
}

function buildInkosCliV2Plan({ repoPath, repo, capability, workOrder }) {
  if (!["write-next", "agent-operate"].includes(workOrder.capability)) {
    throw new Error(`inkos-cli-dual v2 does not implement capability: ${workOrder.capability}`);
  }
  const entrypoint = join(repoPath, repo.execution.entrypoint);
  const workOrderBytes = Buffer.from(stableStringify(workOrder), "utf8");
  const workOrderSha256 = createHash("sha256").update(workOrderBytes).digest("hex");
  const capabilitySha256 = manifestCapabilitySha256(repo, capability);
  return {
    executable: process.execPath,
    args: [
      entrypoint,
      ...(workOrder.capability === "agent-operate" ? ["--service", "codex", "--model", "gpt-5.6-sol"] : []),
      "production",
      workOrder.capability,
      "--work-order-sha",
      workOrderSha256,
      "--manifest-capability-sha",
      capabilitySha256,
      "--json",
    ],
    stdin: workOrder.capability === "write-next" ? workOrderBytes.toString("utf8") : null,
    timeoutMs: workOrder.timeoutMs ?? 1800000,
    sessionId: workOrder.sessionId,
    workOrderBytes,
    workOrderSha256,
    manifestCapabilitySha256: capabilitySha256,
  };
}

export function buildDispatchPlan({ root, manifest, workOrder }) {
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) throw new Error(manifestErrors.join("\n"));
  const workOrderErrors = validateWorkOrder(workOrder, manifest);
  if (workOrderErrors.length > 0) throw new Error(workOrderErrors.join("\n"));
  assertActiveBlindCanaryWorkOrder(root, workOrder);

  const repo = manifest.repos.find((candidate) => candidate.name === workOrder.repo);
  const capability = repo.execution.capabilities.find((candidate) => candidate.name === workOrder.capability);
  const repoPath = join(root, repo.path);
  let invocation;
  if (repo.execution.adapter === "inkos-cli-v1" || repo.execution.adapter === "inkos-cli-dual") {
    invocation = workOrder.schemaVersion === 2
      ? buildInkosCliV2Plan({ repoPath, repo, capability, workOrder })
      : buildInkosCliPlan({ root, manifest, repoPath, repo, capability, workOrder });
  } else {
    throw new Error(`unsupported worker adapter: ${repo.execution.adapter}`);
  }

  let hermesAuthority = null;
  if (workOrder.schemaVersion === 2 && workOrder.capability === "agent-operate") {
    hermesAuthority = readHermesDispatchAuthority(root, workOrder);
    const modeErrors = validateAgentOperateModeEvidence(workOrder, hermesAuthority);
    if (modeErrors.length > 0) throw new Error(modeErrors.join("\n"));
  }

  return {
    repo,
    capability,
    codeRepoPath: repoPath,
    executionRoot: repoPath,
    repoPath,
    invocation,
    hermesAuthority,
    mutating: capability.mode === "mutating",
    approvalRequired: capability.approval === "human",
  };
}

export function inspectDispatchTarget(plan) {
  const git = inspectGitRepo(plan.codeRepoPath ?? plan.repoPath);
  if (git.branch !== plan.repo.branch) {
    throw new Error(`child branch mismatch: expected ${plan.repo.branch}, found ${git.branch}`);
  }
  if (git.origin !== plan.repo.remoteUrl) {
    throw new Error(`child origin mismatch for ${plan.repo.name}`);
  }
  if (plan.mutating && git.dirty) {
    throw new Error(`refusing mutating dispatch to dirty child: ${plan.repo.name}`);
  }
  return git;
}

export function verifyApprovedInputs({ root, manifest, workOrder, spawn = spawnSync }) {
  return workOrder.approvedInputs.map((input) => {
    const sourceRepo = manifest.repos.find((candidate) => candidate.name === input.repo);
    const sourcePath = join(root, sourceRepo.path);
    const blob = spawn("git", ["-C", sourcePath, "show", `${input.commit}:${input.path}`], {
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (blob.status !== 0 || !Buffer.isBuffer(blob.stdout)) {
      throw new Error(`approved input is unavailable: ${input.repo}@${input.commit}:${input.path}`);
    }
    const actualSha256 = createHash("sha256").update(blob.stdout).digest("hex");
    if (actualSha256 !== input.sha256) {
      throw new Error(`approved input hash mismatch: ${input.repo}@${input.commit}:${input.path}`);
    }
    const workingTreeBytes = readFileSync(join(sourcePath, input.path));
    const workingTreeSha256 = createHash("sha256").update(workingTreeBytes).digest("hex");
    if (workingTreeSha256 !== input.sha256) {
      throw new Error(`approved input working-tree drift: ${input.repo}:${input.path}`);
    }
    return {
      ...input,
      status: "verified",
    };
  });
}

function containsDigest(value, digest) {
  if (value === digest) return true;
  if (Array.isArray(value)) return value.some((item) => containsDigest(item, digest));
  if (isPlainObject(value)) return Object.values(value).some((item) => containsDigest(item, digest));
  return false;
}

async function assertNoSymlink(repoPath, relativePath) {
  let cursor = repoPath;
  for (const part of relativePath.split(/[\\/]+/).filter(Boolean)) {
    cursor = join(cursor, part);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) throw new Error(`private input must not use symlinks: ${relativePath}`);
  }
}

export async function verifyPrivateInputs({ root, manifest, workOrder, spawn = spawnSync }) {
  const approved = new Map(workOrder.approvedInputs.map((input) => [input.role, input]));
  const declaredReceipts = new Map();
  for (const input of workOrder.privateInputs ?? []) {
    const receiptInput = approved.get(input.declaredByRole);
    if (!receiptInput) throw new Error(`private input declaration is unavailable: ${input.declaredByRole}`);
    let declaration = declaredReceipts.get(receiptInput.role);
    if (!declaration) {
      const sourceRepo = manifest.repos.find((candidate) => candidate.name === receiptInput.repo);
      const sourcePath = join(root, sourceRepo.path);
      const blob = spawn("git", ["-C", sourcePath, "show", `${receiptInput.commit}:${receiptInput.path}`], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (blob.status !== 0) throw new Error(`private input declaration is unavailable: ${receiptInput.role}`);
      try {
        declaration = JSON.parse(blob.stdout);
      } catch {
        throw new Error(`private input declaration is not JSON: ${receiptInput.role}`);
      }
      declaredReceipts.set(receiptInput.role, declaration);
    }
    if (!containsDigest(declaration, input.sha256)) {
      throw new Error(`private input SHA-256 is not declared by approved input: ${input.role}`);
    }
    const sourceRepo = manifest.repos.find((candidate) => candidate.name === input.repo);
    const repoPath = join(root, sourceRepo.path);
    await assertNoSymlink(repoPath, input.path);
    const [resolvedRepo, resolvedFile] = await Promise.all([realpath(repoPath), realpath(join(repoPath, input.path))]);
    if (resolvedFile !== resolvedRepo && !resolvedFile.startsWith(`${resolvedRepo}${sep}`)) {
      throw new Error(`private input escaped its repository: ${input.role}`);
    }
    const bytes = await readFile(resolvedFile);
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== input.sha256) throw new Error(`private input hash mismatch: ${input.role}`);
  }
  return (workOrder.privateInputs ?? []).map((input) => ({
    repo: input.repo,
    path: input.path,
    sha256: input.sha256,
    role: input.role,
    declaredByRole: input.declaredByRole,
    status: "verified",
  }));
}

function receiptFileName(idempotencyKey) {
  return `${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}.json`;
}

function legacyTargetLockFileName(plan, workOrder) {
  const target = workOrder.bookId ?? "project";
  const safe = `${plan.repo.name}--${target}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${safe}.lock`;
}

export function targetLockFileName(plan, workOrder) {
  const target = workOrder.bookId ?? "project";
  const identity = { repo: plan.repo.name, target };
  const safe = `${identity.repo}--${identity.target}`
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 96);
  const suffix = createHash("sha256").update(stableStringify(identity)).digest("hex");
  return `${safe}--${suffix}.lock`;
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readExistingReceipt(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function reclaimDeadAgentOperateLock({ lockPath, lockKind, receiptPath, workOrder, workOrderSha256, receiptName }) {
  if (workOrder.schemaVersion !== 2 || workOrder.capability !== "agent-operate") return false;
  let metadata;
  try {
    metadata = await readExistingReceipt(lockPath);
  } catch {
    return false;
  }
  if (metadata?.schemaVersion !== "firefly-dispatch-lock/v1"
    || metadata.lockKind !== lockKind
    || !Number.isInteger(metadata.pid)
    || processIsAlive(metadata.pid)) {
    return false;
  }

  if (lockKind === "idempotency") {
    if (metadata.workOrderId !== workOrder.workOrderId
      || metadata.workOrderSha256 !== workOrderSha256
      || metadata.receiptName !== receiptName) return false;
    const receipt = await readExistingReceipt(receiptPath).catch(() => null);
    if (receipt && (
      receipt.schemaVersion !== 2
      || receipt.workOrderId !== workOrder.workOrderId
      || receipt.workOrderSha256 !== workOrderSha256
      || receipt.idempotencyKey !== workOrder.idempotencyKey
      || !["running", "succeeded", "failed", "needs-attention"].includes(receipt.status)
      || !validateRunReceiptSelfHash(receipt)
    )) return false;
  } else {
    if (metadata.repo !== workOrder.repo
      || metadata.bookId !== workOrder.bookId
      || typeof metadata.receiptName !== "string"
      || typeof metadata.receiptId !== "string") return false;
    const referencedReceiptPath = join(dirname(receiptPath), metadata.receiptName);
    const receipt = await readExistingReceipt(referencedReceiptPath).catch(() => null);
    if (!receipt
      || receipt.schemaVersion !== 2
      || receipt.workOrderId !== metadata.workOrderId
      || receipt.workOrderSha256 !== metadata.workOrderSha256
      || receipt.receiptId !== metadata.receiptId
      || !validateRunReceiptSelfHash(receipt)) return false;
    if (receipt.status === "running") {
      if (metadata.workOrderId !== workOrder.workOrderId
        || metadata.workOrderSha256 !== workOrderSha256
        || metadata.receiptName !== receiptName) return false;
    } else if (!["succeeded", "failed", "needs-attention"].includes(receipt.status)) {
      return false;
    }
  }
  await rm(lockPath, { force: true });
  return true;
}

async function reconcileLegacyTargetLock({ locksDir, plan, receiptPath, workOrder, workOrderSha256, receiptName }) {
  const lockPath = join(locksDir, legacyTargetLockFileName(plan, workOrder));
  let metadata;
  try {
    metadata = await readExistingReceipt(lockPath);
  } catch {
    return { lockPath, blocksCurrentTarget: true, reclaimed: false };
  }
  if (metadata === null) return { lockPath, blocksCurrentTarget: false, reclaimed: false };

  // The legacy filename replaced every non-ASCII run with "-", so two
  // different Books can legitimately point at the same path. A structurally
  // identified lock for another target must remain owned by that target, but
  // must not serialize this collision-resistant target.
  if (
    metadata?.schemaVersion === "firefly-dispatch-lock/v1"
    && metadata.lockKind === "target"
    && typeof metadata.repo === "string"
    && typeof metadata.bookId === "string"
    && legacyTargetLockFileName(
      { repo: { name: metadata.repo } },
      { bookId: metadata.bookId },
    ) === legacyTargetLockFileName(plan, workOrder)
    && (metadata.repo !== workOrder.repo || metadata.bookId !== workOrder.bookId)
  ) return { lockPath, blocksCurrentTarget: false, reclaimed: false };

  const reclaimed = await reclaimDeadAgentOperateLock({
    lockPath,
    lockKind: "target",
    receiptPath,
    workOrder,
    workOrderSha256,
    receiptName,
  });
  return { lockPath, blocksCurrentTarget: !reclaimed, reclaimed };
}

function processBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(value ?? "", "utf8");
}

function relativeFileEvidence(root, path, bytes) {
  return {
    path: relative(root, path),
    sha256: sha256Bytes(bytes),
    byteLength: bytes.byteLength,
  };
}

async function runHermesControlInvocation({
  root,
  manifest,
  workOrder,
  plan,
  runArtifactsDir,
  hermesRequestDir,
  hermesExecutable,
  hermesSpawn,
  sessionExportSpawn,
  authoritySpawn,
  hermesOptions,
}) {
  const profile = await verifyAgentOperateAuthority({
    root,
    manifest,
    workOrder,
    authority: plan.hermesAuthority,
    spawn: authoritySpawn,
    hermesOptions: { ...hermesOptions, hermesExecutable },
  });
  const workOrderBytes = plan.invocation.workOrderBytes;
  const workOrderSha256 = plan.invocation.workOrderSha256;
  const promptBytes = Buffer.from(buildHermesControlPrompt(workOrderBytes, workOrderSha256), "utf8");
  await mkdir(runArtifactsDir, { recursive: true });
  await mkdir(hermesRequestDir, { recursive: true });
  const operationPromptPath = join(hermesRequestDir, "AGENTS.md");
  const preparedPath = join(runArtifactsDir, "prepared.json");
  const stdoutPath = join(runArtifactsDir, "stdout.txt");
  const stderrPath = join(runArtifactsDir, "stderr.txt");
  const actionPath = join(runArtifactsDir, "action.json");
  const sessionExportPath = join(runArtifactsDir, "session.jsonl");
  const sessionExportStderrPath = join(runArtifactsDir, "session-export.stderr.txt");
  const hermesReceiptPath = join(runArtifactsDir, "hermes-receipt.json");
  const artifactPaths = {
    operationContract: operationPromptPath,
    prepared: preparedPath,
    stdout: stdoutPath,
    stderr: stderrPath,
    action: actionPath,
    sessionExport: sessionExportPath,
    sessionExportStderr: sessionExportStderrPath,
    receipt: hermesReceiptPath,
  };
  const existingBytes = {};
  for (const [role, path] of Object.entries(artifactPaths)) {
    try {
      existingBytes[role] = await readFile(path);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (Object.keys(existingBytes).length > 0) {
    const existingEvidence = Object.fromEntries(Object.entries(existingBytes).map(([role, bytes]) => [
      role,
      relativeFileEvidence(root, artifactPaths[role], bytes),
    ]));
    try {
      const requiredRoles = Object.keys(artifactPaths);
      if (requiredRoles.some((role) => !Buffer.isBuffer(existingBytes[role]))) {
        throw new Error("existing Hermes invocation artifacts are partial");
      }
      if (!existingBytes.operationContract.equals(promptBytes)) {
        throw new Error("existing Hermes operation contract does not match the WorkOrder");
      }
      const prepared = JSON.parse(existingBytes.prepared.toString("utf8"));
      if (prepared.schemaVersion !== "hermes-control-prepared/v1"
        || prepared.status !== "prepared"
        || prepared.workOrderId !== workOrder.workOrderId
        || prepared.workOrderSha256 !== workOrderSha256
        || prepared.profile?.profileId !== profile.profileId
        || prepared.profile?.configSha256 !== profile.configSha256
        || prepared.profile?.soulSha256 !== profile.soulSha256
        || prepared.promptSha256 !== sha256Bytes(promptBytes)
        || prepared.promptByteLength !== promptBytes.byteLength) {
        throw new Error("existing Hermes prepared marker does not match the WorkOrder or profile");
      }
      const sessionId = parseHermesSessionId(existingBytes.stderr.toString("utf8"));
      const { session, parsedAction, reasoningText } = parseHermesControlSessionExport(existingBytes.sessionExport, {
        sessionId,
        profileId: profile.profileId,
        queryText: HERMES_CONTROL_QUERY,
        operationPromptText: promptBytes.toString("utf8"),
        promptSha256: sha256Bytes(promptBytes),
        processExitCode: 0,
        workOrder,
        workOrderSha256,
      });
      validateHermesRenderedControlStdout(existingBytes.stdout.toString("utf8"), {
        actionText: parsedAction.proposalBytes.toString("utf8"),
        reasoningText,
      });
      if (!existingBytes.action.equals(parsedAction.actionBytes)) {
        throw new Error("existing Hermes canonical action does not match the authoritative session action");
      }
      const receipt = validateHermesInvocationReceipt(existingBytes.receipt, {
        workOrder,
        workOrderSha256,
        profile,
        promptBytes,
        systemPromptBytes: Buffer.from(session.system_prompt, "utf8"),
        rawOutputBytes: existingBytes.stdout,
        actionBytes: parsedAction.actionBytes,
        action: parsedAction.action,
        sessionId,
        sessionExportBytes: existingBytes.sessionExport,
      });
      const envelope = buildAgentOperationEnvelope({
        workOrderBytes,
        workOrderSha256,
        actionBytes: parsedAction.actionBytes,
        action: parsedAction.action,
        receiptBytes: existingBytes.receipt,
        ...(plan.canaryIsolation ? {
          canaryIsolationReceipt: {
            bytes: plan.canaryIsolation.receiptBytes,
            sha256: plan.canaryIsolation.projection.receipt.sha256,
            byteLength: plan.canaryIsolation.projection.receipt.byteLength,
            selfHash: plan.canaryIsolation.projection.receipt.selfHash,
          },
        } : {}),
      });
      return {
        stdin: canonicalStringify(envelope),
        receipt,
        evidence: existingEvidence,
        resumed: true,
      };
    } catch (cause) {
      const error = new Error(cause instanceof Error ? cause.message : String(cause));
      error.hermesAttempted = true;
      error.hermesEvidence = existingEvidence;
      throw error;
    }
  }
  let operationPromptHandle;
  try {
    operationPromptHandle = await open(operationPromptPath, "wx");
    await operationPromptHandle.writeFile(promptBytes);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Hermes operation contract already exists; automatic overwrite is forbidden");
    throw error;
  } finally {
    await operationPromptHandle?.close();
  }
  const prepared = {
    schemaVersion: "hermes-control-prepared/v1",
    status: "prepared",
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
    executionMode: workOrder.executionMode,
    modeEvidenceSha256: sha256Json(workOrder.modeEvidence),
    profile: {
      profileId: profile.profileId,
      soulId: profile.soulId,
      soulVersion: profile.soulVersion,
      configSha256: profile.configSha256,
      soulSha256: profile.soulSha256,
    },
    runtime: {
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      reasoning: "high",
      platform: "cli",
      openaiRuntime: "auto",
      toolsCount: 0,
      transportPolicy: HERMES_CONTROL_TRANSPORT_POLICY,
    },
    promptSha256: sha256Bytes(promptBytes),
    promptByteLength: promptBytes.byteLength,
    operationContract: relativeFileEvidence(root, operationPromptPath, promptBytes),
    preparedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(preparedPath, prepared);

  const sanitizedEnv = { ...process.env };
  for (const key of Object.keys(sanitizedEnv)) {
    if (/^HERMES_(?:API|CODEX|STREAM)_/u.test(key)) delete sanitizedEnv[key];
  }
  for (const key of [
    "HERMES_INFERENCE_MODEL", "HERMES_MODEL", "HERMES_PROVIDER", "HERMES_TOOLSETS",
    "HERMES_KANBAN_GOAL_MODE", "HERMES_KANBAN_TASK",
  ]) delete sanitizedEnv[key];
  // These are host-owned transport watchdogs for the pinned sol/high control
  // call. Short Hermes defaults can terminate a healthy reasoning turn before
  // it emits the single proposal; inbound values must not weaken or tighten
  // the audited execution policy.
  sanitizedEnv.HERMES_CODEX_EVENT_STALE_TIMEOUT_SECONDS = String(HERMES_CONTROL_TRANSPORT_POLICY.codexEventStaleTimeoutSeconds);
  sanitizedEnv.HERMES_CODEX_TTFB_TIMEOUT_SECONDS = String(HERMES_CONTROL_TRANSPORT_POLICY.codexTtfbTimeoutSeconds);
  sanitizedEnv.HERMES_API_CALL_STALE_TIMEOUT = String(HERMES_CONTROL_TRANSPORT_POLICY.apiCallStaleTimeoutSeconds);
  const startedAt = new Date().toISOString();
  const invocation = hermesSpawn(hermesExecutable, [
    "-p", profile.profileId,
    "chat",
    "-q", HERMES_CONTROL_QUERY,
    "-Q",
    "--model", "gpt-5.6-sol",
    "--provider", "openai-codex",
    "--max-turns", "1",
    "--source", "tool",
  ], {
    cwd: hermesRequestDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: sanitizedEnv,
    maxBuffer: 16 * 1024 * 1024,
    timeout: HERMES_CONTROL_TRANSPORT_POLICY.invocationTimeoutMs,
  });
  const stdoutBytes = processBytes(invocation.stdout);
  const stderrBytes = processBytes(invocation.stderr);
  await writeFile(stdoutPath, stdoutBytes);
  await writeFile(stderrPath, stderrBytes);
  const baseEvidence = {
    operationContract: relativeFileEvidence(root, operationPromptPath, promptBytes),
    prepared: relativeFileEvidence(root, preparedPath, Buffer.from(`${JSON.stringify(prepared, null, 2)}\n`, "utf8")),
    stdout: relativeFileEvidence(root, stdoutPath, stdoutBytes),
    stderr: relativeFileEvidence(root, stderrPath, stderrBytes),
  };
  if (invocation.error || invocation.status !== 0 || invocation.signal) {
    const error = new Error("Hermes provider invocation did not complete unambiguously");
    error.hermesAttempted = true;
    error.hermesEvidence = baseEvidence;
    throw error;
  }

  try {
    const sessionId = parseHermesSessionId(stderrBytes.toString("utf8"));
    const exportResult = sessionExportSpawn(hermesExecutable, [
      "-p", profile.profileId,
      "sessions", "export", "-",
      "--format", "jsonl",
      "--session-id", sessionId,
      "--yes",
    ], {
      cwd: hermesRequestDir,
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"],
      env: sanitizedEnv,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
    });
    const sessionExportBytes = processBytes(exportResult.stdout);
    const sessionExportStderrBytes = processBytes(exportResult.stderr);
    await writeFile(sessionExportPath, sessionExportBytes);
    await writeFile(sessionExportStderrPath, sessionExportStderrBytes);
    if (exportResult.error || exportResult.status !== 0 || exportResult.signal) {
      throw new Error("Hermes session export failed");
    }
    const { session, parsedAction, reasoningText } = parseHermesControlSessionExport(sessionExportBytes, {
      sessionId,
      profileId: profile.profileId,
      queryText: HERMES_CONTROL_QUERY,
      operationPromptText: promptBytes.toString("utf8"),
      promptSha256: sha256Bytes(promptBytes),
      processExitCode: invocation.status,
      workOrder,
      workOrderSha256,
    });
    validateHermesRenderedControlStdout(stdoutBytes.toString("utf8"), {
      actionText: parsedAction.proposalBytes.toString("utf8"),
      reasoningText,
    });
    await writeFile(actionPath, parsedAction.actionBytes);
    const completedAt = new Date().toISOString();
    const hermesReceipt = buildHermesInvocationReceipt({
      workOrder,
      workOrderSha256,
      profile,
      promptBytes,
      systemPromptBytes: Buffer.from(session.system_prompt, "utf8"),
      rawOutputBytes: stdoutBytes,
      actionBytes: parsedAction.actionBytes,
      action: parsedAction.action,
      sessionId,
      startedAt,
      completedAt,
      sessionExportBytes,
    });
    const receiptBytes = Buffer.from(canonicalStringify(hermesReceipt), "utf8");
    await writeFile(hermesReceiptPath, receiptBytes);
    const envelope = buildAgentOperationEnvelope({
      workOrderBytes,
      workOrderSha256,
      actionBytes: parsedAction.actionBytes,
      action: parsedAction.action,
      receiptBytes,
      ...(plan.canaryIsolation ? {
        canaryIsolationReceipt: {
          bytes: plan.canaryIsolation.receiptBytes,
          sha256: plan.canaryIsolation.projection.receipt.sha256,
          byteLength: plan.canaryIsolation.projection.receipt.byteLength,
          selfHash: plan.canaryIsolation.projection.receipt.selfHash,
        },
      } : {}),
    });
    return {
      stdin: canonicalStringify(envelope),
      receipt: hermesReceipt,
      evidence: {
        ...baseEvidence,
        action: relativeFileEvidence(root, actionPath, parsedAction.actionBytes),
        sessionExport: relativeFileEvidence(root, sessionExportPath, sessionExportBytes),
        sessionExportStderr: relativeFileEvidence(root, sessionExportStderrPath, sessionExportStderrBytes),
        receipt: relativeFileEvidence(root, hermesReceiptPath, receiptBytes),
      },
    };
  } catch (cause) {
    const error = new Error(cause instanceof Error ? cause.message : String(cause));
    error.hermesAttempted = true;
    error.hermesEvidence = baseEvidence;
    throw error;
  }
}

function sameTrackedState(before, after) {
  return before.head === after.head
    && before.branch === after.branch
    && JSON.stringify(before.changes) === JSON.stringify(after.changes);
}

function normalizedRelativePath(value) {
  return normalize(value).split(sep).join("/").replace(/^\.\//, "");
}

function receiptExecutionRootPath(root, plan) {
  if (plan.canaryIsolation) {
    return normalizedRelativePath(join(
      relative(root, plan.codeRepoPath),
      plan.canaryIsolation.projection.projectRoot,
    ));
  }
  return normalizedRelativePath(relative(root, plan.executionRoot ?? plan.repoPath));
}

async function snapshotObservationScopes(plan) {
  const snapshot = new Map();
  async function visit(absolutePath, relativePath) {
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`observation scope contains a symlink: ${relativePath}`);
    }
    if (metadata.isDirectory()) {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        await visit(join(absolutePath, entry.name), join(relativePath, entry.name));
      }
      return;
    }
    if (!metadata.isFile()) return;
    const bytes = await readFile(absolutePath);
    snapshot.set(normalizedRelativePath(relativePath), createHash("sha256").update(bytes).digest("hex"));
  }
  for (const scope of plan.repo.execution.observationScopes ?? []) {
    await visit(join(plan.executionRoot ?? plan.repoPath, scope), scope);
  }
  return snapshot;
}

function diffObservationSnapshots(before, after) {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  return paths.flatMap((path) => {
    const beforeSha256 = before.get(path) ?? null;
    const afterSha256 = after.get(path) ?? null;
    if (beforeSha256 === afterSha256) return [];
    return [{
      path,
      change: beforeSha256 === null ? "created" : afterSha256 === null ? "deleted" : "modified",
      beforeSha256,
      afterSha256,
    }];
  });
}

function parseChildJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return { value: null, error: "child returned empty stdout" };
  try {
    return { value: JSON.parse(trimmed), error: null };
  } catch {
    return { value: null, error: "child stdout was not valid JSON" };
  }
}

function validateProductionV2Child(value, workOrder, expectedWorkOrderSha256, hermesReceipt = null, canaryIsolation = null) {
  const errors = [];
  const agentOperate = workOrder.capability === "agent-operate";
  if (!isPlainObject(value)) return { errors: ["child production result must be an object"], productionRun: null, effectiveRuntime: null, modelCalls: [], agentOperation: null };
  const allowed = new Set(["schemaVersion", "workOrder", ...(agentOperate ? ["agentOperation"] : []), "productionRun", "effectiveRuntime", "modelCalls", "artifacts"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`unknown child production result field: ${key}`);
  const expectedSchema = agentOperate ? "inkos-agent-operation-result/v1" : "inkos-production-result/v2";
  if (value.schemaVersion !== expectedSchema) errors.push("child production result schemaVersion is invalid");
  if (!isPlainObject(value.workOrder) || Object.keys(value.workOrder).some((key) => !["id", "sha256"].includes(key)) || value.workOrder.id !== workOrder.workOrderId || value.workOrder.sha256 !== expectedWorkOrderSha256) {
    errors.push("child production result WorkOrder binding mismatch");
  }
  const agentOperation = value.agentOperation;
  if (agentOperate) {
    const operationKeys = new Set(["status", "executionMode", "receipt", "importReceipt", "action", "hermesReceipt", "canaryIsolation", "finalLaneManifestSha256"]);
    if (!isPlainObject(agentOperation)) errors.push("agentOperation is required");
    else {
      for (const key of Object.keys(agentOperation)) if (!operationKeys.has(key)) errors.push(`unknown agentOperation field: ${key}`);
      for (const key of operationKeys) if (!(key in agentOperation)) errors.push(`agentOperation.${key} is required`);
      if (!["succeeded", "failed", "cancelled"].includes(agentOperation.status)) errors.push("agentOperation.status is invalid");
      if (agentOperation.executionMode !== workOrder.executionMode) errors.push("agentOperation.executionMode mismatch");
      if (!("canaryIsolation" in agentOperation)
        || sha256Json(agentOperation.canaryIsolation) !== sha256Json(canaryIsolation)) {
        errors.push("agentOperation canary isolation projection mismatch");
      }
      if (canaryIsolation) {
        if (!SHA256.test(agentOperation.finalLaneManifestSha256 ?? "")) errors.push("agentOperation final lane manifest hash is invalid");
      } else if (agentOperation.finalLaneManifestSha256 !== null) {
        errors.push("production agentOperation finalLaneManifestSha256 must be null");
      }
      for (const key of ["receipt", "importReceipt", "hermesReceipt"]) {
        const ref = agentOperation[key];
        if (!isPlainObject(ref) || Object.keys(ref).some((field) => !["path", "sha256"].includes(field))) errors.push(`agentOperation.${key} is invalid`);
        else {
          validateRelativePath(ref.path, `agentOperation.${key}.path`, errors);
          if (!SHA256.test(ref.sha256 ?? "")) errors.push(`agentOperation.${key}.sha256 is invalid`);
        }
      }
      const action = agentOperation.action;
      if (!isPlainObject(action) || Object.keys(action).some((field) => !["path", "sha256", "textSha256"].includes(field))) errors.push("agentOperation.action is invalid");
      else {
        validateRelativePath(action.path, "agentOperation.action.path", errors);
        if (!SHA256.test(action.sha256 ?? "") || !SHA256.test(action.textSha256 ?? "")) errors.push("agentOperation.action hashes are invalid");
      }
      if (hermesReceipt && (
        agentOperation.action?.sha256 !== hermesReceipt.action.sha256
        || agentOperation.action?.textSha256 !== hermesReceipt.action.textSha256
        || agentOperation.hermesReceipt?.sha256 !== hermesReceipt.__bytesSha256
      )) errors.push("agentOperation Hermes import does not match the HQ execution envelope");
    }
  }
  const run = value.productionRun;
  if (!isPlainObject(run)) errors.push("child production result is missing productionRun");
  else {
    const runAllowed = new Set(["commandId", "productionOperationId", "attemptId", "path", "sha256", "executionStatus", "approvalStatus", "completionHealth", "projectionOrigin"]);
    for (const key of Object.keys(run)) if (!runAllowed.has(key)) errors.push(`unknown productionRun field: ${key}`);
    for (const key of runAllowed) if (!(key in run)) errors.push(`productionRun.${key} is required`);
    if (!hasText(run.commandId) || !hasText(run.productionOperationId) || !hasText(run.attemptId)) errors.push("productionRun identities are required");
    validateRelativePath(run.path, "productionRun.path", errors);
    if (!SHA256.test(run.sha256 ?? "")) errors.push("productionRun.sha256 is invalid");
    if (!["succeeded", "failed", "cancelled"].includes(run.executionStatus)) errors.push("productionRun.executionStatus is invalid");
    if (!["not-required", "pending", "held", "approved", "rejected"].includes(run.approvalStatus)) errors.push("productionRun.approvalStatus is invalid");
    if (!["verified", "needs-recovery"].includes(run.completionHealth)) errors.push("productionRun.completionHealth is invalid");
    if (!["direct", "reconciled"].includes(run.projectionOrigin)) errors.push("productionRun.projectionOrigin is invalid");
  }
  if (!isPlainObject(value.effectiveRuntime) || !isPlainObject(value.effectiveRuntime.orchestrator) || !isPlainObject(value.effectiveRuntime.inkos)) {
    errors.push("effectiveRuntime readback is required");
  } else {
    const allowedEffectiveRuntimeKeys = new Set(["hermesE2E", "orchestrator", "inkos"]);
    for (const key of Object.keys(value.effectiveRuntime)) if (!allowedEffectiveRuntimeKeys.has(key)) errors.push(`unknown effectiveRuntime field: ${key}`);
    if (value.effectiveRuntime.hermesE2E !== agentOperate) errors.push(`${workOrder.capability} hermesE2E readback is invalid`);
    const orchestrator = value.effectiveRuntime.orchestrator;
    const allowedOrchestratorKeys = new Set(["hermesProfile", "model", "reasoning", "invoked", "evidence", ...(agentOperate ? ["sessionId", "toolsCount", "toolCallCount"] : [])]);
    for (const key of Object.keys(orchestrator)) if (!allowedOrchestratorKeys.has(key)) errors.push(`unknown orchestrator runtime field: ${key}`);
    if (orchestrator.hermesProfile !== workOrder.runtime.hermesProfile || orchestrator.model !== workOrder.runtime.model || orchestrator.reasoning !== workOrder.runtime.reasoning) {
      errors.push("orchestrator runtime declaration does not match WorkOrder v2");
    }
    if (!agentOperate && (orchestrator.invoked !== false || orchestrator.evidence !== "work-order-declaration")) {
      errors.push("write-next must report that Hermes was not invoked");
    }
    if (agentOperate && (
      orchestrator.invoked !== true
      || orchestrator.evidence !== "verified-hermes-invocation-receipt"
      || orchestrator.sessionId !== hermesReceipt?.invocation?.sessionId
      || orchestrator.toolsCount !== 0
      || orchestrator.toolCallCount !== 0
    )) errors.push("agent-operate orchestrator runtime does not match the verified Hermes invocation");
    const allowedInkosRuntimeKeys = new Set(["configMode", "model", "reasoning"]);
    for (const key of Object.keys(value.effectiveRuntime.inkos)) if (!allowedInkosRuntimeKeys.has(key)) errors.push(`unknown InkOS runtime field: ${key}`);
    if (!hasText(value.effectiveRuntime.inkos.model) || !hasText(value.effectiveRuntime.inkos.reasoning) || !hasText(value.effectiveRuntime.inkos.configMode)) errors.push("InkOS effective model/reasoning readback is incomplete");
    if (agentOperate && (value.effectiveRuntime.inkos.model !== "gpt-5.6-sol" || value.effectiveRuntime.inkos.reasoning !== "high")) {
      errors.push("agent-operate InkOS runtime must be gpt-5.6-sol/high");
    }
  }
  if (!Array.isArray(value.modelCalls)) errors.push("modelCalls must be an array");
  else {
    const invocationIds = new Set();
    for (const [index, call] of value.modelCalls.entries()) {
    if (!isPlainObject(call)) {
      errors.push(`modelCalls[${index}] must be an object`);
      continue;
    }
    const allowedCallKeys = new Set(["invocationId", "agentName", "stage", "model", "reasoningEffort", "status", "receiptPath", "receiptSha256", "outcomePath", "outcomeSha256"]);
    for (const key of Object.keys(call)) if (!allowedCallKeys.has(key)) errors.push(`unknown modelCalls[${index}] field: ${key}`);
    for (const key of allowedCallKeys) if (!(key in call)) errors.push(`modelCalls[${index}].${key} is required`);
    if (!hasText(call.agentName) || !hasText(call.stage) || !hasText(call.model) || !hasText(call.invocationId)) errors.push(`modelCalls[${index}] is incomplete`);
    if (call?.reasoningEffort !== null && !hasText(call?.reasoningEffort)) errors.push(`modelCalls[${index}].reasoningEffort is invalid`);
    if (!["completed", "provider-refused", "failed"].includes(call.status)) errors.push(`modelCalls[${index}].status is invalid`);
    if (invocationIds.has(call.invocationId)) errors.push(`modelCalls[${index}].invocationId is duplicated`);
    invocationIds.add(call.invocationId);
    if (agentOperate && (call.model !== "gpt-5.6-sol" || call.reasoningEffort !== "high" || call.status !== "completed")) {
      errors.push(`agent-operate modelCalls[${index}] must be completed gpt-5.6-sol/high`);
    }
    validateRelativePath(call.receiptPath, `modelCalls[${index}].receiptPath`, errors);
    validateRelativePath(call.outcomePath, `modelCalls[${index}].outcomePath`, errors);
    if (!SHA256.test(call?.receiptSha256 ?? "") || !SHA256.test(call?.outcomeSha256 ?? "")) errors.push(`modelCalls[${index}] evidence hash is invalid`);
    }
    if (agentOperate && !value.modelCalls.some((call) => call?.agentName?.toLowerCase() === "writer")) {
      errors.push("agent-operate requires at least one Writer model call");
    }
  }
  if (agentOperate && isPlainObject(agentOperation) && isPlainObject(run) && agentOperation.status !== run.executionStatus) {
    errors.push("agentOperation.status must match productionRun.executionStatus");
  }
  return {
    errors,
    productionRun: isPlainObject(run) ? run : null,
    effectiveRuntime: isPlainObject(value.effectiveRuntime) ? value.effectiveRuntime : null,
    modelCalls: Array.isArray(value.modelCalls) ? value.modelCalls : [],
    agentOperation: isPlainObject(agentOperation) ? agentOperation : null,
  };
}

async function readVerifiedProductionEvidence(repoPath, relativePath, expectedSha256, label, errors) {
  const pathErrors = [];
  validateRelativePath(relativePath, label, pathErrors);
  if (pathErrors.length > 0) {
    errors.push(...pathErrors);
    return null;
  }
  try {
    await assertNoSymlink(repoPath, relativePath);
    const absolutePath = join(repoPath, relativePath);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      errors.push(`${label} is not a regular non-symlink file`);
      return null;
    }
    const bytes = await readFile(absolutePath);
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== expectedSha256) {
      errors.push(`${label} hash mismatch`);
      return null;
    }
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      errors.push(`${label} is not valid JSON`);
      return null;
    }
  } catch {
    errors.push(`${label} is unavailable`);
    return null;
  }
}

async function verifyProductionV2Evidence(repoPath, workOrder, productionV2, artifacts, verificationContext = {}) {
  const errors = [];
  const run = productionV2?.productionRun;
  if (!run) return ["child production result is missing productionRun evidence"];
  const bookPrefix = `books/${workOrder.bookId}/`;
  if (!normalizedRelativePath(run.path).startsWith(bookPrefix)) {
    errors.push("productionRun.path must stay inside the target Book");
  }
  const runArtifacts = artifacts.filter((artifact) => artifact.role === "production-run");
  if (runArtifacts.length !== 1) {
    errors.push("child production result must report exactly one production-run artifact");
  } else if (runArtifacts[0].path !== run.path || runArtifacts[0].sha256 !== run.sha256) {
    errors.push("productionRun path/hash does not match its verified artifact report");
  }
  const runJson = await readVerifiedProductionEvidence(repoPath, run.path, run.sha256, "productionRun", errors);
  if (runJson) {
    if (runJson.schemaVersion !== "production-run/v1") errors.push("productionRun file schemaVersion is invalid");
    if (runJson.executionStatus !== "succeeded"
      || runJson.completionHealth !== "verified"
      || runJson.projectionHealth !== "verified"
      || runJson.evidence?.kind !== "verified-commit"
      || runJson.evidence?.commitState !== "verified") {
      errors.push("productionRun file is not a fully verified success");
    }
    if (!SHA256.test(runJson.runSelfHash ?? "")
      || hashInkosCanonicalJson(Object.fromEntries(Object.entries(runJson).filter(([key]) => key !== "runSelfHash"))) !== runJson.runSelfHash) {
      errors.push("productionRun file self hash mismatch");
    }
    if (runJson.command?.commandId !== run.commandId) errors.push("productionRun file commandId mismatch");
    if (runJson.productionAttempt?.productionOperationId !== run.productionOperationId || runJson.productionAttempt?.attemptId !== run.attemptId) {
      errors.push("productionRun file attempt identity mismatch");
    }
    for (const key of ["executionStatus", "approvalStatus", "completionHealth", "projectionOrigin"]) {
      if (runJson[key] !== run[key]) errors.push(`productionRun file ${key} mismatch`);
    }
  }

  if (workOrder.capability === "agent-operate") {
    const operation = productionV2.agentOperation;
    if (!operation) {
      errors.push("child agent-operate result is missing agentOperation evidence");
    } else {
      const refs = [
        ["agent-operation-receipt", operation.receipt, "agentOperation receipt"],
        ["hermes-control-action", operation.action, "agentOperation action"],
        ["hermes-invocation-receipt", operation.hermesReceipt, "agentOperation Hermes receipt"],
      ];
      for (const [role, ref, label] of refs) {
        if (!ref) continue;
        if (!normalizedRelativePath(ref.path).startsWith(bookPrefix)) errors.push(`${label} must stay inside the target Book`);
        const matching = artifacts.filter((artifact) => artifact.role === role);
        if (matching.length !== 1 || matching[0].path !== ref.path || matching[0].sha256 !== ref.sha256) {
          errors.push(`${label} does not match its verified artifact report`);
        }
        await readVerifiedProductionEvidence(repoPath, ref.path, ref.sha256, label, errors);
      }
      if (!normalizedRelativePath(operation.importReceipt?.path ?? "").startsWith(bookPrefix)) {
        errors.push("agentOperation import receipt must stay inside the target Book");
      } else if (operation.importReceipt) {
        await readVerifiedProductionEvidence(repoPath, operation.importReceipt.path, operation.importReceipt.sha256, "agentOperation import receipt", errors);
      }
      const strict = await verifyInkosAgentOperationTerminal({
        repoPath,
        workOrder,
        workOrderSha256: verificationContext.workOrderSha256,
        manifestCapabilitySha256: verificationContext.manifestCapabilitySha256,
        agentOperation: operation,
        productionRun: run,
        artifacts,
        hermesReceiptSha256: verificationContext.hermesControl?.evidence?.receipt?.sha256,
        hermesActionSha256: verificationContext.hermesControl?.evidence?.action?.sha256,
        hermesActionTextSha256: operation.action?.textSha256,
        hermesInvocationSessionId: verificationContext.hermesControl?.receipt?.invocation?.sessionId,
        canaryIsolation: verificationContext.canaryIsolation ?? null,
      });
      errors.push(...strict.errors);
      if (strict.errors.length === 0
        && strict.terminal?.status === "succeeded"
        && strict.chapterCommit?.commitState === "verified") {
        productionV2.verifiedAgentOperation = {
          status: operation.status,
          executionMode: operation.executionMode,
          canaryIsolation: operation.canaryIsolation,
          finalLaneManifestSha256: operation.finalLaneManifestSha256,
          receipt: operation.receipt,
          importReceipt: operation.importReceipt,
          action: operation.action,
          hermesReceipt: operation.hermesReceipt,
          terminal: strict.terminal,
          chapterCommit: strict.chapterCommit,
        };
      }
    }
  }

  const invocationIds = new Set();
  for (const [index, call] of productionV2.modelCalls.entries()) {
    if (!isPlainObject(call)) continue;
    if (invocationIds.has(call.invocationId)) errors.push(`modelCalls[${index}] invocationId is duplicated`);
    invocationIds.add(call.invocationId);
    if (!normalizedRelativePath(call.receiptPath).startsWith(bookPrefix) || !normalizedRelativePath(call.outcomePath).startsWith(bookPrefix)) {
      errors.push(`modelCalls[${index}] evidence must stay inside the target Book`);
    }
    const receipt = await readVerifiedProductionEvidence(repoPath, call.receiptPath, call.receiptSha256, `modelCalls[${index}] receipt`, errors);
    const outcome = await readVerifiedProductionEvidence(repoPath, call.outcomePath, call.outcomeSha256, `modelCalls[${index}] outcome`, errors);
    if (receipt) {
      if (receipt.invocationId !== call.invocationId || receipt.agentName !== call.agentName || receipt.stage !== call.stage || receipt.model !== call.model || (receipt.reasoningEffort ?? null) !== call.reasoningEffort) {
        errors.push(`modelCalls[${index}] receipt readback mismatch`);
      }
      if (receipt.productionOperationId !== run.productionOperationId || receipt.attemptId !== run.attemptId) {
        errors.push(`modelCalls[${index}] receipt attempt identity mismatch`);
      }
    }
    if (outcome) {
      if (outcome.invocationId !== call.invocationId || outcome.status !== call.status) errors.push(`modelCalls[${index}] outcome readback mismatch`);
      if (outcome.productionOperationId !== run.productionOperationId || outcome.attemptId !== run.attemptId) {
        errors.push(`modelCalls[${index}] outcome attempt identity mismatch`);
      }
    }
  }
  return errors;
}

export function validateChildArtifacts(value, repoName) {
  if (value === undefined) return { artifacts: [], errors: [] };
  if (!Array.isArray(value)) return { artifacts: [], errors: ["child artifacts must be an array"] };
  const artifacts = [];
  const errors = [];
  for (const [index, artifact] of value.entries()) {
    const label = `child artifacts[${index}]`;
    if (!isPlainObject(artifact)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const pathErrors = [];
    validateRelativePath(artifact.path, `${label}.path`, pathErrors);
    if (artifact.repo !== repoName) pathErrors.push(`${label}.repo must match ${repoName}`);
    if (!SHA256.test(artifact.sha256 ?? "")) pathErrors.push(`${label}.sha256 must be a SHA-256 digest`);
    if (!hasText(artifact.role)) pathErrors.push(`${label}.role is required`);
    if (pathErrors.length > 0) {
      errors.push(...pathErrors);
      continue;
    }
    artifacts.push({
      repo: artifact.repo,
      path: artifact.path,
      sha256: artifact.sha256,
      role: artifact.role,
    });
  }
  return { artifacts, errors };
}

export function validateCapabilityArtifacts(capability, report, workOrder = null) {
  if (!["reference-bind", "pitch-slate", "pitch-review", "pitch-decision", "pitch-promote", "agent-operate"].includes(capability)) return report;
  const requiredRoles = capability === "agent-operate"
    ? ["hermes-control-action", "hermes-invocation-receipt", "agent-operation-receipt", "production-run"]
    : capability === "reference-bind"
    ? ["book-config", "reference-binding", "reference-transformation", "story-rail-plan"]
    : capability === "pitch-slate"
      ? ["pitch-slate-data", "pitch-slate-review"]
      : capability === "pitch-review"
        ? ["pitch-survival-review-data", "pitch-survival-review-readable"]
        : capability === "pitch-decision"
          ? ["pitch-human-decision-data", "pitch-human-decision-readable"]
          : ["pitch-promotion-receipt", "book-config", "book-pitch-selection-data", "book-pitch-selection-readable"];
  const reportedRoles = new Set(report.artifacts.map((artifact) => artifact.role));
  const errors = [...report.errors];
  for (const role of requiredRoles) {
    if (!reportedRoles.has(role)) errors.push(`${capability} child report is missing required artifact role: ${role}`);
  }
  if (capability === "pitch-slate" && workOrder?.slateId) {
    const expectedPaths = new Map([
      ["pitch-slate-data", `.inkos/pitch-slates/${workOrder.slateId}/slate.json`],
      ["pitch-slate-review", `.inkos/pitch-slates/${workOrder.slateId}/review.md`],
    ]);
    for (const artifact of report.artifacts) {
      const expectedPath = expectedPaths.get(artifact.role);
      if (expectedPath && normalizedRelativePath(artifact.path) !== expectedPath) {
        errors.push(`${artifact.role} must report exact path: ${expectedPath}`);
      }
    }
  }
  if (capability === "pitch-review" && workOrder?.slateId) {
    const expectedPaths = new Map([
      ["pitch-survival-review-data", `.inkos/pitch-slates/${workOrder.slateId}/survival-review/review.json`],
      ["pitch-survival-review-readable", `.inkos/pitch-slates/${workOrder.slateId}/survival-review/review.md`],
    ]);
    for (const artifact of report.artifacts) {
      const expectedPath = expectedPaths.get(artifact.role);
      if (expectedPath && normalizedRelativePath(artifact.path) !== expectedPath) {
        errors.push(`${artifact.role} must report exact path: ${expectedPath}`);
      }
    }
  }
  if (capability === "pitch-decision" && workOrder?.slateId) {
    const expectedPaths = new Map([
      ["pitch-human-decision-data", `.inkos/pitch-slates/${workOrder.slateId}/human-decision/decision.json`],
      ["pitch-human-decision-readable", `.inkos/pitch-slates/${workOrder.slateId}/human-decision/decision.md`],
    ]);
    for (const artifact of report.artifacts) {
      const expectedPath = expectedPaths.get(artifact.role);
      if (expectedPath && normalizedRelativePath(artifact.path) !== expectedPath) {
        errors.push(`${artifact.role} must report exact path: ${expectedPath}`);
      }
    }
  }
  if (capability === "pitch-promote" && workOrder?.slateId && workOrder?.bookId) {
    const expectedPaths = new Map([
      ["pitch-promotion-receipt", `.inkos/pitch-slates/${workOrder.slateId}/promotion.json`],
      ["book-config", `books/${workOrder.bookId}/book.json`],
      ["book-pitch-selection-data", `books/${workOrder.bookId}/story/pitch-selection.json`],
      ["book-pitch-selection-readable", `books/${workOrder.bookId}/story/pitch-selection.md`],
    ]);
    for (const artifact of report.artifacts) {
      const expectedPath = expectedPaths.get(artifact.role);
      if (expectedPath && normalizedRelativePath(artifact.path) !== expectedPath) {
        errors.push(`${artifact.role} must report exact path: ${expectedPath}`);
      }
    }
  }
  return { artifacts: report.artifacts, errors };
}

export function validatePitchSlateData(value, workOrder) {
  const errors = [];
  if (!isPlainObject(value)) return ["pitch slate data must be an object"];
  if (value.schemaVersion !== 1) errors.push("pitch slate schemaVersion must be 1");
  if (value.slateId !== workOrder.slateId) errors.push("pitch slate slateId does not match the work order");
  if (value.canonStatus !== "non-canonical") errors.push("pitch slate canonStatus must be non-canonical");
  if (value.reviewStatus !== "pending") errors.push("pitch slate reviewStatus must be pending");
  if (value.candidateCount !== workOrder.candidateCount) errors.push("pitch slate candidateCount does not match the work order");
  if (!Array.isArray(value.candidates) || value.candidates.length !== workOrder.candidateCount) {
    errors.push("pitch slate candidates length does not match the work order");
    return errors;
  }
  const expectedIds = value.candidates.map((_, index) => `p${String(index + 1).padStart(2, "0")}`);
  value.candidates.forEach((candidate, index) => {
    if (!isPlainObject(candidate)) {
      errors.push(`pitch slate candidate ${expectedIds[index]} must be an object`);
      return;
    }
    if (candidate.candidateId !== expectedIds[index]) {
      errors.push(`pitch slate candidateId must be ${expectedIds[index]}`);
    }
    if (candidate.decision !== "pending") {
      errors.push(`pitch slate ${expectedIds[index]} decision must be pending`);
    }
  });
  return errors;
}

export function validatePitchSurvivalReviewData(value, workOrder, sourceSlate) {
  const errors = [];
  if (!isPlainObject(value)) return ["pitch survival review data must be an object"];
  if (value.schemaVersion !== 1) errors.push("pitch survival review schemaVersion must be 1");
  if (value.reviewKind !== "independent-blind-comparison") errors.push("pitch survival review kind is invalid");
  if (value.slateId !== workOrder.slateId) errors.push("pitch survival review slateId does not match the work order");
  if (!SHA256.test(value.sourceSlateSha256 ?? "")) errors.push("pitch survival review sourceSlateSha256 is invalid");
  if (value.humanDecision !== "pending") errors.push("pitch survival review humanDecision must be pending");
  const candidateIds = Array.isArray(sourceSlate?.candidates)
    ? sourceSlate.candidates.map((candidate) => candidate?.candidateId)
    : [];
  if (candidateIds.length === 0) errors.push("source pitch slate has no candidates");
  if (!Array.isArray(value.ranking)
    || value.ranking.length !== candidateIds.length
    || new Set(value.ranking).size !== candidateIds.length
    || value.ranking.some((id) => !candidateIds.includes(id))) {
    errors.push("pitch survival review ranking must contain every source candidate exactly once");
  }
  if (!Array.isArray(value.verdicts) || value.verdicts.length !== candidateIds.length) {
    errors.push("pitch survival review verdicts must contain every source candidate exactly once");
    return errors;
  }
  const verdictIds = value.verdicts.map((verdict) => verdict?.candidateId);
  if (new Set(verdictIds).size !== candidateIds.length || verdictIds.some((id) => !candidateIds.includes(id))) {
    errors.push("pitch survival review verdict ids must contain every source candidate exactly once");
  }
  const survivors = value.verdicts.filter((verdict) => verdict?.verdict === "SURVIVE").map((verdict) => verdict.candidateId);
  if (survivors.length > 1) errors.push("pitch survival review may recommend at most one SURVIVE candidate");
  if ((value.winnerCandidateId ?? null) !== (survivors[0] ?? null)) {
    errors.push("pitch survival review winner must match the sole SURVIVE candidate");
  }
  if (value.winnerCandidateId && value.ranking?.[0] !== value.winnerCandidateId) {
    errors.push("pitch survival review winner must rank first");
  }
  return errors;
}

async function verifyChildArtifacts(repoPath, report) {
  const artifacts = [];
  const errors = [...report.errors];
  for (const artifact of report.artifacts) {
    try {
      const bytes = await readFile(join(repoPath, artifact.path));
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== artifact.sha256) {
        errors.push(`child artifact hash mismatch: ${artifact.path}`);
        continue;
      }
      artifacts.push(artifact);
    } catch {
      errors.push(`child artifact is unavailable: ${artifact.path}`);
    }
  }
  return { artifacts, errors };
}

async function verifyCapabilityArtifactContents(repoPath, capability, workOrder, report) {
  if (!["pitch-slate", "pitch-review", "pitch-decision", "pitch-promote"].includes(capability) || report.errors.length > 0) return report;
  const errors = [...report.errors];
  if (capability === "pitch-decision") {
    const dataArtifact = report.artifacts.find((artifact) => artifact.role === "pitch-human-decision-data");
    if (!dataArtifact) return report;
    try {
      const decision = JSON.parse(await readFile(join(repoPath, dataArtifact.path), "utf8"));
      const slateBytes = await readFile(join(repoPath, ".inkos", "pitch-slates", workOrder.slateId, "slate.json"));
      const reviewBytes = await readFile(join(repoPath, ".inkos", "pitch-slates", workOrder.slateId, "survival-review", "review.json"));
      if (decision.slateId !== workOrder.slateId) errors.push("pitch human decision slateId does not match the work order");
      if (decision.candidateId !== workOrder.candidateId) errors.push("pitch human decision candidateId does not match the work order");
      if (decision.decision !== workOrder.humanDecision) errors.push("pitch human decision does not match the work order");
      if (decision.sourceSlateSha256 !== createHash("sha256").update(slateBytes).digest("hex")) errors.push("pitch human decision source slate hash does not match");
      if (decision.sourceReviewSha256 !== createHash("sha256").update(reviewBytes).digest("hex")) errors.push("pitch human decision source review hash does not match");
      if (decision.manuscriptAuthorized !== false) errors.push("pitch human decision must not authorize manuscript");
    } catch {
      errors.push("pitch human decision or its sources are not valid JSON");
    }
    return { artifacts: report.artifacts, errors };
  }
  if (capability === "pitch-promote") {
    const receiptArtifact = report.artifacts.find((artifact) => artifact.role === "pitch-promotion-receipt");
    const selectionArtifact = report.artifacts.find((artifact) => artifact.role === "book-pitch-selection-data");
    if (!receiptArtifact || !selectionArtifact) return report;
    try {
      const receipt = JSON.parse(await readFile(join(repoPath, receiptArtifact.path), "utf8"));
      const selection = JSON.parse(await readFile(join(repoPath, selectionArtifact.path), "utf8"));
      if (receipt.slateId !== workOrder.slateId || selection.slateId !== workOrder.slateId) errors.push("pitch promotion slateId does not match the work order");
      if (receipt.bookId !== workOrder.bookId) errors.push("pitch promotion bookId does not match the work order");
      if (receipt.canonEffect !== "planning-seed-created") errors.push("pitch promotion canon effect must be planning-seed-created");
      if (receipt.manuscriptCreated !== false) errors.push("pitch promotion must not create manuscript");
      if (receipt.sourceDecisionSha256 !== selection.sourceDecisionSha256) errors.push("pitch promotion decision lineage does not match selection data");
      const edgeTypes = new Set((receipt.lineageEdges ?? []).map((edge) => edge?.type));
      if (!edgeTypes.has("selects") || !edgeTypes.has("promotes_to")) errors.push("pitch promotion is missing required lineage edges");
    } catch {
      errors.push("pitch promotion receipt or selection data is not valid JSON");
    }
    return { artifacts: report.artifacts, errors };
  }
  if (capability === "pitch-review") {
    const dataArtifact = report.artifacts.find((artifact) => artifact.role === "pitch-survival-review-data");
    const readableArtifact = report.artifacts.find((artifact) => artifact.role === "pitch-survival-review-readable");
    if (!dataArtifact || !readableArtifact) return report;
    let review;
    let sourceSlate;
    const sourcePath = join(repoPath, ".inkos", "pitch-slates", workOrder.slateId, "slate.json");
    try {
      const sourceBytes = await readFile(sourcePath);
      sourceSlate = JSON.parse(sourceBytes.toString("utf8"));
      review = JSON.parse(await readFile(join(repoPath, dataArtifact.path), "utf8"));
      if (review.sourceSlateSha256 !== createHash("sha256").update(sourceBytes).digest("hex")) {
        errors.push("pitch survival review source slate hash does not match");
      }
    } catch {
      errors.push("pitch survival review data or source slate is not valid JSON");
      return { artifacts: report.artifacts, errors };
    }
    errors.push(...validatePitchSurvivalReviewData(review, workOrder, sourceSlate));
    try {
      const readable = await readFile(join(repoPath, readableArtifact.path), "utf8");
      for (const candidate of sourceSlate.candidates ?? []) {
        if (!readable.includes(candidate.candidateId)) errors.push(`pitch survival review is missing candidate: ${candidate.candidateId}`);
      }
    } catch {
      errors.push("pitch survival review readable artifact is unreadable");
    }
    return { artifacts: report.artifacts, errors };
  }
  const dataArtifact = report.artifacts.find((artifact) => artifact.role === "pitch-slate-data");
  const reviewArtifact = report.artifacts.find((artifact) => artifact.role === "pitch-slate-review");
  if (!dataArtifact || !reviewArtifact) return report;
  let slate;
  try {
    slate = JSON.parse(await readFile(join(repoPath, dataArtifact.path), "utf8"));
  } catch {
    errors.push("pitch-slate-data is not valid JSON");
    return { artifacts: report.artifacts, errors };
  }
  errors.push(...validatePitchSlateData(slate, workOrder));
  try {
    const review = await readFile(join(repoPath, reviewArtifact.path), "utf8");
    for (let index = 1; index <= workOrder.candidateCount; index += 1) {
      const candidateId = `p${String(index).padStart(2, "0")}`;
      if (!review.includes(candidateId)) errors.push(`pitch-slate-review is missing candidate: ${candidateId}`);
    }
  } catch {
    errors.push("pitch-slate-review is unreadable");
  }
  return { artifacts: report.artifacts, errors };
}

function changedPaths(changes) {
  return changes.flatMap((change) => {
    const path = change.slice(3);
    if (!path) return [];
    return path.includes(" -> ") ? path.split(" -> ") : [path];
  });
}

function pathIsWithinWriteScope(plan, path) {
  return plan.repo.execution.writeScopes.some((scope) => {
    const normalizedScope = normalizedRelativePath(scope).replace(/\/+$/, "");
    const normalizedPath = normalizedRelativePath(path);
    return normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);
  });
}

function writeScopeViolations(plan, before, after, observedWrites = []) {
  if (!plan.mutating) return [];
  const beforePaths = new Set(changedPaths(before.changes));
  const newPaths = changedPaths(after.changes).filter((path) => !beforePaths.has(path));
  return [...new Set([
    ...newPaths.filter((path) => !pathIsWithinWriteScope(plan, path)),
    ...observedWrites.map((change) => change.path).filter((path) => !pathIsWithinWriteScope(plan, path)),
  ])].sort();
}

export async function executeWorkOrder({
  root,
  manifest,
  workOrder,
  spawn = spawnSync,
  hermesSpawn = spawnSync,
  sessionExportSpawn = spawnSync,
  authoritySpawn = spawnSync,
  hermesExecutable = "hermes",
  hermesOptions = {},
}) {
  let plan = buildDispatchPlan({ root, manifest, workOrder });
  const initialCanaryIsolation = workOrder.schemaVersion === 2 && workOrder.capability === "agent-operate"
    ? await verifyPromotionCanaryIsolation({
        codeRepoPath: plan.codeRepoPath,
        workOrder,
        requireLaneSnapshot: false,
      })
    : null;
  if (initialCanaryIsolation) {
    plan = {
      ...plan,
      executionRoot: initialCanaryIsolation.executionRoot,
      canaryIsolation: initialCanaryIsolation,
    };
  }
  const inputVerification = verifyApprovedInputs({ root, manifest, workOrder, spawn: authoritySpawn });
  const privateInputVerification = await verifyPrivateInputs({ root, manifest, workOrder, spawn: authoritySpawn });
  const workOrderSha256 = workOrder.schemaVersion === 2
    ? plan.invocation.workOrderSha256
    : sha256Json(workOrder);
  const runtimeRoot = join(root, ".firefly");
  const runsDir = join(runtimeRoot, "runs");
  const locksDir = join(runtimeRoot, "locks");
  await mkdir(runsDir, { recursive: true });
  await mkdir(locksDir, { recursive: true });

  const receiptName = receiptFileName(workOrder.idempotencyKey);
  const receiptPath = join(runsDir, receiptName);
  const idempotencyLockPath = join(locksDir, `idempotency-${receiptName.replace(/\.json$/, ".lock")}`);
  let idempotencyLockHandle;
  try {
    idempotencyLockHandle = await open(idempotencyLockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") {
      const reclaimed = await reclaimDeadAgentOperateLock({
        lockPath: idempotencyLockPath,
        lockKind: "idempotency",
        receiptPath,
        workOrder,
        workOrderSha256,
        receiptName,
      });
      if (reclaimed) idempotencyLockHandle = await open(idempotencyLockPath, "wx");
      else throw new Error("an execution with this idempotencyKey is already in progress");
    } else {
      throw error;
    }
  }
  await idempotencyLockHandle.writeFile(`${JSON.stringify({
    schemaVersion: "firefly-dispatch-lock/v1",
    lockKind: "idempotency",
    pid: process.pid,
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
    receiptName,
    acquiredAt: new Date().toISOString(),
  })}\n`, "utf8");

  try {
    const existing = await readExistingReceipt(receiptPath);
    let existingRunningReceipt = null;
    if (existing) {
      if (existing.workOrderSha256 !== workOrderSha256
        || existing.workOrderId !== workOrder.workOrderId
        || existing.idempotencyKey !== workOrder.idempotencyKey
        || existing.repo !== workOrder.repo
        || existing.capability !== workOrder.capability) {
        throw new Error("idempotencyKey is already bound to a different work order");
      }
      if (!validateRunReceiptSelfHash(existing)) {
        throw new Error("stored RunReceipt v2 self hash mismatch");
      }
      if (existing.status === "running") {
        if (workOrder.schemaVersion === 2 && workOrder.capability === "agent-operate") {
          if (plan.canaryIsolation && (!existing.control?.canaryIsolation
            || sha256Json(existing.control.canaryIsolation) !== sha256Json(plan.canaryIsolation.projection))) {
            throw new Error("running RunReceipt canary isolation scope does not match live receipt readback");
          }
          existingRunningReceipt = existing;
        } else {
          throw new Error("an execution with this idempotencyKey is still marked running");
        }
      } else {
        if (workOrder.schemaVersion === 2 && workOrder.capability === "agent-operate") {
          if (existing.status === "succeeded") {
            if (plan.canaryIsolation) {
              if (!existing.control?.canaryIsolation
                || sha256Json(existing.control.canaryIsolation) !== sha256Json(plan.canaryIsolation.projection)
                || existing.execution?.executionRoot !== receiptExecutionRootPath(root, plan)
                || existing.execution?.codeRepoPath !== relative(root, plan.codeRepoPath)) {
                throw new Error("stored RunReceipt canary isolation scope does not match live receipt readback");
              }
              await verifyCanarySourceSnapshot({
                codeRepoPath: plan.codeRepoPath,
                receipt: plan.canaryIsolation.receipt,
              });
            }
            const replayEvidence = await verifyInkosAgentOperationTerminal({
              repoPath: plan.executionRoot,
              workOrder,
              workOrderSha256,
              manifestCapabilitySha256: existing.execution?.manifestCapabilitySha256,
              agentOperation: existing.agentOperation,
              productionRun: existing.productionRun,
              artifacts: existing.artifacts,
              hermesReceiptSha256: existing.hermesInvocation?.evidence?.receipt?.sha256,
              hermesActionSha256: existing.hermesInvocation?.evidence?.action?.sha256,
              hermesActionTextSha256: existing.agentOperation?.action?.textSha256,
              hermesInvocationSessionId: existing.hermesInvocation?.sessionId,
              canaryIsolation: plan.canaryIsolation?.projection ?? null,
              verifyProjectedArtifacts: false,
              allowLegacyProductionV1: workOrder.executionMode === "production",
            });
            if (replayEvidence.errors.length > 0) {
              throw new Error(`stored Agent terminal evidence is invalid: ${replayEvidence.errors.join("; ")}`);
            }
          }
          await reclaimDeadAgentOperateLock({
            lockPath: join(locksDir, targetLockFileName(plan, workOrder)),
            lockKind: "target",
            receiptPath,
            workOrder,
            workOrderSha256,
            receiptName,
          });
          await reconcileLegacyTargetLock({
            locksDir,
            plan,
            receiptPath,
            workOrder,
            workOrderSha256,
            receiptName,
          });
        }
        return { ...existing, replayed: true };
      }
    }

    if (plan.canaryIsolation) {
      let strictCanaryIsolation;
      try {
        strictCanaryIsolation = await verifyPromotionCanaryIsolation({
          codeRepoPath: plan.codeRepoPath,
          workOrder,
          requireLaneSnapshot: true,
          acceptTerminalSnapshot: existingRunningReceipt !== null,
        });
      } catch (error) {
        if (existingRunningReceipt === null || error?.code !== "CANARY_RECOVERY_REQUIRED") throw error;
        const targetLockPath = join(locksDir, targetLockFileName(plan, workOrder));
        const reclaimed = await reclaimDeadAgentOperateLock({
          lockPath: targetLockPath,
          lockKind: "target",
          receiptPath,
          workOrder,
          workOrderSha256,
          receiptName,
        });
        const legacyLock = await reconcileLegacyTargetLock({
          locksDir,
          plan,
          receiptPath,
          workOrder,
          workOrderSha256,
          receiptName,
        });
        if ((!reclaimed && await readExistingReceipt(targetLockPath) !== null) || legacyLock.blocksCurrentTarget) {
          throw new Error(`mutating target is locked: ${workOrder.repo}/${workOrder.bookId}`);
        }
        if (!hasText(existingRunningReceipt.receiptId)
          || typeof existingRunningReceipt.startedAt !== "string"
          || Number.isNaN(Date.parse(existingRunningReceipt.startedAt))) {
          throw new Error("stored running Agent RunReceipt identity or start time is invalid");
        }
        const finishedAt = new Date().toISOString();
        const recoveryReceipt = sealRunReceiptV2({
          schemaVersion: 2,
          receiptId: existingRunningReceipt.receiptId,
          workOrderId: workOrder.workOrderId,
          workOrderSha256,
          idempotencyKey: workOrder.idempotencyKey,
          repo: workOrder.repo,
          capability: workOrder.capability,
          status: "needs-attention",
          mutating: true,
          startedAt: existingRunningReceipt.startedAt,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(existingRunningReceipt.startedAt)),
          control: {
            executionMode: workOrder.executionMode,
            lane: workOrder.modeEvidence.lane,
            modeEvidenceSha256: sha256Json(workOrder.modeEvidence),
            canaryIsolation: plan.canaryIsolation.projection,
          },
          approval: {
            required: true,
            status: "pending",
            ownerDecisionReceiptSha256: sha256Json(workOrder.ownerDecision),
          },
          inputVerification: {
            approvedCount: inputVerification.length,
            privateCount: privateInputVerification.length,
            setSha256: sha256Json({ inputVerification, privateInputVerification }),
          },
          artifacts: [],
          error: {
            category: "canary-recovery-required",
            messageSha256: createHash("sha256").update(error instanceof Error ? error.message : String(error)).digest("hex"),
          },
          replayed: false,
        });
        await writeJsonAtomic(receiptPath, recoveryReceipt);
        return recoveryReceipt;
      }
      plan = {
        ...plan,
        executionRoot: strictCanaryIsolation.executionRoot,
        canaryIsolation: strictCanaryIsolation,
      };
    }

    const before = inspectDispatchTarget(plan);
    const observedBefore = plan.mutating ? await snapshotObservationScopes(plan) : new Map();
    const startedAt = existingRunningReceipt?.startedAt ?? new Date().toISOString();
    const receiptId = existingRunningReceipt?.receiptId
      ?? `rr-${createHash("sha256").update(`${workOrder.idempotencyKey}:${workOrderSha256}`).digest("hex").slice(0, 24)}`;
    const inputSetSha256 = sha256Json({ inputVerification, privateInputVerification });
    const runningReceipt = existingRunningReceipt ?? sealRunReceiptV2({
      schemaVersion: workOrder.schemaVersion,
      receiptId,
      workOrderId: workOrder.workOrderId,
      workOrderSha256,
      idempotencyKey: workOrder.idempotencyKey,
      repo: workOrder.repo,
      capability: workOrder.capability,
      status: "running",
      mutating: plan.mutating,
      startedAt,
      approval: {
        required: plan.approvalRequired,
        status: plan.approvalRequired ? "pending" : "not-required",
      },
      ...(workOrder.schemaVersion === 2 ? {
        inputVerification: {
          approvedCount: inputVerification.length,
          privateCount: privateInputVerification.length,
          setSha256: inputSetSha256,
        },
        ...(workOrder.capability === "agent-operate" ? {
          control: {
            executionMode: workOrder.executionMode,
            lane: workOrder.modeEvidence.lane,
            modeEvidenceSha256: sha256Json(workOrder.modeEvidence),
            ...(plan.canaryIsolation ? { canaryIsolation: plan.canaryIsolation.projection } : {}),
          },
        } : {}),
      } : { inputVerification, privateInputVerification }),
      artifacts: [],
      replayed: false,
    });
    if (!existingRunningReceipt) await writeJsonAtomic(receiptPath, runningReceipt);

    const lockPath = join(locksDir, targetLockFileName(plan, workOrder));
    let lockHandle = null;
    let hermesControl = null;
    try {
      if (plan.mutating) {
        try {
          lockHandle = await open(lockPath, "wx");
        } catch (error) {
          if (error?.code === "EEXIST") {
            const reclaimed = await reclaimDeadAgentOperateLock({
              lockPath,
              lockKind: "target",
              receiptPath,
              workOrder,
              workOrderSha256,
              receiptName,
            });
            if (reclaimed) lockHandle = await open(lockPath, "wx");
            else throw new Error(`mutating target is locked: ${workOrder.repo}/${workOrder.bookId}`);
          } else {
            throw error;
          }
        }
        const legacyLock = await reconcileLegacyTargetLock({
          locksDir,
          plan,
          receiptPath,
          workOrder,
          workOrderSha256,
          receiptName,
        });
        if (legacyLock.blocksCurrentTarget) {
          throw new Error(`mutating target is locked: ${workOrder.repo}/${workOrder.bookId}`);
        }
        await lockHandle.writeFile(`${JSON.stringify({
          schemaVersion: "firefly-dispatch-lock/v1",
          lockKind: "target",
          pid: process.pid,
          workOrderId: workOrder.workOrderId,
          workOrderSha256,
          repo: workOrder.repo,
          bookId: workOrder.bookId,
          receiptName,
          receiptId,
          acquiredAt: new Date().toISOString(),
        })}\n`, "utf8");
      }

      if (workOrder.schemaVersion === 2 && workOrder.capability === "agent-operate") {
        hermesControl = await runHermesControlInvocation({
          root,
          manifest,
          workOrder,
          plan,
          runArtifactsDir: join(runsDir, receiptName.replace(/\.json$/, ".hermes")),
          hermesRequestDir: join(runtimeRoot, "hermes-requests", workOrderSha256),
          hermesExecutable,
          hermesSpawn,
          sessionExportSpawn,
          authoritySpawn,
          hermesOptions,
        });
      }
      if (plan.canaryIsolation && !existingRunningReceipt) {
        const childPreflight = await verifyPromotionCanaryIsolation({
          codeRepoPath: plan.codeRepoPath,
          workOrder,
          requireLaneSnapshot: true,
        });
        plan = { ...plan, executionRoot: childPreflight.executionRoot, canaryIsolation: childPreflight };
      }
      const childInput = hermesControl?.stdin ?? plan.invocation.stdin;
      const child = spawn(plan.invocation.executable, plan.invocation.args, {
        cwd: plan.executionRoot,
        input: childInput ?? undefined,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 16 * 1024 * 1024,
        timeout: plan.invocation.timeoutMs,
      });
      const after = inspectGitRepo(plan.codeRepoPath);
      const observedAfter = plan.mutating ? await snapshotObservationScopes(plan) : new Map();
      const observedWrites = diffObservationSnapshots(observedBefore, observedAfter);
      const parsed = parseChildJson(child.stdout ?? "");
      const trackedWorktreeUnchanged = sameTrackedState(before, after);
      let childArtifactReport = await verifyCapabilityArtifactContents(
        plan.executionRoot,
        workOrder.capability,
        workOrder,
        await verifyChildArtifacts(
          plan.executionRoot,
          validateCapabilityArtifacts(
            workOrder.capability,
            validateChildArtifacts(parsed.value?.artifacts, workOrder.repo),
            workOrder,
          ),
        ),
      );
      const productionV2 = workOrder.schemaVersion === 2
        ? validateProductionV2Child(
            parsed.value,
            workOrder,
            workOrderSha256,
            hermesControl ? {
              ...hermesControl.receipt,
              __bytesSha256: hermesControl.evidence.receipt.sha256,
            } : null,
            plan.canaryIsolation?.projection ?? null,
          )
        : null;
      if (productionV2) {
        const evidenceErrors = await verifyProductionV2Evidence(
          plan.executionRoot,
          workOrder,
          productionV2,
          childArtifactReport.artifacts,
          {
            workOrderSha256,
            manifestCapabilitySha256: plan.invocation.manifestCapabilitySha256,
            hermesControl,
            canaryIsolation: plan.canaryIsolation?.projection ?? null,
          },
        );
        childArtifactReport = {
          artifacts: childArtifactReport.artifacts,
          errors: [...childArtifactReport.errors, ...productionV2.errors, ...evidenceErrors],
        };
      }
      let isolationReceiptVerified = plan.canaryIsolation === undefined;
      let executionRootIsolated = plan.canaryIsolation === undefined;
      let sourceSnapshotUnchanged = plan.canaryIsolation === undefined;
      const sourceBookBeforeSha256 = plan.canaryIsolation?.sourceSnapshot.sourceBook.manifestSha256 ?? null;
      const sourceSnapshotBeforeSha256 = plan.canaryIsolation?.sourceSnapshot.commonSnapshotSha256 ?? null;
      let sourceBookAfterSha256 = sourceBookBeforeSha256;
      let sourceSnapshotAfterSha256 = sourceSnapshotBeforeSha256;
      if (plan.canaryIsolation) {
        const isolationErrors = [];
        try {
          const sourceAfter = await verifyCanarySourceSnapshot({
            codeRepoPath: plan.codeRepoPath,
            receipt: plan.canaryIsolation.receipt,
          });
          sourceBookAfterSha256 = sourceAfter.sourceBook.manifestSha256;
          sourceSnapshotAfterSha256 = sourceAfter.commonSnapshotSha256;
          sourceSnapshotUnchanged = sourceBookAfterSha256 === sourceBookBeforeSha256
            && sourceSnapshotAfterSha256 === sourceSnapshotBeforeSha256;
        } catch (error) {
          sourceSnapshotUnchanged = false;
          sourceBookAfterSha256 = null;
          sourceSnapshotAfterSha256 = null;
          isolationErrors.push(`source canary snapshot readback failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
          const isolationAfter = await verifyPromotionCanaryIsolation({
            codeRepoPath: plan.codeRepoPath,
            workOrder,
            requireLaneSnapshot: false,
          });
          isolationReceiptVerified = sha256Json(isolationAfter.projection) === sha256Json(plan.canaryIsolation.projection);
          executionRootIsolated = isolationAfter.executionRoot === plan.executionRoot
            && isolationAfter.executionRoot !== plan.codeRepoPath;
          if (!isolationReceiptVerified) isolationErrors.push("canary isolation projection changed during execution");
          if (!executionRootIsolated) isolationErrors.push("canary execution root changed during execution");
        } catch (error) {
          isolationReceiptVerified = false;
          executionRootIsolated = false;
          isolationErrors.push(`canary isolation receipt readback failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (isolationErrors.length > 0) {
          childArtifactReport = {
            artifacts: childArtifactReport.artifacts,
            errors: [...childArtifactReport.errors, ...isolationErrors],
          };
        }
      }
      const scopeViolations = writeScopeViolations(plan, before, after, observedWrites);
      const succeeded = child.status === 0 && child.signal == null && !child.error && parsed.error === null;
      const boundariesPassed = trackedWorktreeUnchanged
        && childArtifactReport.errors.length === 0
        && scopeViolations.length === 0
        && isolationReceiptVerified
        && executionRootIsolated
        && sourceSnapshotUnchanged;
      const status = !succeeded ? "failed" : boundariesPassed ? "succeeded" : "needs-attention";
      const childArtifacts = childArtifactReport.artifacts;
      const finishedAt = new Date().toISOString();
      const legacyFinalReceipt = {
        ...runningReceipt,
        status,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        child: {
          path: relative(root, plan.codeRepoPath),
          branchBefore: before.branch,
          branchAfter: after.branch,
          headBefore: before.head,
          headAfter: after.head,
        },
        execution: {
          adapter: plan.repo.execution.adapter,
          executable: plan.invocation.executable,
          args: plan.invocation.args,
          cwd: receiptExecutionRootPath(root, plan),
          instructionTransport: plan.invocation.stdin === null ? "none" : "stdin",
          sessionId: plan.invocation.sessionId,
          exitCode: child.status,
          signal: child.signal ?? null,
        },
        boundaryChecks: {
          trackedWorktreeUnchanged,
          artifactReportsValid: childArtifactReport.errors.length === 0,
          observationComplete: true,
          writesWithinDeclaredScopes: scopeViolations.length === 0,
          instructionExcludedFromArgs: plan.invocation.stdin === null
            || !plan.invocation.args.includes(workOrder.instruction),
        },
        writeScopeViolations: scopeViolations,
        observedWrites,
        approval: {
          required: plan.approvalRequired,
          status: status === "failed"
            ? "blocked"
            : plan.approvalRequired ? "pending" : "not-required",
        },
        artifacts: childArtifacts,
        artifactEvidence: childArtifactReport.errors.length > 0
          ? "invalid-child-report"
          : childArtifacts.length > 0
            ? "child-reported"
            : plan.mutating ? (observedWrites.length > 0 ? "dispatcher-observed" : "dispatcher-observed-no-change")
            : "not-reported-by-child",
        artifactErrors: childArtifactReport.errors,
        childResult: parsed.value,
        referenceProvenance: workOrder.capability === "reference-bind"
          ? {
              referencePackId: parsed.value?.binding?.referencePackId ?? null,
              spineReference: parsed.value?.binding?.spineReference ?? null,
              transformationCreated: parsed.value?.preflight?.transformationCreated ?? null,
              railCreated: parsed.value?.preflight?.railCreated ?? null,
              transformationSha256: parsed.value?.preflight?.transformationSha256 ?? null,
              railPlanSha256: parsed.value?.preflight?.railPlanSha256 ?? null,
              arcId: parsed.value?.preflight?.arcId ?? null,
            }
          : null,
        error: status === "failed"
          ? {
              message: child.error?.message ?? parsed.error ?? `child exited with code ${child.status}`,
              stderr: (child.stderr ?? "").trim().slice(0, 20000),
            }
          : null,
        replayed: false,
      };
      const unsealedFinalReceipt = workOrder.schemaVersion === 2
        ? {
            ...runningReceipt,
            status,
            finishedAt,
            durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
            child: {
              path: relative(root, plan.codeRepoPath),
              branchBefore: before.branch,
              branchAfter: after.branch,
              headBefore: before.head,
              headAfter: after.head,
            },
            execution: {
              adapter: plan.repo.execution.adapter,
              exitCode: child.status,
              signal: child.signal ?? null,
              instructionTransport: workOrder.capability === "agent-operate" ? "stdin-envelope" : "stdin",
              manifestCapabilitySha256: plan.invocation.manifestCapabilitySha256,
              codeRepoPath: relative(root, plan.codeRepoPath),
              executionRoot: receiptExecutionRootPath(root, plan),
            },
            boundaryChecks: {
              trackedWorktreeUnchanged,
              artifactReportsValid: childArtifactReport.errors.length === 0,
              observationComplete: true,
              writesWithinDeclaredScopes: scopeViolations.length === 0,
              privateBodyExcluded: true,
              ...(plan.canaryIsolation ? {
                isolationReceiptVerified,
                executionRootIsolated,
                sourceSnapshotUnchanged,
                sourceBookBeforeSha256,
                sourceBookAfterSha256,
                sourceSnapshotBeforeSha256,
                sourceSnapshotAfterSha256,
              } : {}),
            },
            observedWrites: {
              count: observedWrites.length,
              setSha256: sha256Json(observedWrites),
            },
            approval: {
              required: true,
              status: status === "failed" ? "blocked" : "pending",
              ownerDecisionReceiptSha256: sha256Json(workOrder.ownerDecision),
            },
            productionRun: productionV2?.productionRun ?? null,
            effectiveRuntime: productionV2?.effectiveRuntime ?? null,
            ...(productionV2?.verifiedAgentOperation ? {
              agentOperation: productionV2.verifiedAgentOperation,
            } : {}),
            ...(hermesControl ? {
              hermesInvocation: {
                schemaVersion: hermesControl.receipt.schemaVersion,
                receiptSelfHash: hermesControl.receipt.receiptSelfHash,
                sessionId: hermesControl.receipt.invocation.sessionId,
                evidence: hermesControl.evidence,
              },
            } : {}),
            modelCalls: (productionV2?.modelCalls ?? []).map((call) => ({
              invocationId: call.invocationId,
              agentName: call.agentName,
              stage: call.stage,
              model: call.model,
              reasoningEffort: call.reasoningEffort,
              receiptPath: call.receiptPath,
              receiptSha256: call.receiptSha256,
              outcomePath: call.outcomePath,
              outcomeSha256: call.outcomeSha256,
              status: call.status,
            })),
            artifacts: childArtifacts,
            ...(status === "needs-attention" ? {
              diagnostics: {
                artifactErrors: childArtifactReport.errors.slice(0, 100),
                writeScopeViolations: scopeViolations.slice(0, 100),
              },
            } : {}),
            error: status === "succeeded"
              ? null
              : {
                  category: status === "needs-attention" ? "boundary-check-failed" : (child.error?.code ?? "child-failed"),
                  messageSha256: createHash("sha256").update(String(
                    status === "needs-attention"
                      ? JSON.stringify({ artifactErrors: childArtifactReport.errors, scopeViolations })
                      : child.error?.message ?? parsed.error ?? child.stderr ?? "child failed",
                  )).digest("hex"),
                },
            replayed: false,
        }
        : legacyFinalReceipt;
      const finalReceipt = sealRunReceiptV2(unsealedFinalReceipt);
      await writeJsonAtomic(receiptPath, finalReceipt);
      return finalReceipt;
    } catch (error) {
      const hermesCompleted = workOrder.capability === "agent-operate" && hermesControl !== null;
      const hermesNeedsAttention = workOrder.capability === "agent-operate"
        && !hermesCompleted
        && error?.hermesAttempted === true;
      let hermesEvidence = error?.hermesEvidence ?? hermesControl?.evidence ?? null;
      if (hermesNeedsAttention) {
        const attentionDir = join(runsDir, receiptName.replace(/\.json$/, ".hermes"));
        await mkdir(attentionDir, { recursive: true });
        const attentionPath = join(attentionDir, "needs-attention.json");
        const attention = {
          schemaVersion: "hermes-control-needs-attention/v1",
          status: "needs-attention",
          workOrderId: workOrder.workOrderId,
          workOrderSha256,
          reasonSha256: createHash("sha256").update(error instanceof Error ? error.message : String(error)).digest("hex"),
          automaticRetryAllowed: false,
          recordedAt: new Date().toISOString(),
        };
        await writeJsonAtomic(attentionPath, attention);
        const attentionBytes = Buffer.from(`${JSON.stringify(attention, null, 2)}\n`, "utf8");
        hermesEvidence = {
          ...(hermesEvidence ?? {}),
          needsAttention: relativeFileEvidence(root, attentionPath, attentionBytes),
        };
      }
      const failedReceipt = sealRunReceiptV2({
        ...runningReceipt,
        status: hermesNeedsAttention ? "needs-attention" : "failed",
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(startedAt),
        approval: {
          required: plan.approvalRequired,
          status: hermesNeedsAttention ? "pending" : "blocked",
        },
        ...(hermesCompleted ? {
          hermesInvocation: {
            schemaVersion: hermesControl.receipt.schemaVersion,
            receiptSelfHash: hermesControl.receipt.receiptSelfHash,
            sessionId: hermesControl.receipt.invocation.sessionId,
            evidence: hermesControl.evidence,
          },
        } : hermesNeedsAttention && hermesEvidence ? {
          hermesInvocation: { status: "needs-attention", evidence: hermesEvidence },
        } : {}),
        error: workOrder.schemaVersion === 2
          ? {
              category: hermesNeedsAttention ? "hermes-ambiguous-no-retry" : "dispatcher-failed",
              messageSha256: createHash("sha256").update(error instanceof Error ? error.message : String(error)).digest("hex"),
            }
          : { message: error instanceof Error ? error.message : String(error) },
        replayed: false,
      });
      await writeJsonAtomic(receiptPath, failedReceipt);
      return failedReceipt;
    } finally {
      if (lockHandle) {
        await lockHandle.close();
        await rm(lockPath, { force: true });
      }
    }
  } finally {
    await idempotencyLockHandle.close();
    await rm(idempotencyLockPath, { force: true });
  }
}

export function publicDispatchPlan(plan, workOrder) {
  const canary = workOrder.modeEvidence?.canaryIsolation;
  const executionRoot = canary
    ? normalizedRelativePath(join(
        plan.repo.path,
        `.inkos/canaries/${canary.pairId}/${workOrder.modeEvidence.lane === "neutral-baseline" ? "neutral" : "soul"}`,
      ))
    : plan.repo.path;
  return {
    schemaVersion: 1,
    type: "dispatch-plan",
    repo: plan.repo.name,
    capability: plan.capability.name,
    mutating: plan.mutating,
    approvalRequired: plan.approvalRequired,
    approvedInputCount: workOrder.approvedInputs.length,
    privateInputCount: workOrder.privateInputs?.length ?? 0,
    childPath: plan.repo.path,
    codeRepoPath: plan.repo.path,
    executionRoot,
    adapter: plan.repo.execution.adapter,
    command: [plan.invocation.executable, ...plan.invocation.args],
    instructionTransport: plan.invocation.stdin === null ? "none" : "stdin",
    sessionId: plan.invocation.sessionId,
    instructionExcludedFromArgs: plan.invocation.stdin === null
      || !plan.invocation.args.includes(workOrder.instruction),
    timeoutMs: plan.invocation.timeoutMs,
  };
}
