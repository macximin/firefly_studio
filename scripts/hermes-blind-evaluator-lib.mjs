import { isFireflyHighRuntime } from "./firefly-runtime-lib.mjs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/;
const REGISTRY_KEYS = new Set(["schemaVersion", "profile"]);
const PROFILE_KEYS = new Set([
  "profileId", "role", "authority", "provider", "model", "reasoning",
  "codingContext", "openaiRuntime", "cliToolsets", "toolsCount", "skillsPolicy",
  "configSha256", "soulSha256",
]);
const EXPECTED = Object.freeze({
  schemaVersion: "hermes-blind-evaluator-profile/v1",
  profileId: "inkos_blind_evaluator",
  role: "blind-commercial-evaluator",
  authority: "evaluation-only",
  provider: "openai-codex",
  codingContext: false,
  openaiRuntime: "auto",
  toolsCount: 0,
  skillsPolicy: "none",
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, keys, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) if (!keys.has(key)) errors.push(`${label} has unknown field: ${key}`);
  for (const key of keys) if (!(key in value)) errors.push(`${label}.${key} is required`);
}

export function validateHermesBlindEvaluatorRegistry(registry) {
  const errors = [];
  exactKeys(registry, REGISTRY_KEYS, "blind evaluator registry", errors);
  if (!isObject(registry)) return errors;
  if (registry.schemaVersion !== EXPECTED.schemaVersion) errors.push("blind evaluator registry schemaVersion is invalid");
  exactKeys(registry.profile, PROFILE_KEYS, "blind evaluator profile", errors);
  const profile = registry.profile;
  if (!isObject(profile)) return errors;
  for (const key of [
    "profileId", "role", "authority", "provider",
    "codingContext", "openaiRuntime", "toolsCount", "skillsPolicy",
  ]) {
    if (profile[key] !== EXPECTED[key]) errors.push(`blind evaluator profile ${key} must be ${JSON.stringify(EXPECTED[key])}`);
  }
  if (!isFireflyHighRuntime(profile.model, profile.reasoning)) errors.push("blind evaluator profile runtime must use a supported Firefly model with supported reasoning");
  if (!Array.isArray(profile.cliToolsets) || profile.cliToolsets.length !== 0) {
    errors.push("blind evaluator profile cliToolsets must be an exact empty array");
  }
  if (!SHA256.test(profile.configSha256 ?? "") || !SHA256.test(profile.soulSha256 ?? "")) {
    errors.push("blind evaluator profile configSha256 and soulSha256 are required");
  }
  return errors;
}

async function assertRealDirectory(path, label) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory: ${path}`);
}

async function readStableRegularFile(path, label) {
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
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || BigInt(bytes.byteLength) !== before.size
    ) throw new Error(`${label} changed during readback: ${path}`);
    if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes: ${path}`);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return bytes;
  } finally {
    await handle.close();
  }
}

function defaultConfigGet(profileId, key, executable = "hermes") {
  const result = spawnSync(executable, ["-p", profileId, "config", "get", key], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Hermes evaluator config readback failed for ${key}`);
  const value = result.stdout.trim();
  if (!value) throw new Error(`Hermes evaluator config readback was empty for ${key}`);
  return value;
}

function defaultPromptSize(profileId, executable = "hermes") {
  const result = spawnSync(executable, ["-p", profileId, "prompt-size", "--platform", "cli", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Hermes evaluator prompt-size readback failed");
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("Hermes evaluator prompt-size readback was not JSON");
  }
}

export async function verifyHermesBlindEvaluatorRegistry(registry, options = {}) {
  const errors = validateHermesBlindEvaluatorRegistry(registry);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const profile = registry.profile;
  const hermesRoot = options.hermesRoot ?? join(homedir(), ".hermes");
  const profilesRoot = join(hermesRoot, "profiles");
  await assertRealDirectory(hermesRoot, "Hermes root");
  await assertRealDirectory(profilesRoot, "Hermes profiles root");
  const resolvedProfilesRoot = await realpath(profilesRoot);
  const profileRoot = join(profilesRoot, profile.profileId);
  await assertRealDirectory(profileRoot, "Hermes blind evaluator profile");
  const resolvedProfileRoot = await realpath(profileRoot);
  if (!resolvedProfileRoot.startsWith(`${resolvedProfilesRoot}${sep}`)) {
    throw new Error("Hermes blind evaluator escaped the profiles root");
  }
  const skillsRoot = join(profileRoot, "skills");
  await assertRealDirectory(skillsRoot, "Hermes blind evaluator skills directory");
  if ((await readdir(skillsRoot)).length !== 0) throw new Error("Hermes blind evaluator has installed skills");

  const configBytes = await readStableRegularFile(join(profileRoot, "config.yaml"), "Hermes blind evaluator config");
  const soulBytes = await readStableRegularFile(join(profileRoot, "SOUL.md"), "Hermes blind evaluator Soul");
  const getConfigValue = options.getConfigValue ?? ((profileId, key) => defaultConfigGet(profileId, key, options.hermesExecutable));
  const getPromptSize = options.getPromptSize ?? ((profileId) => defaultPromptSize(profileId, options.hermesExecutable));
  const promptSize = await getPromptSize(profile.profileId);
  const actual = {
    profileId: profile.profileId,
    configSha256: sha256(configBytes),
    soulSha256: sha256(soulBytes),
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
    if (actual[key] !== profile[key]) throw new Error(`Hermes blind evaluator readback mismatch for ${key}`);
  }
  if (!['false', 'off'].includes(actual.codingContext)) throw new Error("Hermes blind evaluator coding context is not off");
  if (actual.openaiRuntime !== profile.openaiRuntime) throw new Error("Hermes blind evaluator openai runtime mismatch");
  if (actual.cliToolsets !== "[]") throw new Error("Hermes blind evaluator CLI toolsets are not empty");
  if (actual.toolsCount !== 0 || promptSize?.model !== profile.model) throw new Error("Hermes blind evaluator prompt exposes an unauthorized model or tools");
  const soulText = new TextDecoder("utf-8", { fatal: true }).decode(soulBytes);
  if (!soulText.includes("Profile ID: `inkos_blind_evaluator`")) throw new Error("Hermes blind evaluator Soul identity mismatch");
  if (!soulText.includes("Never rewrite a manuscript") || !soulText.includes("Never write InkOS canon")) {
    throw new Error("Hermes blind evaluator evaluation-only authority mismatch");
  }
  return actual;
}
