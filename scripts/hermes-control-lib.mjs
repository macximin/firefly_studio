import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateHermesNeutralProfileRegistry,
  validateHermesProfileRegistry,
  verifyHermesNeutralProfileRegistry,
  verifyHermesProfileRegistry,
} from "./hermes-profile-lib.mjs";
import {
  validateGenreSoulAdoptionRegistry,
  verifyGenreSoulAdoptions,
} from "./genre-soul-adoption-lib.mjs";
import { validateCanaryIsolationReference } from "./canary-isolation-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_WORK_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const UNSAFE_BOOK_ID_RE = /[\u0000-\u001f\u007f/\\:*?"'`{}<>|]/u;
const MODE_EVIDENCE_KEYS = new Set([
  "lane", "profileId", "profileConfigSha256", "profileLifecycle", "productionEnabled",
  "adoptionRegistrySha256", "activeMatchingCount", "soulId", "soulVersion", "soulSha256",
  "promotionDecisionSha256",
]);
const CANARY_MODE_EVIDENCE_KEYS = new Set([...MODE_EVIDENCE_KEYS, "canaryIsolation"]);
const SOUL_BINDING_KEYS = new Set(["soulId", "soulVersion", "bindingSha256"]);
const PROPOSAL_V1_KEYS = new Set([
  "schemaVersion", "action", "workOrderId", "workOrderSha256", "bookId", "sessionId",
  "guidance",
]);
const PROPOSAL_V2_KEYS = new Set(["schemaVersion", "action", "guidance"]);
export const MAX_GUIDANCE_BYTES = 32 * 1024;
export const HERMES_CONTROL_QUERY = "Emit the single Firefly control proposal defined by the injected operation contract.";
const OPAQUE_BLIND_PAIR_ID = /^bp-[0-9a-f]{24}$/;
export const HERMES_CONTROL_TRANSPORT_POLICY = Object.freeze({
  apiCallStaleTimeoutSeconds: 600,
  codexEventStaleTimeoutSeconds: 120,
  codexTtfbTimeoutSeconds: 120,
  invocationTimeoutMs: 2_100_000,
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

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

export function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function deriveAgentOperateSessionId(workOrder) {
  const identity = {
    v: 1,
    bookId: workOrder.bookId,
    lane: workOrder.modeEvidence?.lane,
    profileId: workOrder.modeEvidence?.profileId,
    soulId: workOrder.modeEvidence?.soulId,
    soulVersion: workOrder.modeEvidence?.soulVersion,
    bindingSha256: workOrder.expectedSoulBinding?.bindingSha256 ?? null,
    isolationScopeSha256: workOrder.modeEvidence?.canaryIsolation?.isolationScopeSha256 ?? null,
  };
  return `hq-agent-${sha256Bytes(Buffer.from(canonicalStringify(identity), "utf8")).slice(0, 40)}`;
}

function parseJsonBytes(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.includes(0)) throw new Error(`${label} is not valid UTF-8 JSON`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function exactKeys(value, keys, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) if (!keys.has(key)) errors.push(`${label} has unknown field: ${key}`);
  for (const key of keys) if (!(key in value)) errors.push(`${label}.${key} is required`);
}

export function readHermesDispatchAuthority(root, workOrder) {
  const profileRegistryBytes = readFileSync(join(root, "config", "hermes-production-profiles.json"));
  const adoptionRegistryBytes = readFileSync(join(root, "config", "genre-soul-adoptions.json"));
  const profileRegistry = parseJsonBytes(profileRegistryBytes, "Hermes production profile registry");
  const adoptionRegistry = parseJsonBytes(adoptionRegistryBytes, "genre Soul adoption registry");
  let neutralRegistry = null;
  let neutralRegistryBytes = null;
  if (workOrder?.modeEvidence?.lane === "neutral-baseline") {
    neutralRegistryBytes = readFileSync(join(root, "config", "hermes-neutral-production-profile.json"));
    neutralRegistry = parseJsonBytes(neutralRegistryBytes, "Hermes neutral profile registry");
  }
  return {
    profileRegistry,
    profileRegistryBytes,
    adoptionRegistry,
    adoptionRegistryBytes,
    neutralRegistry,
    neutralRegistryBytes,
  };
}

export function validateAgentOperateModeEvidence(workOrder, authority) {
  const errors = [];
  if (!isObject(workOrder?.modeEvidence)) return ["modeEvidence is required for agent-operate"];
  const evidence = workOrder.modeEvidence;
  const keys = workOrder.executionMode === "promotion-canary" ? CANARY_MODE_EVIDENCE_KEYS : MODE_EVIDENCE_KEYS;
  exactKeys(evidence, keys, "modeEvidence", errors);
  if (!["promotion-canary", "production"].includes(workOrder.executionMode)) {
    errors.push("executionMode must be promotion-canary or production");
    return errors;
  }
  if (!['genre-soul', 'neutral-baseline'].includes(evidence.lane)) errors.push("modeEvidence.lane is invalid");
  if (workOrder.sessionId !== deriveAgentOperateSessionId(workOrder)) errors.push("agent-operate sessionId is not the deterministic Book/lane/Soul/binding session");
  if (!hasText(evidence.profileId)) errors.push("modeEvidence.profileId is required");
  if (!SHA256.test(evidence.profileConfigSha256 ?? "")) errors.push("modeEvidence.profileConfigSha256 is invalid");
  if (!['candidate', 'promoted', 'baseline'].includes(evidence.profileLifecycle)) errors.push("modeEvidence.profileLifecycle is invalid");
  if (typeof evidence.productionEnabled !== "boolean") errors.push("modeEvidence.productionEnabled must be boolean");
  if (!SHA256.test(evidence.adoptionRegistrySha256 ?? "")) errors.push("modeEvidence.adoptionRegistrySha256 is invalid");
  if (![0, 1].includes(evidence.activeMatchingCount)) errors.push("modeEvidence.activeMatchingCount must be 0 or 1");
  if (workOrder.executionMode === "promotion-canary") errors.push(...validateCanaryIsolationReference(evidence.canaryIsolation));
  const adoptionSha256 = sha256Bytes(authority.adoptionRegistryBytes);
  if (evidence.adoptionRegistrySha256 !== adoptionSha256) errors.push("modeEvidence adoption registry hash mismatch");

  const profileErrors = validateHermesProfileRegistry(authority.profileRegistry);
  errors.push(...profileErrors.map((error) => `Hermes profile registry: ${error}`));
  const adoptionErrors = validateGenreSoulAdoptionRegistry(authority.adoptionRegistry, authority.profileRegistry);
  errors.push(...adoptionErrors.map((error) => `genre Soul adoption registry: ${error}`));
  const activeMatches = Array.isArray(authority.adoptionRegistry?.active)
    ? authority.adoptionRegistry.active.filter((entry) => entry?.profileId === evidence.profileId)
    : [];
  if (evidence.activeMatchingCount !== activeMatches.length) errors.push("modeEvidence activeMatchingCount mismatch");

  let profile;
  if (evidence.lane === "neutral-baseline") {
    const neutralErrors = validateHermesNeutralProfileRegistry(authority.neutralRegistry);
    errors.push(...neutralErrors.map((error) => `Hermes neutral profile registry: ${error}`));
    profile = authority.neutralRegistry?.profile;
    if (workOrder.executionMode !== "promotion-canary") errors.push("neutral baseline is promotion-canary only");
    if (workOrder.expectedSoulBinding !== null) errors.push("neutral baseline requires expectedSoulBinding=null");
    if (!hasText(evidence.soulId) || !hasText(evidence.soulVersion) || !SHA256.test(evidence.soulSha256 ?? "") || evidence.promotionDecisionSha256 !== null) {
      errors.push("neutral baseline executor Soul identity is invalid or promotion decision is not null");
    }
    if (evidence.profileLifecycle !== "baseline" || evidence.productionEnabled !== false || evidence.activeMatchingCount !== 0) {
      errors.push("neutral baseline must be disabled baseline with no active adoption");
    }
  } else {
    profile = authority.profileRegistry?.profiles?.find((candidate) => candidate.profileId === evidence.profileId);
    if (!hasText(evidence.soulId) || !hasText(evidence.soulVersion) || !SHA256.test(evidence.soulSha256 ?? "")) {
      errors.push("genre Soul mode evidence identity is invalid");
    }
    const binding = workOrder.expectedSoulBinding;
    if (!isObject(binding)) {
      errors.push("genre Soul requires a non-null expectedSoulBinding");
    } else {
      exactKeys(binding, SOUL_BINDING_KEYS, "expectedSoulBinding", errors);
      if (!hasText(binding.soulId) || !hasText(binding.soulVersion) || !SHA256.test(binding.bindingSha256 ?? "")) {
        errors.push("genre Soul expectedSoulBinding identity is invalid");
      }
      if (binding.soulId !== evidence.soulId || binding.soulVersion !== evidence.soulVersion) {
        errors.push("genre Soul expectedSoulBinding must match modeEvidence Soul identity");
      }
    }
    if (workOrder.executionMode === "promotion-canary") {
      if (evidence.profileLifecycle !== "candidate" || evidence.productionEnabled !== false || evidence.activeMatchingCount !== 0 || evidence.promotionDecisionSha256 !== null) {
        errors.push("genre Soul promotion-canary requires a disabled candidate with no active adoption or decision");
      }
    } else if (evidence.profileLifecycle !== "promoted" || evidence.productionEnabled !== true || evidence.activeMatchingCount !== 1 || !SHA256.test(evidence.promotionDecisionSha256 ?? "")) {
      errors.push("production requires one promoted, enabled, decision-bound genre Soul adoption");
    }
  }
  if (!profile) {
    errors.push("modeEvidence profile is not registered");
    return errors;
  }
  if (
    profile.profileId !== evidence.profileId
    || profile.configSha256 !== evidence.profileConfigSha256
    || profile.lifecycle !== evidence.profileLifecycle
    || profile.productionEnabled !== evidence.productionEnabled
  ) errors.push("modeEvidence profile readback mismatch");
  if (profile.soulId !== evidence.soulId || profile.soulVersion !== evidence.soulVersion || profile.soulSha256 !== evidence.soulSha256) {
    errors.push("modeEvidence executor profile Soul identity mismatch");
  }
  if (evidence.lane === "genre-soul") {
    if (profile.promotionDecisionSha256 !== evidence.promotionDecisionSha256) errors.push("modeEvidence promotion decision mismatch");
    const active = activeMatches[0];
    if (workOrder.executionMode === "production" && (
      active?.soulId !== evidence.soulId
      || active?.soulVersion !== evidence.soulVersion
      || active?.soulSha256 !== evidence.soulSha256
      || active?.profileConfigSha256 !== evidence.profileConfigSha256
      || active?.decisionSha256 !== evidence.promotionDecisionSha256
    )) errors.push("modeEvidence active adoption readback mismatch");
  }
  if (
    workOrder.runtime?.hermesProfile !== evidence.profileId
    || workOrder.runtime?.model !== "gpt-5.6-sol"
    || workOrder.runtime?.reasoning !== "high"
  ) errors.push("agent-operate runtime must match the bound gpt-5.6-sol/high profile");
  if (workOrder.executionMode === "promotion-canary") {
    if (!Array.isArray(workOrder.approvedInputs) || workOrder.approvedInputs.length !== 0) {
      errors.push("promotion-canary approvedInputs must be empty; isolation is a live InkOS receipt binding");
    }
  }
  return errors;
}

export async function verifyAgentOperateAuthority({ root, manifest, workOrder, authority, spawn, hermesOptions = {} }) {
  let profileReceipt;
  if (workOrder.modeEvidence.lane === "neutral-baseline") {
    profileReceipt = await verifyHermesNeutralProfileRegistry(authority.neutralRegistry, hermesOptions);
  } else {
    const receipts = await verifyHermesProfileRegistry(authority.profileRegistry, hermesOptions);
    profileReceipt = receipts.find((receipt) => receipt.profileId === workOrder.modeEvidence.profileId);
  }
  if (!profileReceipt) throw new Error("Hermes dispatch profile readback is missing");
  if (workOrder.executionMode === "production") {
    const adoptions = await verifyGenreSoulAdoptions({
      root,
      registry: authority.adoptionRegistry,
      profileRegistry: authority.profileRegistry,
      manifest,
      spawn,
    });
    if (!adoptions.some((entry) => entry.profileId === workOrder.modeEvidence.profileId && entry.decisionSha256 === workOrder.modeEvidence.promotionDecisionSha256)) {
      throw new Error("production mode has no deeply verified active adoption");
    }
  }
  return profileReceipt;
}

export function buildHermesControlPrompt(workOrderBytes, workOrderSha256) {
  return [
    "# Firefly tool-less control operation",
    "",
    "You are a tool-less Firefly control planner. Do not call tools or claim filesystem changes.",
    "Read the exact owner-approved WorkOrder below and emit one control action for InkOS.",
    "Output exactly one minified JSON object and nothing else: no Markdown, commentary, or code fence.",
    "Exact schema: {\"schemaVersion\":\"hermes-control-proposal/v2\",\"action\":\"write-next\",\"guidance\":string}.",
    "Do not echo, decode, copy, or add workOrderId, workOrderSha256, bookId, sessionId, profile, lane, or any other machine identity field. The host injects authoritative identity after validation.",
    "guidance is task guidance for InkOS and must not contain a second JSON object. Do not calculate or add hashes.",
    `FIREFLY_WORK_ORDER_SHA256=${workOrderSha256}`,
    "FIREFLY_WORK_ORDER_BASE64_BEGIN",
    workOrderBytes.toString("base64"),
    "FIREFLY_WORK_ORDER_BASE64_END",
  ].join("\n");
}

// Recovery only: this must remain byte-for-byte identical to the proposal/v1
// operation contract written before proposal/v2 became the live protocol.
export function buildHistoricalHermesControlPromptV1(workOrderBytes, workOrderSha256) {
  return [
    "# Firefly tool-less control operation",
    "",
    "You are a tool-less Firefly control planner. Do not call tools or claim filesystem changes.",
    "Read the exact owner-approved WorkOrder below and emit one control action for InkOS.",
    "Output exactly one minified JSON object and nothing else: no Markdown, commentary, or code fence.",
    "Exact schema: {\"schemaVersion\":\"hermes-control-proposal/v1\",\"action\":\"write-next\",\"workOrderId\":string,\"workOrderSha256\":64hex,\"bookId\":string,\"sessionId\":string,\"guidance\":string}.",
    "guidance is task guidance for InkOS and must not contain a second JSON object. Do not calculate or add hashes.",
    `FIREFLY_WORK_ORDER_SHA256=${workOrderSha256}`,
    "FIREFLY_WORK_ORDER_BASE64_BEGIN",
    workOrderBytes.toString("base64"),
    "FIREFLY_WORK_ORDER_BASE64_END",
  ].join("\n");
}

export function resolveHermesControlRecoveryPrompt(existingPromptBytes, workOrderBytes, workOrderSha256) {
  if (!Buffer.isBuffer(existingPromptBytes)) throw new Error("existing Hermes operation contract is not bytes");
  const currentPromptBytes = Buffer.from(buildHermesControlPrompt(workOrderBytes, workOrderSha256), "utf8");
  if (existingPromptBytes.equals(currentPromptBytes)) {
    return { promptBytes: currentPromptBytes, allowHistoricalProposalV1: false };
  }
  const historicalPromptBytes = Buffer.from(buildHistoricalHermesControlPromptV1(workOrderBytes, workOrderSha256), "utf8");
  if (existingPromptBytes.equals(historicalPromptBytes)) {
    return { promptBytes: historicalPromptBytes, allowHistoricalProposalV1: true };
  }
  throw new Error("existing Hermes operation contract does not match the WorkOrder");
}

export function parseHermesControlProposal(
  stdout,
  workOrder,
  workOrderSha256,
  { allowHistoricalV1 = false } = {},
) {
  if (typeof stdout !== "string" || stdout.includes("\0")) throw new Error("Hermes stdout is not valid text");
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Hermes returned empty stdout");
  let proposal;
  try {
    proposal = JSON.parse(trimmed);
  } catch {
    throw new Error("Hermes stdout is not exactly one JSON object");
  }
  const errors = [];
  const historicalV1 = proposal?.schemaVersion === "hermes-control-proposal/v1";
  if (historicalV1 && !allowHistoricalV1) {
    errors.push("Historical Hermes proposal v1 is not accepted for a current invocation");
  }
  const proposalKeys = historicalV1 ? PROPOSAL_V1_KEYS : PROPOSAL_V2_KEYS;
  exactKeys(proposal, proposalKeys, "Hermes proposal", errors);
  if (!historicalV1 && proposal?.schemaVersion !== "hermes-control-proposal/v2") {
    errors.push("Hermes proposal schemaVersion is invalid");
  }
  if (proposal?.action !== "write-next") errors.push("Hermes proposal action must be write-next");
  if (historicalV1) {
    if (proposal.workOrderId !== workOrder?.workOrderId || proposal.workOrderSha256 !== workOrderSha256) {
      errors.push("Historical Hermes proposal WorkOrder binding mismatch");
    }
    if (proposal.bookId !== workOrder?.bookId || proposal.sessionId !== workOrder?.sessionId) {
      errors.push("Historical Hermes proposal Book/session binding mismatch");
    }
  }
  if (!isObject(workOrder) || !SAFE_WORK_ORDER_ID.test(workOrder.workOrderId ?? "") || !isSafeBookId(workOrder.bookId)
    || !SAFE_SESSION_ID.test(workOrder.sessionId ?? "") || !SHA256.test(workOrderSha256 ?? "")) {
    errors.push("Hermes host action identity is invalid");
  }
  if (!hasText(proposal.guidance)) {
    errors.push("Hermes proposal guidance is required");
  } else {
    const guidanceBytes = Buffer.from(proposal.guidance, "utf8");
    if (guidanceBytes.byteLength > MAX_GUIDANCE_BYTES) errors.push("Hermes proposal guidance exceeds the 32 KiB UTF-8 limit");
    if (proposal.guidance.includes("\0") || /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(proposal.guidance)) {
      errors.push("Hermes proposal guidance contains forbidden control characters");
    }
  }
  if (isObject(proposal) && trimmed !== JSON.stringify(proposal)) {
    errors.push("Hermes proposal must be exactly one minified JSON object without duplicate fields");
  }
  if (stdout !== trimmed) {
    errors.push("Hermes proposal must not contain leading or trailing whitespace");
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const action = {
    schemaVersion: "hermes-control-action/v1",
    action: "write-next",
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
    bookId: workOrder.bookId,
    sessionId: workOrder.sessionId,
    guidance: proposal.guidance,
    guidanceSha256: sha256Bytes(Buffer.from(proposal.guidance, "utf8")),
  };
  return {
    proposal,
    proposalBytes: Buffer.from(trimmed, "utf8"),
    action,
    actionBytes: Buffer.from(canonicalStringify(action), "utf8"),
  };
}

export function parseHermesSessionId(stderr) {
  const matches = [...String(stderr ?? "").matchAll(/(?:^|\n)session_id: ([A-Za-z0-9][A-Za-z0-9._-]{0,159})(?=\n|$)/g)];
  if (matches.length !== 1 || !SAFE_SESSION_ID.test(matches[0][1])) throw new Error("Hermes stderr did not report exactly one safe session_id");
  return matches[0][1];
}

function validateHermesSessionExportStructure(bytes, expected, { allowSuccessfulUnfinalized = false } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.includes(0)) throw new Error("Hermes session export is not valid UTF-8 JSONL");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Hermes session export is not valid UTF-8 JSONL");
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length !== 1) throw new Error("Hermes session export must contain exactly one session");
  let session;
  try {
    session = JSON.parse(lines[0]);
  } catch {
    throw new Error("Hermes session export is not valid JSONL");
  }
  if (session.id !== expected.sessionId) throw new Error("Hermes session export ID mismatch");
  if (session.profile_name !== expected.profileId || session.model !== "gpt-5.6-sol" || session.source !== "tool") {
    throw new Error("Hermes session export runtime identity mismatch");
  }
  let modelConfig;
  try {
    modelConfig = JSON.parse(session.model_config);
  } catch {
    throw new Error("Hermes session export model_config is invalid");
  }
  if (modelConfig?.reasoning_config?.effort !== "high" || modelConfig?.max_iterations !== 1) {
    throw new Error("Hermes session export does not prove high reasoning and one turn");
  }
  if (session.tool_call_count !== 0) throw new Error("Hermes session export contains tool calls");
  if (session.api_call_count !== 1) throw new Error("Hermes session export must prove exactly one model call");
  const terminallyCompleted = session.end_reason === "agent_close" && typeof session.ended_at === "number";
  const successfulCliExport = allowSuccessfulUnfinalized
    && expected.processExitCode === 0
    && session.end_reason === null
    && session.ended_at === null;
  if (!terminallyCompleted && !successfulCliExport) {
    throw new Error("Hermes session export is not terminally completed");
  }
  if (!Array.isArray(session.messages)) throw new Error("Hermes session export messages are missing");
  if (session.message_count !== session.messages.length) throw new Error("Hermes session export message count mismatch");
  const toolMessages = session.messages.filter((message) => message?.role === "tool" || hasText(message?.tool_name) || hasText(message?.tool_call_id));
  const declaredToolCalls = session.messages.flatMap((message) => Array.isArray(message?.tool_calls) ? message.tool_calls : []);
  if (toolMessages.length > 0 || declaredToolCalls.length > 0) throw new Error("Hermes session export contains tool evidence");
  const userMessages = session.messages.filter((message) => message?.role === "user");
  const assistantMessages = session.messages.filter((message) => message?.role === "assistant");
  const otherMessages = session.messages.filter((message) => !["user", "assistant"].includes(message?.role));
  if (userMessages.length !== 1 || assistantMessages.length !== 1 || otherMessages.length !== 0) {
    throw new Error("Hermes session export must contain exactly one user/assistant exchange");
  }
  if (userMessages[0].content !== expected.queryText) throw new Error("Hermes session export query mismatch");
  if (assistantMessages[0].finish_reason !== "stop") throw new Error("Hermes session export action mismatch");
  if (typeof session.system_prompt !== "string" || !session.system_prompt.includes(expected.operationPromptText)) {
    throw new Error("Hermes session export system prompt does not contain the exact operation contract");
  }
  if (sha256Bytes(Buffer.from(expected.operationPromptText, "utf8")) !== expected.promptSha256) throw new Error("Hermes operation prompt hash mismatch");
  return { session, assistantMessage: assistantMessages[0] };
}

export function validateHermesSessionExport(bytes, expected) {
  const { session, assistantMessage } = validateHermesSessionExportStructure(bytes, expected);
  if (assistantMessage.content !== expected.actionText) throw new Error("Hermes session export action mismatch");
  if (sha256Bytes(Buffer.from(assistantMessage.content, "utf8")) !== expected.actionSha256) throw new Error("Hermes session export action hash mismatch");
  return session;
}

export function parseHermesControlSessionExport(bytes, expected) {
  if (expected.processExitCode !== 0) {
    throw new Error("Hermes control session is not bound to a successful CLI process");
  }
  const { session, assistantMessage } = validateHermesSessionExportStructure(bytes, expected, {
    allowSuccessfulUnfinalized: true,
  });
  const parsedAction = parseHermesControlProposal(
    assistantMessage.content,
    expected.workOrder,
    expected.workOrderSha256,
    { allowHistoricalV1: expected.allowHistoricalProposalV1 === true },
  );
  return {
    session,
    parsedAction,
    reasoningText: typeof assistantMessage.reasoning === "string" ? assistantMessage.reasoning : "",
  };
}

export function validateHermesRenderedControlStdout(stdout, { actionText, reasoningText }) {
  if (typeof stdout !== "string" || stdout.includes("\0")) throw new Error("Hermes stdout is not valid text");
  if (typeof actionText !== "string" || actionText.length === 0) throw new Error("Hermes authoritative action text is missing");
  if (/\r(?!\n)/u.test(stdout)) throw new Error("Hermes stdout contains an invalid carriage return");
  const normalized = stdout.replace(/\r\n/g, "\n");
  const withoutTrailingWhitespace = normalized.replace(/[\t\n ]+$/u, "");
  if (normalized.trim() === actionText) return true;
  if (!withoutTrailingWhitespace.endsWith(actionText)) {
    throw new Error("Hermes stdout does not end with the authoritative session action");
  }
  if (withoutTrailingWhitespace.split(actionText).length !== 2) {
    throw new Error("Hermes stdout contains multiple authoritative actions");
  }
  const prefix = withoutTrailingWhitespace.slice(0, -actionText.length);
  if (/[{}]/u.test(prefix)) throw new Error("Hermes stdout reasoning prefix contains JSON delimiters");
  const header = prefix.match(/^\s*┌─ Reasoning ─+┐\n/u);
  if (!header) throw new Error("Hermes stdout has an unrecognized prefix");
  const reasoningTokens = String(reasoningText ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((left, right) => right.length - left.length);
  if (reasoningTokens.length === 0) throw new Error("Hermes stdout reasoning prefix is not bound to exported reasoning");
  let remainder = prefix.slice(header[0].length);
  let tokenCount = 0;
  while (remainder.length > 0) {
    remainder = remainder.replace(/^[\t\n ]+/u, "");
    if (remainder.length === 0) break;
    const token = reasoningTokens.find((candidate) => remainder.startsWith(candidate));
    if (!token) throw new Error("Hermes stdout reasoning prefix differs from exported reasoning");
    remainder = remainder.slice(token.length);
    tokenCount += 1;
    if (tokenCount > 4096) throw new Error("Hermes stdout reasoning prefix is excessively repeated");
  }
  if (tokenCount === 0) throw new Error("Hermes stdout reasoning prefix is empty");
  return true;
}

export function buildHermesInvocationReceipt({ workOrder, workOrderSha256, profile, promptBytes, systemPromptBytes, rawOutputBytes, actionBytes, action, sessionId, startedAt, completedAt, sessionExportBytes }) {
  const projection = {
    schemaVersion: "hermes-invocation-receipt/v1",
    status: "completed",
    workOrderId: workOrder.workOrderId,
    workOrderSha256,
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
      transport: "codex_responses",
      toolsCount: 0,
      toolCallCount: 0,
      transportPolicy: HERMES_CONTROL_TRANSPORT_POLICY,
    },
    invocation: { sessionId, startedAt, completedAt, exitCode: 0 },
    promptSha256: sha256Bytes(promptBytes),
    systemPrompt: {
      sha256: sha256Bytes(systemPromptBytes),
      byteLength: systemPromptBytes.byteLength,
    },
    rawOutput: {
      sha256: sha256Bytes(rawOutputBytes),
      byteLength: rawOutputBytes.byteLength,
    },
    action: {
      sha256: sha256Bytes(actionBytes),
      byteLength: actionBytes.byteLength,
      textSha256: action.guidanceSha256,
    },
    sessionExport: {
      sha256: sha256Bytes(sessionExportBytes),
      byteLength: sessionExportBytes.byteLength,
    },
  };
  return {
    ...projection,
    receiptSelfHash: sha256Bytes(Buffer.from(canonicalStringify(projection), "utf8")),
  };
}

export function validateHermesInvocationReceipt(bytes, {
  workOrder,
  workOrderSha256,
  profile,
  promptBytes,
  systemPromptBytes,
  rawOutputBytes,
  actionBytes,
  action,
  sessionId,
  sessionExportBytes,
}) {
  const receipt = parseJsonBytes(bytes, "Hermes invocation receipt");
  if (!bytes.equals(Buffer.from(canonicalStringify(receipt), "utf8"))) {
    throw new Error("Hermes invocation receipt bytes are not canonical");
  }
  if (!isObject(receipt)
    || receipt.schemaVersion !== "hermes-invocation-receipt/v1"
    || receipt.status !== "completed"
    || !hasText(receipt.invocation?.startedAt)
    || !hasText(receipt.invocation?.completedAt)
    || Number.isNaN(Date.parse(receipt.invocation.startedAt))
    || Number.isNaN(Date.parse(receipt.invocation.completedAt))) {
    throw new Error("Hermes invocation receipt is not a completed strict receipt");
  }
  const requiresTransportPolicy = workOrder?.schemaVersion === 2
    && workOrder?.capability === "agent-operate"
    && workOrder?.executionMode === "promotion-canary"
    && OPAQUE_BLIND_PAIR_ID.test(workOrder?.modeEvidence?.canaryIsolation?.pairId ?? "");
  if (requiresTransportPolicy && !Object.hasOwn(receipt.runtime ?? {}, "transportPolicy")) {
    throw new Error("opaque blind-canary Hermes invocation receipt requires transport policy attestation");
  }
  let expected = buildHermesInvocationReceipt({
    workOrder,
    workOrderSha256,
    profile,
    promptBytes,
    systemPromptBytes,
    rawOutputBytes,
    actionBytes,
    action,
    sessionId,
    startedAt: receipt.invocation.startedAt,
    completedAt: receipt.invocation.completedAt,
    sessionExportBytes,
  });
  // v1 receipts emitted before transport-policy attestation remain valid. New
  // receipts are distinguished by the additive runtime field and must bind the
  // exact current policy through the existing receipt self-hash.
  if (!Object.hasOwn(receipt.runtime ?? {}, "transportPolicy")) {
    const { transportPolicy: _transportPolicy, ...historicalRuntime } = expected.runtime;
    const { receiptSelfHash: _receiptSelfHash, ...expectedProjection } = expected;
    const historicalProjection = { ...expectedProjection, runtime: historicalRuntime };
    expected = {
      ...historicalProjection,
      receiptSelfHash: sha256Bytes(Buffer.from(canonicalStringify(historicalProjection), "utf8")),
    };
  }
  if (canonicalStringify(receipt) !== canonicalStringify(expected)) {
    throw new Error("Hermes invocation receipt does not match the exact invocation artifacts");
  }
  return receipt;
}

export function buildAgentOperationEnvelope({ workOrderBytes, workOrderSha256, actionBytes, action, receiptBytes, canaryIsolationReceipt = null }) {
  return {
    schemaVersion: "inkos-agent-operation-request/v1",
    workOrder: {
      encoding: "base64",
      bytes: workOrderBytes.toString("base64"),
      sha256: workOrderSha256,
      byteLength: workOrderBytes.byteLength,
    },
    hermesAction: {
      encoding: "base64",
      bytes: actionBytes.toString("base64"),
      sha256: sha256Bytes(actionBytes),
      byteLength: actionBytes.byteLength,
      textSha256: action.guidanceSha256,
    },
    hermesReceipt: {
      encoding: "base64",
      bytes: receiptBytes.toString("base64"),
      sha256: sha256Bytes(receiptBytes),
      byteLength: receiptBytes.byteLength,
    },
    ...(canaryIsolationReceipt ? {
      canaryIsolationReceipt: {
        encoding: "base64",
        bytes: canaryIsolationReceipt.bytes.toString("base64"),
        sha256: canaryIsolationReceipt.sha256,
        byteLength: canaryIsolationReceipt.byteLength,
        selfHash: canaryIsolationReceipt.selfHash,
      },
    } : {}),
  };
}
