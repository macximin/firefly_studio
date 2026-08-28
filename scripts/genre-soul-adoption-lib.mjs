import { createHash } from "node:crypto";
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

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

export async function verifyGenreSoulAdoptions({ root, registry, profileRegistry }) {
  const errors = validateGenreSoulAdoptionRegistry(registry, profileRegistry);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const absoluteRoot = resolve(root);
  const realRoot = await realpath(root);
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
    receipts.push({
      soulId: entry.soulId,
      soulVersion: entry.soulVersion,
      profileId: entry.profileId,
      decisionId: decision.decisionId,
      decisionSha256: actualDecisionSha256,
      decision: decision.decision,
    });
  }
  return receipts;
}
