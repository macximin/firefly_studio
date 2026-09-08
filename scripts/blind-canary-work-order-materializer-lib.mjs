import { createHash } from "node:crypto";
import { validateWorkOrder } from "./dispatch-lib.mjs";
import { canonicalStringify, deriveAgentOperateSessionId, validateAgentOperateModeEvidence } from "./hermes-control-lib.mjs";
import {
  canonicalStringify as planCanonicalStringify,
  sha256Bytes,
  validateBlindCanaryBatchConfig,
  validateBlindCanaryBatchPlan,
} from "./blind-canary-batch-plan-lib.mjs";

const APPROVAL_KEYS = new Set([
  "schemaVersion", "approvalId", "batchId", "decision", "actorId", "actorRole", "scope",
  "promotionAuthorized", "manuscriptWinnerSelectionAuthorized", "approvedAt", "batchConfigSha256", "approvalSha256",
]);
const DECISION_KEYS = new Set([
  "schemaVersion", "kind", "decisionId", "actorId", "actorRole", "bookId", "soulId", "soulVersion",
  "status", "createdAt", "adoptionEvidence",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} fields are not exact`);
}

function hashCanonical(value) {
  return sha256Bytes(Buffer.from(planCanonicalStringify(value), "utf8"));
}

function sha256Text(value) {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

function assertApproval(approval, plan, config) {
  exactKeys(approval, APPROVAL_KEYS, "batch owner approval");
  const { approvalSha256, ...unsigned } = approval;
  if (approval.schemaVersion !== "firefly-canary-batch-owner-approval/v1" || approval.batchId !== plan.batchId
    || approval.decision !== "approved" || approval.actorId !== "owner" || approval.actorRole !== "owner"
    || approval.scope !== "candidate-soul-binding-and-nine-pair-preparation-generation-and-independent-evaluation-only"
    || approval.promotionAuthorized !== false || approval.manuscriptWinnerSelectionAuthorized !== false
    || typeof approval.approvalId !== "string" || !approval.approvalId
    || typeof approval.approvedAt !== "string" || Number.isNaN(Date.parse(approval.approvedAt))
    || new Date(approval.approvedAt).toISOString() !== approval.approvedAt
    || approval.batchConfigSha256 !== hashCanonical(config)
    || approvalSha256 !== hashCanonical(unsigned)) {
    throw new Error("batch owner approval is invalid or exceeds the candidate-canary scope");
  }
}

function assertCandidateDecision(decision, pair, authority) {
  exactKeys(decision, DECISION_KEYS, "candidate Soul binding decision");
  if (decision.schemaVersion !== "soul-binding-decision/v2" || decision.kind !== "bind-soul"
    || decision.actorId !== "owner" || decision.actorRole !== "owner" || decision.status !== "candidate"
    || decision.bookId !== pair.bookId || decision.soulId !== pair.soulId || decision.soulVersion !== pair.soulVersion
    || typeof decision.decisionId !== "string" || !decision.decisionId
    || typeof decision.createdAt !== "string" || Number.isNaN(Date.parse(decision.createdAt))) {
    throw new Error("candidate Soul binding decision identity is invalid");
  }
  const evidence = decision.adoptionEvidence;
  if (!isObject(evidence) || evidence.schemaVersion !== "soul-adoption-evidence/v1" || evidence.hqAdoption !== null) {
    throw new Error("candidate Soul binding decision must carry unpromoted v2 adoption evidence");
  }
  const genre = authority.genres.find((item) => item.genreId === pair.genreId);
  if (!genre || evidence.executorSoul?.profileId !== pair.profileId
    || evidence.executorSoul?.configSha256 !== genre.profile.configSha256
    || evidence.executorSoul?.soulSha256 !== genre.profile.soulSha256
    || evidence.executorSoul?.commit !== authority.repositories.hq.commit
    || evidence.referenceLab?.commit !== authority.repositories.referenceLab.commit
    || evidence.writerGenreProfile?.commit !== authority.repositories.inkos.commit
    || evidence.writerSoulPackage?.commit !== authority.repositories.inkos.commit) {
    throw new Error("candidate Soul binding decision evidence does not match the sealed batch authority");
  }
}

function assertPlanAuthority(plan, authority) {
  if (plan.authorities?.hqCommit !== authority.repositories.hq.commit
    || plan.authorities?.inkosCommit !== authority.repositories.inkos.commit
    || plan.authorities?.referenceLabCommit !== authority.repositories.referenceLab.commit
    || plan.authorities?.evaluator?.profileId !== authority.profiles.evaluator.profileId
    || plan.authorities.evaluator.configSha256 !== authority.profiles.evaluator.configSha256
    || plan.authorities.evaluator.soulSha256 !== authority.profiles.evaluator.soulSha256) {
    throw new Error("batch plan authority is stale or cross-bound to another repository/profile set");
  }
}

function makeWorkOrder({ pair, lane, config, approval, authority, adoptionRegistryBytes, isolation }) {
  const genre = authority.genres.find((item) => item.genreId === pair.genreId);
  if (!genre) throw new Error("batch pair genre is not in the sealed authority");
  const isNeutral = lane === "neutral";
  const profile = isNeutral ? authority.profiles.neutral : genre.profile;
  const expectedSoulBinding = isNeutral ? null : isolation.receipt.lanes.genreSoul.expectedSoulBinding;
  if (isNeutral ? isolation.receipt.lanes.neutral.expectedSoulBinding !== null : !isObject(expectedSoulBinding)) {
    throw new Error("sealed canary lane Soul binding is invalid");
  }
  const draft = isNeutral ? pair.workOrderDrafts.neutral : pair.workOrderDrafts.genreSoul;
  const workOrderId = `wo-${pair.pairId}-${isNeutral ? "neutral" : "soul"}`;
  const modeEvidence = {
    lane: isNeutral ? "neutral-baseline" : "genre-soul",
    profileId: profile.profileId,
    profileConfigSha256: profile.configSha256,
    profileLifecycle: profile.lifecycle,
    productionEnabled: profile.productionEnabled,
    adoptionRegistrySha256: sha256Bytes(adoptionRegistryBytes),
    activeMatchingCount: 0,
    soulId: profile.soulId,
    soulVersion: profile.soulVersion,
    soulSha256: profile.soulSha256,
    promotionDecisionSha256: null,
    canaryIsolation: isolation.reference,
  };
  const base = {
    schemaVersion: 2,
    workOrderId,
    idempotencyKey: `agent-operate:${pair.pairId}:${isNeutral ? "neutral" : "soul"}`,
    repo: "inkos",
    capability: "agent-operate",
    bookId: pair.bookId,
    instruction: config.instruction,
    args: { chapterCount: config.chapterCount, targetLength: config.targetLength },
    expectedSoulBinding,
    runtime: { hermesProfile: profile.profileId, model: profile.model, reasoning: profile.reasoning },
    approvalMode: "human",
    approvedInputs: [],
    privateInputs: [],
    executionMode: "promotion-canary",
    modeEvidence,
    requestedAt: approval.approvedAt,
    timeoutMs: config.timeoutMs,
  };
  const sessionId = deriveAgentOperateSessionId(base);
  const instructionSha256 = sha256Text(base.instruction);
  const argsSha256 = sha256Bytes(Buffer.from(canonicalStringify({
    capability: base.capability,
    bookId: base.bookId,
    sessionId,
    args: base.args,
    expectedSoulBinding,
    executionMode: base.executionMode,
    modeEvidence,
    instructionSha256,
  }), "utf8"));
  const workOrder = {
    ...base,
    sessionId,
    ownerDecision: {
      receiptId: approval.approvalId,
      status: "approved",
      instructionSha256,
      argsSha256,
      decidedAt: approval.approvedAt,
    },
  };
  if (draft.pairId !== pair.pairId || draft.blindRunId !== pair.blindRunId || draft.bookId !== pair.bookId
    || draft.instructionSha256 !== instructionSha256 || planCanonicalStringify(draft.args) !== planCanonicalStringify(base.args)
    || draft.timeoutMs !== base.timeoutMs
    || draft.runtime?.model !== base.runtime.model || draft.runtime?.reasoning !== base.runtime.reasoning
    || draft.profileId !== profile.profileId || draft.profileConfigSha256 !== profile.configSha256
    || draft.profileSoulSha256 !== profile.soulSha256
    || (isNeutral ? draft.expectedSoulBinding !== null : draft.expectedSoulBinding !== "from-inkos-canary-receipt")) {
    throw new Error("materialized WorkOrder diverges from its sealed pair draft");
  }
  return workOrder;
}

/**
 * Turns already-prepared InkOS pairs into 18 executable-but-not-executed
 * WorkOrder v2 files.  `isolationByPair` must come from
 * loadVerifiedCanaryCommonSnapshot; this function never invents lane bindings.
 */
export function materializeBlindCanaryWorkOrders({
  plan,
  config,
  approval,
  authority,
  manifest,
  adoptionRegistry,
  adoptionRegistryBytes,
  decisionsByPath,
  isolationByPair,
}) {
  const configErrors = validateBlindCanaryBatchConfig(config);
  if (configErrors.length > 0) throw new Error(configErrors.join("\n"));
  const planErrors = validateBlindCanaryBatchPlan(plan);
  if (planErrors.length > 0) throw new Error(planErrors.join("\n"));
  if (plan.timeoutMs !== config.timeoutMs) throw new Error("batch plan timeoutMs does not match the live owner-approved config");
  assertPlanAuthority(plan, authority);
  assertApproval(approval, plan, config);
  if (!Buffer.isBuffer(adoptionRegistryBytes)) throw new Error("adoption registry bytes are required");
  const workOrders = [];
  for (const pair of plan.pairs) {
    const decisionArtifact = decisionsByPath.get(pair.candidateDecision.path);
    if (!decisionArtifact || decisionArtifact.sha256 !== pair.candidateDecision.sha256
      || decisionArtifact.sizeBytes !== pair.candidateDecision.sizeBytes) {
      throw new Error("candidate Soul binding decision bytes do not match the sealed batch plan");
    }
    assertCandidateDecision(decisionArtifact.value, pair, authority);
    const isolation = isolationByPair.get(pair.pairId);
    if (!isolation || isolation.receipt?.pairId !== pair.pairId || isolation.receipt?.bookId !== pair.bookId
      || isolation.reference?.pairId !== pair.pairId) {
      throw new Error("sealed InkOS common snapshot is missing or cross-pair mismatched");
    }
    const inputs = isolation.receipt.soulBindingInputs;
    const byRole = new Map(inputs?.artifacts?.map((artifact) => [artifact.role, artifact]));
    if (inputs?.soulId !== pair.soulId || inputs?.soulVersion !== pair.soulVersion
      || byRole.get("soul-binding-decision")?.sha256 !== pair.candidateDecision.sha256
      || byRole.get("source-registry-receipt")?.sha256 !== pair.sourceRegistryReceipt.sha256
      || byRole.get("soul-package-manifest")?.sha256 !== authority.genres.find((item) => item.genreId === pair.genreId)?.writerSoulPackage?.packageManifest?.sha256) {
      throw new Error("InkOS common snapshot binding inputs do not match the candidate decision/source/Soul evidence");
    }
    for (const lane of ["neutral", "soul"]) {
      const workOrder = makeWorkOrder({ pair, lane, config, approval, authority, adoptionRegistryBytes, isolation });
      const workOrderErrors = validateWorkOrder(workOrder, manifest);
      if (workOrderErrors.length > 0) throw new Error(`materialized WorkOrder is invalid: ${workOrderErrors.join("; ")}`);
      const modeErrors = validateAgentOperateModeEvidence(workOrder, {
        profileRegistry: authority.profileRegistry,
        neutralRegistry: authority.neutralRegistry,
        adoptionRegistry,
        adoptionRegistryBytes,
      });
      if (modeErrors.length > 0) throw new Error(`materialized WorkOrder authority is invalid: ${modeErrors.join("; ")}`);
      workOrders.push({ pairId: pair.pairId, lane, workOrder });
    }
  }
  if (workOrders.length !== 18) throw new Error("blind canary materialization must produce exactly eighteen WorkOrders");
  return workOrders;
}
