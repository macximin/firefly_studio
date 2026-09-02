import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_PROFILE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PROFILE_KEYS = new Set([
  "profileId", "soulId", "soulVersion", "lifecycle", "productionEnabled",
  "promotionDecisionSha256", "provider", "model", "reasoning", "skillsPolicy",
  "configSha256", "soulSha256",
]);
const NEUTRAL_PROFILE_KEYS = new Set([
  "profileId", "soulId", "soulVersion", "lifecycle", "productionEnabled",
  "promotionDecisionSha256", "provider", "model", "reasoning", "skillsPolicy",
  "configSha256", "soulSha256",
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

export function validateHermesProfileRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ["Hermes profile registry must be an object"];
  for (const key of Object.keys(registry)) {
    if (!new Set(["schemaVersion", "profiles"]).has(key)) errors.push(`unknown registry field: ${key}`);
  }
  if (registry.schemaVersion !== "hermes-production-profile-registry/v1") {
    errors.push("Hermes profile registry schemaVersion is invalid");
  }
  if (!Array.isArray(registry.profiles) || registry.profiles.length === 0) {
    errors.push("Hermes profile registry profiles must be a non-empty array");
    return errors;
  }
  const profileIds = new Set();
  const soulIds = new Set();
  for (const [index, profile] of registry.profiles.entries()) {
    const label = `profiles[${index}]`;
    if (!isObject(profile)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    for (const key of Object.keys(profile)) {
      if (!PROFILE_KEYS.has(key)) errors.push(`${label} has unknown field: ${key}`);
    }
    if (!SAFE_PROFILE_ID.test(profile.profileId ?? "")) errors.push(`${label}.profileId is invalid`);
    if (profileIds.has(profile.profileId)) errors.push(`duplicate Hermes profileId: ${profile.profileId}`);
    profileIds.add(profile.profileId);
    if (!hasText(profile.soulId) || profile.soulId.length > 240) errors.push(`${label}.soulId is invalid`);
    if (soulIds.has(profile.soulId)) errors.push(`duplicate Hermes soulId: ${profile.soulId}`);
    soulIds.add(profile.soulId);
    if (!hasText(profile.soulVersion) || profile.soulVersion.length > 240) errors.push(`${label}.soulVersion is invalid`);
    if (!["candidate", "promoted"].includes(profile.lifecycle)) errors.push(`${label}.lifecycle is invalid`);
    if (typeof profile.productionEnabled !== "boolean") errors.push(`${label}.productionEnabled must be boolean`);
    if (!["openai-codex"].includes(profile.provider)) errors.push(`${label}.provider is invalid`);
    if (!hasText(profile.model) || !hasText(profile.reasoning)) errors.push(`${label} model and reasoning are required`);
    if (profile.skillsPolicy !== "none") errors.push(`${label}.skillsPolicy must be none`);
    if (!SHA256.test(profile.configSha256 ?? "") || !SHA256.test(profile.soulSha256 ?? "")) {
      errors.push(`${label} configSha256 and soulSha256 are required`);
    }
    if (profile.lifecycle === "candidate" && (profile.productionEnabled || profile.promotionDecisionSha256 !== null)) {
      errors.push(`${label} candidate profiles must remain disabled without a promotion decision`);
    }
    if (profile.lifecycle === "promoted" && (!profile.productionEnabled || !SHA256.test(profile.promotionDecisionSha256 ?? ""))) {
      errors.push(`${label} promoted profiles require an enabled, hash-bound human decision`);
    }
  }
  return errors;
}

async function assertRealDirectory(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory: ${path}`);
}

async function readRealFile(path, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a real regular file: ${path}`);
  const bytes = await readFile(path);
  if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes: ${path}`);
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return bytes;
}

function defaultConfigGet(profileId, key, executable = "hermes") {
  const result = spawnSync(executable, ["-p", profileId, "config", "get", key], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Hermes config readback failed for ${profileId}/${key}`);
  const value = result.stdout.trim();
  if (!value) throw new Error(`Hermes config readback was empty for ${profileId}/${key}`);
  return value;
}

function defaultPromptSize(profileId, executable = "hermes") {
  const result = spawnSync(executable, ["-p", profileId, "prompt-size", "--platform", "cli", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Hermes prompt-size readback failed for ${profileId}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Hermes prompt-size readback was not JSON for ${profileId}`);
  }
}

export function validateHermesNeutralProfileRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ["Hermes neutral profile registry must be an object"];
  for (const key of Object.keys(registry)) {
    if (!["schemaVersion", "profile"].includes(key)) errors.push(`unknown neutral registry field: ${key}`);
  }
  if (registry.schemaVersion !== "hermes-neutral-production-profile/v1") {
    errors.push("Hermes neutral profile registry schemaVersion is invalid");
  }
  const profile = registry.profile;
  if (!isObject(profile)) return [...errors, "Hermes neutral profile is required"];
  for (const key of Object.keys(profile)) {
    if (!NEUTRAL_PROFILE_KEYS.has(key)) errors.push(`neutral profile has unknown field: ${key}`);
  }
  if (!SAFE_PROFILE_ID.test(profile.profileId ?? "")) errors.push("neutral profile.profileId is invalid");
  if (!hasText(profile.soulId) || !hasText(profile.soulVersion)) errors.push("neutral profile Soul identity is invalid");
  if (profile.lifecycle !== "baseline") errors.push("neutral profile lifecycle must be baseline");
  if (profile.productionEnabled !== false || profile.promotionDecisionSha256 !== null) {
    errors.push("neutral profile must remain disabled without a promotion decision");
  }
  if (profile.provider !== "openai-codex" || profile.model !== "gpt-5.6-sol" || profile.reasoning !== "high") {
    errors.push("neutral profile runtime must be openai-codex/gpt-5.6-sol/high");
  }
  if (profile.skillsPolicy !== "none") errors.push("neutral profile skillsPolicy must be none");
  if (!SHA256.test(profile.configSha256 ?? "") || !SHA256.test(profile.soulSha256 ?? "")) {
    errors.push("neutral profile configSha256 and soulSha256 are required");
  }
  return errors;
}

async function verifyHermesProfiles(profiles, options = {}) {
  const hermesRoot = options.hermesRoot ?? join(homedir(), ".hermes");
  const profilesRoot = join(hermesRoot, "profiles");
  await assertRealDirectory(hermesRoot, "Hermes root");
  await assertRealDirectory(profilesRoot, "Hermes profiles root");
  const resolvedProfilesRoot = await realpath(profilesRoot);
  const getConfigValue = options.getConfigValue ?? ((profileId, key) => defaultConfigGet(profileId, key, options.hermesExecutable));
  const getPromptSize = options.getPromptSize ?? ((profileId) => defaultPromptSize(profileId, options.hermesExecutable));
  const receipts = [];
  for (const profile of profiles) {
    const profileRoot = join(profilesRoot, profile.profileId);
    await assertRealDirectory(profileRoot, `Hermes profile ${profile.profileId}`);
    const resolvedProfileRoot = await realpath(profileRoot);
    if (!resolvedProfileRoot.startsWith(`${resolvedProfilesRoot}${sep}`)) {
      throw new Error(`Hermes profile escaped the profiles root: ${profile.profileId}`);
    }
    const configBytes = await readRealFile(join(profileRoot, "config.yaml"), "Hermes config");
    const soulBytes = await readRealFile(join(profileRoot, "SOUL.md"), "Hermes Soul");
    const markerBytes = await readRealFile(join(profileRoot, ".no-bundled-skills"), "Hermes no-skills marker");
    await assertRealDirectory(join(profileRoot, "skills"), "Hermes skills directory");
    const skillEntries = await readdir(join(profileRoot, "skills"));
    if (skillEntries.length > 0) throw new Error(`Hermes candidate profile has installed skills: ${profile.profileId}`);
    const promptSize = await getPromptSize(profile.profileId);
    const actual = {
      configSha256: sha256(configBytes),
      soulSha256: sha256(soulBytes),
      markerSha256: sha256(markerBytes),
      provider: await getConfigValue(profile.profileId, "model.provider"),
      model: await getConfigValue(profile.profileId, "model.default"),
      reasoning: await getConfigValue(profile.profileId, "agent.reasoning_effort"),
      codingContext: String(await getConfigValue(profile.profileId, "agent.coding_context")),
      openaiRuntime: String(await getConfigValue(profile.profileId, "model.openai_runtime")),
      cliToolsets: String(await getConfigValue(profile.profileId, "platform_toolsets.cli")),
      toolsCount: promptSize?.tools?.count,
      promptSizeSha256: sha256(Buffer.from(JSON.stringify(promptSize))),
    };
    for (const key of ["configSha256", "soulSha256", "provider", "model", "reasoning"]) {
      if (actual[key] !== profile[key]) throw new Error(`Hermes profile readback mismatch for ${profile.profileId}/${key}`);
    }
    if (!['false', 'off'].includes(actual.codingContext)) throw new Error(`Hermes profile coding context is not off: ${profile.profileId}`);
    if (actual.openaiRuntime !== "auto") throw new Error(`Hermes profile openai runtime is not auto: ${profile.profileId}`);
    if (actual.cliToolsets !== "[]") throw new Error(`Hermes profile CLI toolsets are not empty: ${profile.profileId}`);
    if (actual.toolsCount !== 0) throw new Error(`Hermes profile prompt exposes tools: ${profile.profileId}`);
    if (promptSize?.model !== profile.model) throw new Error(`Hermes prompt-size model mismatch: ${profile.profileId}`);
    const soulText = new TextDecoder("utf-8", { fatal: true }).decode(soulBytes);
    for (const identityOrAuthorityLine of [
      `Profile ID: \`${profile.profileId}\``,
      `Soul ID: \`${profile.soulId}\``,
      `Soul version: \`${profile.soulVersion}\``,
      "이 프로필은 InkOS 캐논을 직접 쓰지 않는다.",
      "Book, Arc, Rail, Chapter, review와 revision의 실행 주체는 InkOS다.",
    ]) {
      if (!soulText.includes(identityOrAuthorityLine)) {
        throw new Error(`Hermes Soul immutable identity/authority mismatch for ${profile.profileId}: ${identityOrAuthorityLine}`);
      }
    }
    receipts.push({
      profileId: profile.profileId,
      soulId: profile.soulId,
      soulVersion: profile.soulVersion,
      lifecycle: profile.lifecycle,
      productionEnabled: profile.productionEnabled,
      ...actual,
    });
  }
  return receipts;
}

export async function verifyHermesProfileRegistry(registry, options = {}) {
  const errors = validateHermesProfileRegistry(registry);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return verifyHermesProfiles(registry.profiles, options);
}

export async function verifyHermesNeutralProfileRegistry(registry, options = {}) {
  const errors = validateHermesNeutralProfileRegistry(registry);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return (await verifyHermesProfiles([registry.profile], options))[0];
}
